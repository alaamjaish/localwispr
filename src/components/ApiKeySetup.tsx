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
      setError("يرجى إدخال مفتاح SONIOX");
      return;
    }
    onSubmit(apiKey.trim());
  };

  return (
    <div className="popup-container setup" data-tauri-drag-region>
      <div className="popup-header">
        <h2 className="setup-title">مرحبًا بك في الناسخ المحلي</h2>
      </div>

      <form className="setup-form" onSubmit={handleSubmit}>
        <p className="setup-description">
          أدخل مفتاح SONIOX للبدء.
          <br />
          <a
            href="https://soniox.com"
            target="_blank"
            rel="noopener noreferrer"
            className="link"
          >
            احصل على المفتاح من soniox.com
          </a>
        </p>

        <input
          type="password"
          className="api-input"
          placeholder="أدخل مفتاح SONIOX"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            setError("");
          }}
          autoFocus
        />

        {error && <div className="error-message small">{error}</div>}

        <button type="submit" className="action-btn done full-width">
          حفظ ومتابعة
        </button>
      </form>
    </div>
  );
}

export default ApiKeySetup;
