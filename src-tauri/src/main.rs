// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio;
mod keyboard;
mod soniox;

use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tokio::sync::Mutex;

// App state to track recording status
#[derive(Clone)]
pub struct AppState {
    pub is_recording: Arc<Mutex<bool>>,
    pub soniox_api_key: Arc<Mutex<String>>,
    pub last_start_ms: Arc<AtomicU64>,
    pub latest_transcription: Arc<Mutex<String>>,
}

#[derive(Clone, Serialize)]
struct RecordingStateEvent {
    is_recording: bool,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// Command to start recording
#[tauri::command]
async fn start_recording(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    // Validate API key before switching to recording state.
    let api_key = state.soniox_api_key.lock().await.clone();
    if api_key.is_empty() {
        return Err("SONIOX API key not set".to_string());
    }

    let mut is_recording = state.is_recording.lock().await;
    if *is_recording {
        return Ok(());
    }
    *is_recording = true;
    drop(is_recording);
    state.last_start_ms.store(now_millis(), Ordering::Relaxed);

    // Emit event to frontend
    app.emit(
        "recording-state",
        RecordingStateEvent { is_recording: true },
    )
    .map_err(|e| e.to_string())?;

    // Start audio capture and streaming
    let app_clone = app.clone();
    let state_recording = state.is_recording.clone();
    let state_transcription = state.latest_transcription.clone();

    tokio::spawn(async move {
        match soniox::start_transcription(
            app_clone.clone(),
            api_key,
            state_recording.clone(),
            state_transcription.clone(),
        )
        .await
        {
            Ok(_) => {}
            Err(e) => {
                eprintln!("Transcription error: {}", e);
                *state_recording.lock().await = false;
                let _ = app_clone.emit(
                    "recording-state",
                    RecordingStateEvent {
                        is_recording: false,
                    },
                );
                let _ = app_clone.emit("transcription-error", e.to_string());
            }
        }
    });

    Ok(())
}

// Command to stop recording
#[tauri::command]
async fn stop_recording(
    app: AppHandle,
    state: State<'_, AppState>,
    reason: Option<String>,
) -> Result<(), String> {
    let reason = reason.unwrap_or_else(|| "unknown".to_string());
    println!("stop_recording invoked (reason={})", reason);
    let mut is_recording = state.is_recording.lock().await;
    if !*is_recording {
        println!("stop_recording ignored; already stopped");
        return Ok(());
    }

    *is_recording = false;

    app.emit(
        "recording-state",
        RecordingStateEvent {
            is_recording: false,
        },
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// Command to force stop and hide popup immediately (used by Cancel/Escape).
#[tauri::command]
async fn cancel_and_hide(
    app: AppHandle,
    state: State<'_, AppState>,
    reason: Option<String>,
) -> Result<(), String> {
    let reason = reason.unwrap_or_else(|| "ui:force-cancel".to_string());
    println!("cancel_and_hide invoked (reason={})", reason);

    *state.is_recording.lock().await = false;
    *state.latest_transcription.lock().await = String::new();
    state.last_start_ms.store(0, Ordering::Relaxed);

    let _ = app.emit(
        "recording-state",
        RecordingStateEvent {
            is_recording: false,
        },
    );
    let _ = app.emit("finish-and-type", ());

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focusable(true);
        window.hide().map_err(|e| e.to_string())?;
    }

    Ok(())
}

// Command to type text at cursor
#[tauri::command]
async fn type_text(text: String) -> Result<(), String> {
    println!("type_text called ({} chars)", text.chars().count());
    let result = keyboard::type_text(&text).map_err(|e| e.to_string());
    match &result {
        Ok(_) => println!("type_text succeeded"),
        Err(e) => println!("type_text failed: {}", e),
    }
    result
}

// Command to set API key
#[tauri::command]
async fn set_api_key(state: State<'_, AppState>, api_key: String) -> Result<(), String> {
    let mut key = state.soniox_api_key.lock().await;
    *key = api_key;
    Ok(())
}

// Command to get recording state
#[tauri::command]
async fn get_recording_state(state: State<'_, AppState>) -> Result<bool, String> {
    let is_recording = state.is_recording.lock().await;
    Ok(*is_recording)
}

// Command to show the window
#[tauri::command]
async fn show_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focusable(true);
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Command to hide the window
#[tauri::command]
async fn hide_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focusable(true);
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppState {
            is_recording: Arc::new(Mutex::new(false)),
            soniox_api_key: Arc::new(Mutex::new(String::new())),
            last_start_ms: Arc::new(AtomicU64::new(0)),
            latest_transcription: Arc::new(Mutex::new(String::new())),
        })
        .setup(|app| {
            // Create system tray menu
            let quit = MenuItem::with_id(app, "quit", "إغلاق الناسخ المحلي", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;

            // Create tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    if event.id == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.set_focusable(true);
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Register global shortcut (Alt+Shift+O)
            let shortcut = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyO);
            let app_handle = app.handle().clone();

            // Debounce: track last shortcut time to prevent double-firing
            let last_shortcut_time = Arc::new(AtomicU64::new(0));
            let last_shortcut_clone = last_shortcut_time.clone();
            let shortcut_is_down = Arc::new(AtomicBool::new(false));
            let shortcut_is_down_clone = shortcut_is_down.clone();

            // Get state for shortcut handler
            let shortcut_state = app.state::<AppState>().inner().clone();

            app.global_shortcut()
                .on_shortcut(shortcut, move |_app, _shortcut, event| {
                    if event.state == ShortcutState::Released {
                        shortcut_is_down_clone.store(false, Ordering::Relaxed);
                        return;
                    }

                    if event.state == ShortcutState::Pressed {
                        // Ignore auto-repeat while the shortcut is held down.
                        if shortcut_is_down_clone.swap(true, Ordering::Relaxed) {
                            println!("Shortcut press ignored (key held)");
                            return;
                        }

                        // Debounce: ignore if less than 500ms since last press
                        let now = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap()
                            .as_millis() as u64;
                        let last = last_shortcut_clone.load(Ordering::Relaxed);
                        if now - last < 500 {
                            println!("Shortcut debounced (too fast)");
                            return;
                        }
                        last_shortcut_clone.store(now, Ordering::Relaxed);

                        let app = app_handle.clone();
                        let state = shortcut_state.clone();

                        tauri::async_runtime::spawn(async move {
                            // Check recording state, not window visibility
                            let is_recording = *state.is_recording.lock().await;
                            println!("Shortcut pressed, is_recording: {}", is_recording);

                            if is_recording {
                                // Stop recording
                                println!("Stopping recording...");
                                *state.is_recording.lock().await = false;
                                let _ = app.emit(
                                    "recording-state",
                                    RecordingStateEvent {
                                        is_recording: false,
                                    },
                                );

                                // Get the transcription text BEFORE hiding window
                                let text = state.latest_transcription.lock().await.clone();
                                println!("Got transcription for typing: {} chars", text.len());

                                // Hide window first
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.set_focusable(true);
                                    let _ = window.hide();
                                }

                                // Clear the transcription state
                                *state.latest_transcription.lock().await = String::new();

                                // Emit event for frontend to clear its state
                                let _ = app.emit("finish-and-type", ());

                                // Type the text directly from Rust
                                if !text.trim().is_empty() {
                                    // Let user release Alt/Shift/O and OS restore focus.
                                    tokio::time::sleep(tokio::time::Duration::from_millis(280))
                                        .await;

                                    match keyboard::type_text(text.trim()) {
                                        Ok(_) => println!("Text typed successfully!"),
                                        Err(e) => eprintln!("Failed to type text: {}", e),
                                    }
                                } else {
                                    println!("No text to type (empty transcription)");
                                }
                            } else {
                                // Start recording
                                println!("Starting recording...");
                                let api_key = state.soniox_api_key.lock().await.clone();
                                if api_key.is_empty() {
                                    // Show window for API key setup
                                    println!("No API key, showing setup window");
                                    if let Some(window) = app.get_webview_window("main") {
                                        let _ = window.set_focusable(true);
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }
                                    return;
                                }

                                // Show a small popup while recording (don't steal focus!)
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.set_focusable(false);
                                    let _ = window.show();
                                }

                                *state.is_recording.lock().await = true;
                                state.last_start_ms.store(now_millis(), Ordering::Relaxed);
                                let _ = app.emit(
                                    "recording-state",
                                    RecordingStateEvent { is_recording: true },
                                );

                                // Clear previous transcription
                                *state.latest_transcription.lock().await = String::new();

                                // Start transcription
                                let app_clone = app.clone();
                                let is_rec = state.is_recording.clone();
                                let transcription_state = state.latest_transcription.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = soniox::start_transcription(
                                        app_clone.clone(),
                                        api_key,
                                        is_rec.clone(),
                                        transcription_state,
                                    )
                                    .await
                                    {
                                        eprintln!("Transcription error: {}", e);
                                        *is_rec.lock().await = false;
                                        let _ = app_clone.emit(
                                            "recording-state",
                                            RecordingStateEvent {
                                                is_recording: false,
                                            },
                                        );
                                        let _ =
                                            app_clone.emit("transcription-error", e.to_string());
                                    }
                                });
                            }
                        });
                    }
                })?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            cancel_and_hide,
            type_text,
            set_api_key,
            get_recording_state,
            show_window,
            hide_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
