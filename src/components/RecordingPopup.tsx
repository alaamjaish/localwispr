import { useEffect, useRef, useState } from "react";
import "../styles/popup.css";

interface RecordingPopupProps {
  isRecording: boolean;
  transcription: string;
  error: string | null;
  audioLevel: number;
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
    if (!isRecording) return "جاهز للتسجيل";
    const dots = ".".repeat(statusPhase);
    if (transcription) {
      return `جاري التفريغ${dots}`;
    }
    return `جاري الاستماع${dots}`;
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
        <button className="close-btn" onClick={onCancel} title="إلغاء (Esc)">
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
                <span className="listening-text">تحدث الآن...</span>
              ) : (
                <>
                  <div className="shortcut-hint">
                    <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>O</kbd>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RecordingPopup;
