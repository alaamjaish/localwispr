import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import RecordingPopup from "./components/RecordingPopup";
import ApiKeySetup from "./components/ApiKeySetup";

interface TranscriptionEvent {
  text: string;
  is_final: boolean;
}

interface RecordingStateEvent {
  is_recording: boolean;
}

interface AudioLevelEvent {
  level: number;
}

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [apiKeySet, setApiKeySet] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const lastRecordingStartRef = useRef<number>(0);
  const transcriptionRef = useRef<string>("");
  const lastTypedTextRef = useRef<string>(""); // Track what we've already typed

  // Handle starting recording
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setTranscription("");
      transcriptionRef.current = "";
      lastTypedTextRef.current = "";
      await invoke("start_recording");
    } catch (e) {
      setError(String(e));
    }
  }, []);

  // Handle stopping recording
  const stopRecording = useCallback(async (reason = "ui") => {
    try {
      await invoke("stop_recording", { reason });
    } catch (e) {
      setError(String(e));
    }
  }, []);

  // Handle completing transcription (type text and hide window)
  const completeTranscription = useCallback(async () => {
    const finalText = transcriptionRef.current.trim();
    if (finalText) {
      try {
        await invoke("hide_window");
        await new Promise((resolve) => setTimeout(resolve, 100));
        await invoke("type_text", { text: finalText });
      } catch (e) {
        setError(String(e));
      }
    } else {
      await invoke("hide_window");
    }
    setTranscription("");
    transcriptionRef.current = "";
    lastTypedTextRef.current = "";
  }, []);

  // Handle API key submission
  const handleApiKeySubmit = useCallback(async (apiKey: string) => {
    try {
      await invoke("set_api_key", { apiKey });
      setApiKeySet(true);
      // Store in localStorage for persistence
      localStorage.setItem("soniox_api_key_set", "true");
      localStorage.setItem("soniox_api_key", apiKey);
      // Auto-start recording after setting API key
      setTimeout(() => {
        startRecording();
      }, 100);
    } catch (e) {
      setError(String(e));
    }
  }, [startRecording]);

  // Check for stored API key on mount
  useEffect(() => {
    const storedKey = localStorage.getItem("soniox_api_key");
    if (storedKey) {
      invoke("set_api_key", { apiKey: storedKey }).then(() => {
        setApiKeySet(true);
        // Don't auto-start - let the shortcut handle it
      });
    }
  }, []);

  // Set up event listeners
  useEffect(() => {
    const unlistenTranscription = listen<TranscriptionEvent>(
      "transcription",
      (event) => {
        setTranscription(event.payload.text);
        transcriptionRef.current = event.payload.text;
      }
    );

    const unlistenComplete = listen<TranscriptionEvent>(
      "transcription-complete",
      (event) => {
        setTranscription(event.payload.text);
        transcriptionRef.current = event.payload.text;
      }
    );

    const unlistenState = listen<RecordingStateEvent>(
      "recording-state",
      (event) => {
        setIsRecording(event.payload.is_recording);
        if (event.payload.is_recording) {
          lastRecordingStartRef.current = Date.now();
        }
      }
    );

    const unlistenError = listen<string>("transcription-error", (event) => {
      setError(event.payload);
      setIsRecording(false);
      // If 403 error, clear the API key and show setup
      if (event.payload.includes("403") || event.payload.includes("Forbidden")) {
        localStorage.removeItem("soniox_api_key");
        localStorage.removeItem("soniox_api_key_set");
        setApiKeySet(false);
      }
    });

    // LIVE TYPING: Type directly to cursor as you speak!
    const unlistenLiveType = listen<TranscriptionEvent>(
      "live-type",
      async (event) => {
        const newText = event.payload.text;
        const lastTyped = lastTypedTextRef.current;

        // Only type if there's new text beyond what we've already typed
        if (newText.length > lastTyped.length && newText.startsWith(lastTyped)) {
          const newPart = newText.slice(lastTyped.length);
          try {
            await invoke("type_text", { text: newPart });
            lastTypedTextRef.current = newText;
          } catch (e) {
            setError(String(e));
          }
        }
      }
    );

    const unlistenStartRequest = listen("start-recording-request", () => {
      startRecording();
    });

    const unlistenStopRequest = listen("stop-recording-request", () => {
      stopRecording("event:stop-recording-request").then(() =>
        completeTranscription()
      );
    });

    // Listen for audio level updates
    const unlistenAudioLevel = listen<AudioLevelEvent>("audio-level", (event) => {
      setAudioLevel(event.payload.level);
    });

    // Shortcut stop now types text in Rust directly.
    // Frontend should only clear UI state to avoid duplicate typing and delays.
    const unlistenFinishAndType = listen("finish-and-type", () => {
      setTranscription("");
      transcriptionRef.current = "";
      lastTypedTextRef.current = "";
      setIsRecording(false);
    });

    return () => {
      unlistenTranscription.then((f) => f());
      unlistenComplete.then((f) => f());
      unlistenState.then((f) => f());
      unlistenError.then((f) => f());
      unlistenLiveType.then((f) => f());
      unlistenStartRequest.then((f) => f());
      unlistenStopRequest.then((f) => f());
      unlistenAudioLevel.then((f) => f());
      unlistenFinishAndType.then((f) => f());
    };
  }, [startRecording, stopRecording, completeTranscription]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        stopRecording("ui:escape").then(() => invoke("hide_window"));
        setTranscription("");
      } else if (e.key === "Enter" && e.ctrlKey && !e.shiftKey) {
        if (!isRecording) {
          return;
        }
        if (!transcription.trim()) {
          return;
        }
        const elapsed = Date.now() - lastRecordingStartRef.current;
        if (elapsed < 1000) {
          return;
        }
        e.preventDefault();
        stopRecording("ui:ctrl-enter").then(() => completeTranscription());
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stopRecording, completeTranscription, isRecording, transcription]);

  if (!apiKeySet) {
    return <ApiKeySetup onSubmit={handleApiKeySubmit} />;
  }

  return (
    <RecordingPopup
      isRecording={isRecording}
      transcription={transcription}
      error={error}
      audioLevel={audioLevel}
      onStart={startRecording}
      onStop={() => stopRecording("ui:done").then(() => completeTranscription())}
      onCancel={() => {
        stopRecording("ui:cancel").then(() => invoke("hide_window"));
        setTranscription("");
        transcriptionRef.current = "";
        lastTypedTextRef.current = "";
      }}
    />
  );
}

export default App;
