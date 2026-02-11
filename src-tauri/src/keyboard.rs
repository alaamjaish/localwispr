use arboard::Clipboard;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::thread;
use std::time::Duration;

pub fn type_text(text: &str) -> Result<(), String> {
    if text.trim().is_empty() {
        return Ok(());
    }

    // Fast path: paste through clipboard (much faster for long dictation).
    if let Err(e) = paste_via_clipboard(text) {
        eprintln!("clipboard paste failed, falling back to key typing: {}", e);
    } else {
        return Ok(());
    }

    // Fallback path: direct key simulation.
    thread::sleep(Duration::from_millis(50));

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create Enigo instance: {}", e))?;

    enigo
        .text(text)
        .map_err(|e| format!("Failed to type text: {}", e))?;

    Ok(())
}

fn paste_via_clipboard(text: &str) -> Result<(), String> {
    let mut clipboard =
        Clipboard::new().map_err(|e| format!("Failed to access clipboard: {}", e))?;

    // Best-effort restore for previous text clipboard content.
    let previous_text = clipboard.get_text().ok();
    clipboard
        .set_text(text.to_string())
        .map_err(|e| format!("Failed to write clipboard text: {}", e))?;

    // Let the OS commit clipboard content before paste.
    thread::sleep(Duration::from_millis(35));

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create Enigo instance: {}", e))?;

    #[cfg(target_os = "macos")]
    let modifier = Key::Meta;
    #[cfg(not(target_os = "macos"))]
    let modifier = Key::Control;

    #[cfg(target_os = "windows")]
    let paste_key = Key::V;
    #[cfg(not(target_os = "windows"))]
    let paste_key = Key::Unicode('v');

    enigo
        .key(modifier, Direction::Press)
        .map_err(|e| format!("Failed to press modifier key: {}", e))?;
    enigo
        .key(paste_key, Direction::Click)
        .map_err(|e| format!("Failed to trigger paste shortcut: {}", e))?;
    enigo
        .key(modifier, Direction::Release)
        .map_err(|e| format!("Failed to release modifier key: {}", e))?;

    // Give target app a moment to consume paste.
    thread::sleep(Duration::from_millis(120));

    // Restore clipboard text in background after a longer delay to avoid
    // racing the target app's paste handling.
    if let Some(old) = previous_text {
        std::thread::spawn(move || {
            thread::sleep(Duration::from_millis(1200));
            if let Ok(mut cb) = Clipboard::new() {
                let _ = cb.set_text(old);
            }
        });
    }

    Ok(())
}
