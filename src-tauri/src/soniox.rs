use crate::audio::samples_to_bytes;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

// SONIOX real-time WebSocket endpoint (docs: /stt/api-reference/websocket-api)
const SONIOX_WS_URL: &str = "wss://stt-rt.soniox.com/transcribe-websocket";
const SONIOX_MODEL: &str = "stt-rt-preview";

// WebSocket configuration payload
#[derive(Serialize)]
struct SonioxConfig {
    api_key: String,
    model: String,
    audio_format: String,
    sample_rate: u32,
    num_channels: u32,
}

#[derive(Deserialize, Debug)]
struct SonioxToken {
    #[serde(default)]
    text: String,
    #[serde(default)]
    is_final: bool,
}

#[derive(Deserialize, Debug)]
struct SonioxResponse {
    #[serde(default)]
    tokens: Vec<SonioxToken>,
    #[serde(default)]
    finished: bool,
    #[serde(default)]
    error_code: Option<u32>,
    #[serde(default)]
    error_message: Option<String>,
}

#[derive(Clone, Serialize)]
struct TranscriptionEvent {
    text: String,
    is_final: bool,
}

/// Start transcription with SONIOX
pub async fn start_transcription(
    app: AppHandle,
    api_key: String,
    is_recording: Arc<Mutex<bool>>,
    latest_transcription: Arc<Mutex<String>>,
) -> Result<(), String> {
    // Connect to SONIOX WebSocket
    let (ws_stream, _) = connect_async(SONIOX_WS_URL)
        .await
        .map_err(|e| format!("Failed to connect to SONIOX: {}", e))?;

    println!("Connected to SONIOX WebSocket: {}", SONIOX_WS_URL);

    let (mut write, mut read) = ws_stream.split();

    // Send configuration
    let config = SonioxConfig {
        api_key,
        model: SONIOX_MODEL.to_string(),
        audio_format: "pcm_s16le".to_string(),
        sample_rate: 16000,
        num_channels: 1,
    };

    let config_json = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    write
        .send(Message::Text(config_json))
        .await
        .map_err(|e| format!("Failed to send config: {}", e))?;

    println!("Sent SONIOX configuration (model={}, format={})", SONIOX_MODEL, "pcm_s16le");

    // Send a small silence frame to avoid first-audio timeouts.
    let priming_silence = vec![0i16; 1600];
    write
        .send(Message::Binary(samples_to_bytes(&priming_silence)))
        .await
        .map_err(|e| format!("Failed to send priming audio: {}", e))?;

    // Create channel for audio samples
    let (audio_tx, mut audio_rx) = tokio::sync::mpsc::channel::<Vec<i16>>(100);

    // Use AtomicBool for thread-safe recording state check (std::thread can't use tokio runtime)
    let audio_recording_flag = Arc::new(AtomicBool::new(true));
    let audio_flag_clone = audio_recording_flag.clone();

    // Start audio capture in a blocking thread
    std::thread::spawn(move || {
        let host = cpal::default_host();
        let device = match host.default_input_device() {
            Some(d) => d,
            None => {
                eprintln!("No input device available");
                return;
            }
        };

        // Get the default input config (usually 44100 or 48000 Hz)
        let supported_config = match device.default_input_config() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to get default input config: {}", e);
                return;
            }
        };

        let sample_rate = supported_config.sample_rate().0;
        let channels = supported_config.channels();
        println!("Using audio config: {} Hz, {} channels", sample_rate, channels);

        let config = cpal::StreamConfig {
            channels,
            sample_rate: cpal::SampleRate(sample_rate),
            buffer_size: cpal::BufferSize::Default,
        };

        let tx = audio_tx;
        let resample_ratio = sample_rate as f32 / 16000.0;

        let stream = device
            .build_input_stream(
                &config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    // Convert to mono if stereo
                    let mono_data: Vec<f32> = if channels > 1 {
                        data.chunks(channels as usize)
                            .map(|chunk| chunk.iter().sum::<f32>() / channels as f32)
                            .collect()
                    } else {
                        data.to_vec()
                    };

                    // Simple resampling: take every Nth sample to downsample to 16kHz
                    let resampled: Vec<i16> = mono_data
                        .iter()
                        .enumerate()
                        .filter_map(|(i, &sample)| {
                            let target_idx = (i as f32 / resample_ratio) as usize;
                            let current_idx = ((i as f32 - 1.0).max(0.0) / resample_ratio) as usize;
                            if target_idx != current_idx || i == 0 {
                                let clamped = sample.clamp(-1.0, 1.0);
                                Some((clamped * 32767.0) as i16)
                            } else {
                                None
                            }
                        })
                        .collect();

                    if !resampled.is_empty() {
                        let _ = tx.try_send(resampled);
                    }
                },
                |err| eprintln!("Audio stream error: {}", err),
                None,
            );

        match stream {
            Ok(s) => {
                if let Err(e) = s.play() {
                    eprintln!("Failed to start audio stream: {}", e);
                    return;
                }
                println!("Audio capture started");

                // Keep the stream alive while recording
                while audio_flag_clone.load(Ordering::Relaxed) {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                println!("Audio capture stopped");
            }
            Err(e) => {
                eprintln!("Failed to create audio stream: {}", e);
            }
        }
    });

    // Spawn task to receive transcriptions
    let app_clone = app.clone();
    let is_recording_clone = is_recording.clone();
    let transcription_clone = latest_transcription.clone();

    let receive_task = tokio::spawn(async move {
        let mut full_text = String::new();

        while let Some(msg) = read.next().await {
            if !*is_recording_clone.lock().await {
                break;
            }

            match msg {
                Ok(Message::Text(text)) => {
                    match serde_json::from_str::<SonioxResponse>(&text) {
                        Ok(response) => {
                            // Check for errors
                            if response.error_code.is_some() || response.error_message.is_some() {
                                let code = response.error_code.unwrap_or_default();
                                let msg = response
                                    .error_message
                                    .unwrap_or_else(|| "Unknown SONIOX error".to_string());
                                let formatted = format!("SONIOX error {}: {}", code, msg);
                                eprintln!("{}", formatted);
                                let _ = app_clone.emit("transcription-error", formatted);
                                break;
                            }

                            // Check if finished
                            if response.finished {
                                println!("SONIOX transcription finished");
                                break;
                            }

                            // Process tokens - accumulate full text properly
                            if !response.tokens.is_empty() {
                                let mut non_final_text = String::new();

                                for token in &response.tokens {
                                    if token.is_final {
                                        // Add final tokens to permanent collection
                                        full_text.push_str(&token.text);
                                    } else {
                                        // Collect non-final tokens separately
                                        non_final_text.push_str(&token.text);
                                    }
                                }

                                // Display = all final text so far + current non-final tokens
                                let display_text = format!("{}{}", full_text, non_final_text);

                                // Store in shared state for direct access
                                *transcription_clone.lock().await = display_text.clone();

                                // Emit for popup display (full transcription)
                                println!("Emitting transcription: {}", display_text);
                                let _ = app_clone.emit(
                                    "transcription",
                                    TranscriptionEvent {
                                        text: display_text,
                                        is_final: false,
                                    },
                                );
                            }
                        }
                        Err(e) => {
                            eprintln!("Failed to parse SONIOX response: {} - {}", e, text);
                        }
                    }
                }
                Ok(Message::Close(frame)) => {
                    if let Some(frame) = frame {
                        println!(
                            "SONIOX connection closed (code={}, reason={})",
                            frame.code, frame.reason
                        );
                    } else {
                        println!("SONIOX connection closed");
                    }
                    break;
                }
                Err(e) => {
                    eprintln!("WebSocket error: {}", e);
                    break;
                }
                _ => {}
            }
        }

        println!("SONIOX stream ended");
        full_text
    });

    // Send audio data
    let is_recording_send = is_recording.clone();

    let mut sent_audio_frame = false;

    let mut stopped_by_flag = false;

    while *is_recording_send.lock().await {
        tokio::select! {
            Some(samples) = audio_rx.recv() => {
                let bytes = samples_to_bytes(&samples);
                if let Err(e) = write.send(Message::Binary(bytes)).await {
                    eprintln!("Failed to send audio: {}", e);
                    break;
                }
                if !sent_audio_frame {
                    sent_audio_frame = true;
                    println!("Sent first audio frame");
                }
            }
            _ = tokio::time::sleep(tokio::time::Duration::from_millis(100)) => {
                if !*is_recording_send.lock().await {
                    break;
                }
            }
        }
    }
    stopped_by_flag = true;

    if stopped_by_flag {
        println!("Recording flag set to false; stopping audio send");
    }

    // Stop the audio capture thread
    audio_recording_flag.store(false, Ordering::Relaxed);

    // Close WebSocket
    let _ = write.send(Message::Close(None)).await;

    // Wait for receive task
    let final_text = receive_task.await.unwrap_or_default();

    // Emit final transcription
    let _ = app.emit(
        "transcription-complete",
        TranscriptionEvent {
            text: final_text.trim().to_string(),
            is_final: true,
        },
    );

    Ok(())
}
