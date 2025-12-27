import { useEffect, useRef } from "react";
import "../styles/popup.css";

interface RecordingPopupProps {
  isRecording: boolean;
  transcription: string;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
}

function RecordingPopup({
  isRecording,
  transcription,
  error,
  onStart,
  onStop,
  onCancel,
}: RecordingPopupProps) {
  const textRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as text comes in
  useEffect(() => {
    if (textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight;
    }
  }, [transcription]);

  return (
    <div className="popup-container">
      <div className="popup-header" data-tauri-drag-region>
        <div className="recording-indicator">
          <span className={`dot ${isRecording ? "recording" : ""}`}></span>
          <span className="status-text">
            {isRecording ? "Listening..." : "Ready"}
          </span>
        </div>
        <button className="close-btn" onClick={onCancel} title="Cancel (Esc)">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1 1L11 11M1 11L11 1"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="popup-content" ref={textRef}>
        {error ? (
          <div className="error-message">{error}</div>
        ) : transcription ? (
          <div className="transcription-text">{transcription}</div>
        ) : (
          <div className="placeholder-text">
            {isRecording ? "Speak now..." : "Press Alt+Shift+O to start"}
          </div>
        )}
      </div>

      {isRecording && (
        <div className="waveform">
          <div className="wave-bar"></div>
          <div className="wave-bar"></div>
          <div className="wave-bar"></div>
          <div className="wave-bar"></div>
          <div className="wave-bar"></div>
        </div>
      )}

      <div className="popup-footer">
        <button className="action-btn cancel" onClick={onCancel}>
          Cancel
        </button>
        {isRecording ? (
          <button
            className="action-btn done"
            onClick={onStop}
            disabled={!transcription.trim()}
          >
            Done (Ctrl+Enter)
          </button>
        ) : (
          <button className="action-btn done" onClick={onStart}>
            Start Recording
          </button>
        )}
      </div>
    </div>
  );
}

export default RecordingPopup;
