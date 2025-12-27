use enigo::{Enigo, Keyboard, Settings};
use std::thread;
use std::time::Duration;

/// Type text at the current cursor position using direct keyboard simulation
/// This uses enigo's text() method which sends Unicode characters directly
/// without using the clipboard
pub fn type_text(text: &str) -> Result<(), String> {
    // Small delay to ensure the target window has focus
    thread::sleep(Duration::from_millis(50));

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create Enigo instance: {}", e))?;

    // Use enigo's text() method to type the string directly
    // This sends each character as a Unicode keyboard event
    enigo
        .text(text)
        .map_err(|e| format!("Failed to type text: {}", e))?;

    Ok(())
}
