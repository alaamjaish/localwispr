import { useState } from "react";
import "../styles/popup.css";

interface ApiKeySetupProps {
  onSubmit: (apiKey: string) => void;
}

function ApiKeySetup({ onSubmit }: ApiKeySetupProps) {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError("Please enter your SONIOX API key");
      return;
    }
    onSubmit(apiKey.trim());
  };

  return (
    <div className="popup-container setup" data-tauri-drag-region>
      <div className="popup-header">
        <h2 className="setup-title">Welcome to LocalWispr</h2>
      </div>

      <form className="setup-form" onSubmit={handleSubmit}>
        <p className="setup-description">
          Enter your SONIOX API key to get started.
          <br />
          <a
            href="https://soniox.com"
            target="_blank"
            rel="noopener noreferrer"
            className="link"
          >
            Get your API key at soniox.com
          </a>
        </p>

        <input
          type="password"
          className="api-input"
          placeholder="Enter your SONIOX API key"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            setError("");
          }}
          autoFocus
        />

        {error && <div className="error-message small">{error}</div>}

        <button type="submit" className="action-btn done full-width">
          Save & Continue
        </button>
      </form>
    </div>
  );
}

export default ApiKeySetup;
