import { useEffect, useRef, useState } from "react";
import "../styles/popup.css";

interface RecordingPopupProps {
  isRecording: boolean;
  transcription: string;
  error: string | null;
  audioLevel: number;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
}

// Generate random-ish but smooth bar heights based on audio level
function generateBarHeights(audioLevel: number, barCount: number): number[] {
  const heights: number[] = [];
  const baseHeight = 8;
  const maxAdditional = 32;

  for (let i = 0; i < barCount; i++) {
    // Create a wave pattern - middle bars are taller
    const position = i / (barCount - 1);
    const waveMultiplier = Math.sin(position * Math.PI);

    // Add some variation based on position
    const variation = 0.7 + Math.sin(i * 1.5 + Date.now() / 200) * 0.3;

    // Calculate height based on audio level
    const additionalHeight = audioLevel * maxAdditional * waveMultiplier * variation;
    heights.push(baseHeight + additionalHeight);
  }

  return heights;
}

function RecordingPopup({
  isRecording,
  transcription,
  error,
  audioLevel,
  onStart,
  onStop,
  onCancel,
}: RecordingPopupProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const [statusPhase, setStatusPhase] = useState(0);
  const [barHeights, setBarHeights] = useState<number[]>(Array(12).fill(8));

  // Auto-scroll to bottom as text comes in
  useEffect(() => {
    if (textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight;
    }
  }, [transcription]);

  // Animate status text dots
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setStatusPhase((p) => (p + 1) % 4);
    }, 400);
    return () => clearInterval(interval);
  }, [isRecording]);

  // Update bar heights based on audio level
  useEffect(() => {
    if (!isRecording) {
      setBarHeights(Array(12).fill(8));
      return;
    }

    const interval = setInterval(() => {
      setBarHeights(generateBarHeights(audioLevel, 12));
    }, 50); // Update at 20fps for smooth animation

    return () => clearInterval(interval);
  }, [isRecording, audioLevel]);

  // Get dynamic status text
  const getStatusText = () => {
    if (!isRecording) return "Ready to record";
    const dots = ".".repeat(statusPhase);
    if (transcription) {
      return `Transcribing${dots}`;
    }
    return `Listening${dots}`;
  };

  return (
    <div className={`popup-container ${isRecording ? "recording-active" : ""}`}>
      {/* Animated border gradient */}
      <div className={`border-glow ${isRecording ? "active" : ""}`} />

      {/* Header */}
      <div className="popup-header" data-tauri-drag-region>
        <div className="header-left">
          <div className={`status-indicator ${isRecording ? "recording" : ""}`}>
            <div className="status-dot" />
            {isRecording && <div className="status-pulse" />}
          </div>
          <span className="status-text">{getStatusText()}</span>
        </div>
        <button className="close-btn" onClick={onCancel} title="Cancel (Esc)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Main content area */}
      <div className="popup-body">
        {/* Waveform visualizer - reactive to audio */}
        <div className={`visualizer ${isRecording ? "active" : ""}`}>
          <div className="wave-bars">
            {barHeights.map((height, i) => (
              <div
                key={i}
                className="wave-bar"
                style={{
                  height: `${height}px`,
                  opacity: isRecording ? 0.5 + (height / 40) * 0.5 : 0.3,
                  transition: "height 0.05s ease-out, opacity 0.05s ease-out",
                }}
              />
            ))}
          </div>
        </div>

        {/* Transcription area */}
        <div className="transcription-area" ref={textRef}>
          {error ? (
            <div className="error-message">{error}</div>
          ) : transcription ? (
            <div className="transcription-text">
              {transcription}
              <span className="cursor" />
            </div>
          ) : (
            <div className="placeholder">
              {isRecording ? (
                <span className="listening-text">Speak now...</span>
              ) : (
                <>
                  <div className="shortcut-hint">
                    <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>O</kbd>
                  </div>
                  <span className="hint-text">Press shortcut or click below to start</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer with action buttons */}
      <div className="popup-footer">
        <button className="btn btn-secondary" onClick={onCancel}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
          Cancel
        </button>
        {isRecording ? (
          <button
            className="btn btn-primary"
            onClick={onStop}
            disabled={!transcription.trim()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Done
          </button>
        ) : (
          <button className="btn btn-primary" onClick={onStart}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
            Start Recording
          </button>
        )}
      </div>
    </div>
  );
}

export default RecordingPopup;
