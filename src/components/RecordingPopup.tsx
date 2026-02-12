import { useEffect, useRef, useState } from "react";
import "../styles/popup.css";

interface RecordingPopupProps {
  isRecording: boolean;
  transcription: string;
  error: string | null;
  audioLevel: number;
  onCancel: () => void;
}

const BAR_COUNT = 20;

// Generate smooth reactive heights based on mic level with subtle idle motion.
function generateBarHeights(
  audioLevel: number,
  barCount: number,
  phase: number
): number[] {
  const heights: number[] = [];
  const baseHeight = 9;
  const maxAdditional = 78;
  const boostedLevel = Math.min(1, Math.pow(Math.max(audioLevel, 0), 0.35) * 1.95);
  const idleFloor = 0.2 + 0.1 * Math.sin(phase * 0.9);
  const effectiveLevel = Math.max(boostedLevel, idleFloor);

  for (let i = 0; i < barCount; i++) {
    // Wave profile makes middle bars more expressive.
    const position = i / (barCount - 1);
    const waveMultiplier = Math.pow(Math.sin(position * Math.PI), 0.75);
    const drift = 0.7 + Math.sin(phase * 1.95 + i * 0.85) * 0.3;
    const flutter = 0.82 + Math.sin(phase * 2.8 + i * 1.25) * 0.18;
    const burst = 1 + boostedLevel * (0.32 + Math.sin(phase * 4.4 + i * 0.38) * 0.22);
    const additionalHeight =
      effectiveLevel * maxAdditional * waveMultiplier * drift * flutter * burst;
    heights.push(baseHeight + Math.max(0, additionalHeight));
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
  const [barHeights, setBarHeights] = useState<number[]>(Array(BAR_COUNT).fill(10));
  const [visualizerEnergy, setVisualizerEnergy] = useState(0);
  const [shakeOffset, setShakeOffset] = useState({ x: 0, y: 0 });
  const audioLevelRef = useRef(audioLevel);
  const smoothedLevelRef = useRef(0);
  const phaseRef = useRef(0);

  useEffect(() => {
    audioLevelRef.current = audioLevel;
  }, [audioLevel]);

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

  // Run one continuous visualizer loop while recording.
  useEffect(() => {
    if (!isRecording) {
      setBarHeights(Array(BAR_COUNT).fill(10));
      setVisualizerEnergy(0);
      setShakeOffset({ x: 0, y: 0 });
      smoothedLevelRef.current = 0;
      phaseRef.current = 0;
      return;
    }

    const interval = setInterval(() => {
      const current = smoothedLevelRef.current;
      const target = Math.max(0, audioLevelRef.current);
      const alpha = target > current ? 0.35 : 0.12;
      smoothedLevelRef.current = current + (target - current) * alpha;
      phaseRef.current += 0.22 + smoothedLevelRef.current * 0.24;

      const energy = Math.max(smoothedLevelRef.current, 0.14);
      setBarHeights(generateBarHeights(smoothedLevelRef.current, BAR_COUNT, phaseRef.current));
      setVisualizerEnergy(energy);

      const shakeMagnitude = Math.max(0, energy * 7 - 0.7);
      setShakeOffset({
        x: Math.sin(phaseRef.current * 13.2) * shakeMagnitude,
        y: Math.cos(phaseRef.current * 17.1) * shakeMagnitude * 0.75,
      });
    }, 33);

    return () => clearInterval(interval);
  }, [isRecording]);

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
    <div
      className={`popup-container ${isRecording ? "recording-active" : ""}`}
      style={{ ["--voice-intensity" as string]: visualizerEnergy.toFixed(3) }}
    >
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
        <div
          className={`visualizer ${isRecording ? "active" : ""}`}
          style={{
            transform: isRecording
              ? `translate(${shakeOffset.x.toFixed(2)}px, ${shakeOffset.y.toFixed(2)}px) scale(${(
                  1 +
                  visualizerEnergy * 0.16
                ).toFixed(3)})`
              : "translate(0px, 0px) scale(1)",
            boxShadow: isRecording
              ? `0 0 ${14 + visualizerEnergy * 34}px rgba(34, 211, 238, ${
                  0.16 + visualizerEnergy * 0.36
                })`
              : "none",
          }}
        >
          <div
            className="voice-orb"
            style={{
              transform: `translate(-50%, -50%) scale(${1 + visualizerEnergy * 1.15})`,
              opacity: isRecording ? 0.22 + visualizerEnergy * 0.56 : 0.08,
            }}
          />
          <div className="voice-ring ring-a" />
          <div className="voice-ring ring-b" />
          <div className="wave-bars">
            {barHeights.map((height, i) => (
              <div
                key={i}
                className="wave-bar"
                style={{
                  ["--bar-delay" as string]: `${i * 60}ms`,
                  height: `${height}px`,
                  opacity: isRecording ? 0.52 + (height / 86) * 0.48 : 0.3,
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
