// Fallback.jsx — US-04 / FR-04
// Shown when automatic scraping is blocked by anti-bot protection or timeout.
// User can paste content or upload a PDF to continue the analysis.
// Per system architecture doc: this is the "Manual input page".
//
// This component can be used standalone (as a page) or imported by AnalysisScreen.
// The AnalysisScreen renders the ManualInputFallback inline; this file provides
// the standalone page variant for direct route access if needed.

import { useState } from "react";

/**
 * Fallback — standalone manual input page.
 *
 * Props:
 *   companyName  {string}   Company name that failed scraping
 *   onSubmit     {function} Called with (manualContent: string)
 *   onRetry      {function} Called when user wants to retry auto-scraping
 */
export default function Fallback({ companyName = "Company", onSubmit, onRetry }) {
  const [text,  setText]  = useState("");
  const [file,  setFile]  = useState(null);
  const [error, setError] = useState("");

  function handleSubmit() {
    const content = text.trim();
    if (!content && !file) {
      setError("Please paste some content or upload a PDF to continue.");
      return;
    }
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => onSubmit?.(e.target.result);
      reader.readAsText(file);
    } else {
      onSubmit?.(content);
    }
  }

  return (
    <div className="fallback-wrap">
      <div className="fallback-card">
        <div className="fallback-banner">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M8 5v3.5M8 10v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span>
            Automatic scraping was blocked for <strong>{companyName}</strong>.
            Paste the ESG content below to continue.
          </span>
        </div>

        <div className="fallback-body">
          <div className="fallback-section">
            <label className="fallback-label">
              Paste ESG content
              <span className="fallback-label-hint mono small mute">
                — Annual report excerpt, sustainability page copy, or press release
              </span>
            </label>
            <textarea
              className="fallback-textarea"
              placeholder={`Paste ${companyName}'s sustainability claims, ESG report excerpt, or any relevant content here…`}
              value={text}
              onChange={e => { setText(e.target.value); setError(""); }}
              rows={10}
              autoFocus
            />
          </div>

          <div className="fallback-or"><span>or</span></div>

          <div className="fallback-section">
            <label className="fallback-label">Upload PDF or TXT</label>
            <label className="fallback-upload">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
                <path d="M10 13V5M7 8l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4 15h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              {file ? (
                <span>
                  {file.name}
                  <button
                    style={{ marginLeft: 8, color: "var(--c-ink-2)" }}
                    onClick={(e) => { e.preventDefault(); setFile(null); }}
                  >
                    ✕
                  </button>
                </span>
              ) : (
                <span>Drop a file or <span className="lv2-upload-link">browse</span></span>
              )}
              <input
                type="file"
                accept=".pdf,.txt"
                style={{ display: "none" }}
                onChange={e => {
                  setFile(e.target.files[0]);
                  setText("");
                  setError("");
                }}
              />
            </label>
          </div>

          {error && <div className="fallback-error">{error}</div>}

          <div className="fallback-actions">
            {onRetry && (
              <button className="rep-action ghost" onClick={onRetry}>
                ← Try auto-scraping again
              </button>
            )}
            <button
              className="rep-action"
              disabled={!text.trim() && !file}
              onClick={handleSubmit}
            >
              Continue analysis →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
