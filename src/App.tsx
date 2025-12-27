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

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [apiKeySet, setApiKeySet] = useState(false);
  const lastRecordingStartRef = useRef<number>(0);
  const transcriptionRef = useRef<string>("");
  const lastTypedTextRef = useRef<string>(""); // Track what we've already typed

  // Handle starting recording
  const startRecording = useCallback(async () => {
    console.log("startRecording called");
    try {
      setError(null);
      setTranscription("");
      lastTypedTextRef.current = ""; // Reset typed text tracker
      console.log("Invoking start_recording...");
      await invoke("start_recording");
      console.log("start_recording completed successfully");
    } catch (e) {
      console.error("start_recording failed:", e);
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
    if (transcription.trim()) {
      try {
        // Hide window first
        await invoke("hide_window");
        // Small delay to ensure window is hidden
        await new Promise((resolve) => setTimeout(resolve, 100));
        // Type the text
        await invoke("type_text", { text: transcription.trim() });
      } catch (e) {
        setError(String(e));
      }
    } else {
      await invoke("hide_window");
    }
    setTranscription("");
  }, [transcription]);

  // Handle API key submission
  const handleApiKeySubmit = useCallback(async (apiKey: string) => {
    console.log("handleApiKeySubmit called");
    try {
      await invoke("set_api_key", { apiKey });
      console.log("API key set in backend");
      setApiKeySet(true);
      // Store in localStorage for persistence
      localStorage.setItem("soniox_api_key_set", "true");
      localStorage.setItem("soniox_api_key", apiKey);
      // Auto-start recording after setting API key
      console.log("Will start recording in 100ms...");
      setTimeout(() => {
        console.log("Starting recording now...");
        startRecording();
      }, 100);
    } catch (e) {
      console.error("handleApiKeySubmit error:", e);
      setError(String(e));
    }
  }, [startRecording]);

  // Check for stored API key on mount
  useEffect(() => {
    const storedKey = localStorage.getItem("soniox_api_key");
    if (storedKey) {
      console.log("Found stored API key, setting up...");
      invoke("set_api_key", { apiKey: storedKey }).then(() => {
        console.log("API key set");
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
        console.log("Received transcription:", event.payload.text);
        setTranscription(event.payload.text);
        transcriptionRef.current = event.payload.text;
      }
    );

    const unlistenComplete = listen<TranscriptionEvent>(
      "transcription-complete",
      (event) => {
        setTranscription(event.payload.text);
      }
    );

    const unlistenState = listen<RecordingStateEvent>(
      "recording-state",
      (event) => {
        console.log("Received recording-state:", event.payload.is_recording);
        setIsRecording(event.payload.is_recording);
        if (event.payload.is_recording) {
          lastRecordingStartRef.current = Date.now();
        }
      }
    );

    const unlistenError = listen<string>("transcription-error", (event) => {
      console.error("Transcription error:", event.payload);
      setError(event.payload);
      setIsRecording(false);
      // If 403 error, clear the API key and show setup
      if (event.payload.includes("403") || event.payload.includes("Forbidden")) {
        console.log("API key rejected, clearing...");
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
          console.log("Live typing new text:", newPart);
          try {
            await invoke("type_text", { text: newPart });
            lastTypedTextRef.current = newText;
          } catch (e) {
            console.error("Live typing failed:", e);
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

    // Handle finish-and-type event (shortcut pressed while recording)
    const unlistenFinishAndType = listen("finish-and-type", async () => {
      const currentText = transcriptionRef.current;
      console.log("finish-and-type received, transcription length:", currentText.length);
      console.log("finish-and-type transcription:", currentText);

      if (currentText.trim()) {
        try {
          console.log("Hiding window...");
          await invoke("hide_window");
          // Wait longer for focus to return to original app
          console.log("Waiting for focus...");
          await new Promise((resolve) => setTimeout(resolve, 300));
          console.log("Calling type_text...");
          await invoke("type_text", { text: currentText.trim() });
          console.log("Typed text successfully!");
        } catch (e) {
          console.error("Failed to type text:", e);
        }
      } else {
        console.log("No transcription to type (empty), hiding window");
        await invoke("hide_window");
      }
      setTranscription("");
      transcriptionRef.current = "";
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
      unlistenFinishAndType.then((f) => f());
    };
  }, [startRecording, stopRecording, completeTranscription, transcription]);

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
          console.log("Enter ignored; no transcription yet");
          return;
        }
        const elapsed = Date.now() - lastRecordingStartRef.current;
        if (elapsed < 1000) {
          console.log("Enter ignored; recording just started");
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
      onStart={startRecording}
      onStop={() => stopRecording("ui:done").then(() => completeTranscription())}
      onCancel={() => {
        stopRecording("ui:cancel").then(() => invoke("hide_window"));
        setTranscription("");
      }}
    />
  );
}

export default App;
