use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::Arc;
use tokio::sync::mpsc;

pub struct AudioCapture {
    stream: Option<cpal::Stream>,
}

impl AudioCapture {
    pub fn new() -> Self {
        AudioCapture { stream: None }
    }

    /// Start capturing audio from the default input device
    /// Returns a receiver that yields audio samples as i16 PCM data
    pub fn start(&mut self) -> Result<mpsc::Receiver<Vec<i16>>, String> {
        let host = cpal::default_host();

        let device = host
            .default_input_device()
            .ok_or("No input device available")?;

        println!("Using input device: {}", device.name().unwrap_or_default());

        // We want 16kHz mono for SONIOX
        let config = cpal::StreamConfig {
            channels: 1,
            sample_rate: cpal::SampleRate(16000),
            buffer_size: cpal::BufferSize::Default,
        };

        let (tx, rx) = mpsc::channel::<Vec<i16>>(100);

        let err_fn = |err| eprintln!("Audio stream error: {}", err);

        let stream = device
            .build_input_stream(
                &config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    // Convert f32 samples to i16
                    let samples: Vec<i16> = data
                        .iter()
                        .map(|&sample| {
                            // Clamp and convert to i16
                            let clamped = sample.clamp(-1.0, 1.0);
                            (clamped * 32767.0) as i16
                        })
                        .collect();

                    // Send samples through channel
                    let _ = tx.try_send(samples);
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("Failed to build input stream: {}", e))?;

        stream.play().map_err(|e| format!("Failed to start stream: {}", e))?;

        self.stream = Some(stream);

        Ok(rx)
    }

    /// Stop capturing audio
    pub fn stop(&mut self) {
        if let Some(stream) = self.stream.take() {
            drop(stream);
        }
    }
}

impl Drop for AudioCapture {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Helper function to convert i16 samples to bytes for WebSocket transmission
pub fn samples_to_bytes(samples: &[i16]) -> Vec<u8> {
    samples
        .iter()
        .flat_map(|&sample| sample.to_le_bytes())
        .collect()
}
