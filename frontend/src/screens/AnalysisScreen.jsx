// AnalysisScreen.jsx — US-05, US-06, US-07, FR-04
// Changes vs original:
//   - scraping_failed split into scraping_blocked / scraping_not_found
//   - ManualInputFallback receives failReason prop and shows contextual banner
//   - Both fail reasons trigger manual input (same UX flow, different message)

import { useState, useEffect, useRef, useCallback } from "react";
import { GWD_DATA } from "../data.js";

// ─── Constants ─────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 3000;
const API_TIMEOUT_MS   = 60000;

// ─── API helpers ───────────────────────────────────────────────────────────
async function startAnalysis(query, manualContent, signal) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company_name:   query,
      query,
      manual_content: manualContent || null,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function pollReport(jobId, signal) {
  const res = await fetch(`/api/report/${jobId}`, { signal });
  if (!res.ok) throw new Error(`Poll ${res.status}`);
  return res.json();
}

// ─── Response normaliser ───────────────────────────────────────────────────
function normalise(raw, demoClaim) {
  if (!raw || raw.error) return null;
  const dim = raw.dimensionScores || raw.dimension_scores || {};
  const flags = (raw.flags || []).map(f => ({
    type:        f.type        || "Finding",
    severity:    f.severity    || inferSeverity(f.type),
    description: f.description || "",
    source:      f.source      || "",
  }));
  return {
    ...demoClaim,
    id:           raw.id        || raw.job_id || demoClaim.id,
    score:        raw.score     ?? demoClaim.score,
    riskLevel:    raw.riskLevel || raw.risk_level || demoClaim.riskLevel,
    risk_level:   raw.risk_level || raw.riskLevel || demoClaim.risk_level,
    summary:      raw.summary   || demoClaim.summary,
    confidence:   raw.confidence ?? demoClaim.confidence,
    company_name: raw.company_name || demoClaim.company_name,
    headline:     raw.headline || raw.company_name || demoClaim.headline,
    analyzedAt:   raw.analyzedAt || raw.completed_at || demoClaim.analyzedAt,
    dimensionScores: {
      specificity:               dim.specificity               ?? demoClaim.dimensionScores.specificity,
      data_consistency:          dim.data_consistency          ?? demoClaim.dimensionScores.data_consistency,
      third_party_certification: dim.third_party_certification ?? demoClaim.dimensionScores.third_party_certification,
      negative_news:             dim.negative_news             ?? demoClaim.dimensionScores.negative_news,
      greenwashing_language:     dim.greenwashing_language     ?? demoClaim.dimensionScores.greenwashing_language,
    },
    flags:    flags.length > 0 ? flags : demoClaim.flags,
    evidence: raw.evidence?.length > 0 ? raw.evidence : demoClaim.evidence,
  };
}

function inferSeverity(type) {
  if (!type) return "medium";
  if (["Data Contradiction", "Negative News"].includes(type)) return "high";
  if (["Vague Claims", "Lack of Certification"].includes(type)) return "medium";
  return "low";
}

// ─── Scraping fail reason helpers ──────────────────────────────────────────
// Maps backend fail_reason codes to user-facing copy.

const SCRAPING_FAIL_COPY = {
  scraping_not_found: {
    title: "ESG page not found",
    body:  "We searched for {company}'s sustainability page but couldn't find a relevant result. You can paste their ESG content below, or provide the URL directly.",
  },
  scraping_blocked: {
    title: "Access blocked",
    body:  "We found {company}'s ESG page but couldn't access it — the site may use anti-scraping protection. Please paste the content below to continue.",
  },
  // Legacy value — treat same as blocked
  scraping_failed: {
    title: "Scraping failed",
    body:  "We couldn't retrieve {company}'s ESG content automatically. Please paste it below to continue.",
  },
};

function getScrapingCopy(failReason, companyName) {
  const template = SCRAPING_FAIL_COPY[failReason] || SCRAPING_FAIL_COPY.scraping_failed;
  return {
    title: template.title,
    body:  template.body.replace("{company}", companyName),
  };
}

function isScrapingFailure(failReason) {
  return ["scraping_not_found", "scraping_blocked", "scraping_failed"].includes(failReason);
}

// ─── FR-04 Manual Input Fallback ───────────────────────────────────────────
// failReason prop drives the banner text so users get a contextual message.

function ManualInputFallback({ companyName, failReason, onSubmit, onRetry }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");

  const copy = getScrapingCopy(failReason, companyName);

  function handleSubmit() {
    const content = text.trim();
    if (!content && !file) {
      setError("Please paste some content or upload a PDF to continue.");
      return;
    }
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => onSubmit(e.target.result);
      reader.readAsText(file);
    } else {
      onSubmit(content);
    }
  }

  return (
    <div className="fallback-wrap">
      <div className="fallback-card">
        {/* Contextual banner — different text for not_found vs blocked */}
        <div className="fallback-banner">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M8 5v3.5M8 10v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span>
            <strong>{copy.title} — </strong>{copy.body}
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

          <div className="fallback-or">
            <span>or</span>
          </div>

          <div className="fallback-section">
            <label className="fallback-label">Upload PDF</label>
            <label className="fallback-upload">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
                <path d="M10 13V5M7 8l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4 15h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              {file ? (
                <span>{file.name} <button onClick={() => setFile(null)} style={{ marginLeft: 8 }}>✕</button></span>
              ) : (
                <span>Drop a PDF or <span className="lv2-upload-link">browse files</span></span>
              )}
              <input
                type="file"
                accept=".pdf,.txt"
                style={{ display: "none" }}
                onChange={e => { setFile(e.target.files[0]); setText(""); setError(""); }}
              />
            </label>
          </div>

          {error && <div className="fallback-error">{error}</div>}

          <div className="fallback-actions">
            <button className="rep-action ghost" onClick={onRetry}>
              ← Try automatic scraping again
            </button>
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

// ─── Main Component ─────────────────────────────────────────────────────────
export function AnalysisScreen({ claim, query, onComplete }) {
  const steps = GWD_DATA.PIPELINE_STEPS;

  const [stepIdx,        setStepIdx]        = useState(0);
  const [doneSteps,      setDoneSteps]      = useState(new Set());
  const [confidence,     setConfidence]     = useState(0);
  const [partialScore,   setPartialScore]   = useState(0);
  const [evidenceFound,  setEvidenceFound]  = useState(0);
  const [contradictions, setContradictions] = useState(0);

  const [apiResult,      setApiResult]      = useState(null);
  const [apiError,       setApiError]       = useState(null);
  const [timedOut,       setTimedOut]       = useState(false);
  const [retryCount,     setRetryCount]     = useState(0);

  // FR-04: scraping failure state — now tracks the specific fail reason
  const [scrapingFailReason, setScrapingFailReason] = useState(null); // null = no failure
  const [manualContent,      setManualContent]      = useState(null);

  const finished     = useRef(false);
  const pipelineDone = useRef(false);
  const abortRef     = useRef(null);

  const displayName = query || claim?.company_name || "Company";

  // ── 1. Pipeline animation ────────────────────────────────────────────────
  useEffect(() => {
    if (finished.current || scrapingFailReason) return;
    const timings = [900, 1100, 1500, 1700, 1200];
    if (stepIdx >= steps.length) {
      pipelineDone.current = true;
      if (apiResult !== null || apiError !== null) {
        finished.current = true;
        const t = setTimeout(() => onComplete?.(apiResult ?? claim), 700);
        return () => clearTimeout(t);
      }
      return;
    }
    const t = setTimeout(() => {
      setDoneSteps(prev => new Set([...prev, steps[stepIdx].key]));
      setStepIdx(i => i + 1);
    }, timings[stepIdx] ?? 1200);
    return () => clearTimeout(t);
  }, [stepIdx, apiResult, apiError, scrapingFailReason]);

  // ── 2. Animate counters ──────────────────────────────────────────────────
  useEffect(() => {
    const target = apiResult ?? claim;
    if (!target) return;
    const progress = Math.min(1,
      (stepIdx + (doneSteps.size > stepIdx ? 1 : 0)) / steps.length,
    );
    setConfidence(Math.round(progress * (target.confidence ?? 0.85) * 100));
    setPartialScore(Math.round(progress * (target.score ?? 0)));
    setEvidenceFound(Math.round(progress * (target.evidence?.length ?? 0)));
    setContradictions(Math.round(
      progress * (target.flags?.filter(f => f.type === "Data Contradiction").length ?? 0),
    ));
  }, [stepIdx, doneSteps, apiResult]);

  // ── 3. API call with polling ─────────────────────────────────────────────
  const runFetch = useCallback(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setApiError(null);
    setTimedOut(false);
    setScrapingFailReason(null);

    const deadline = Date.now() + API_TIMEOUT_MS;

    async function run() {
      try {
        const initRes = await startAnalysis(
          query ?? claim?.headline ?? "",
          manualContent,
          ac.signal,
        );

        if (initRes.status === "completed" || initRes.score != null) {
          const merged = normalise(initRes, claim);
          setApiResult(merged);
          if (pipelineDone.current && !finished.current) {
            finished.current = true;
            setTimeout(() => onComplete?.(merged), 700);
          }
          return;
        }

        const jobId = initRes.job_id || initRes.id;
        if (!jobId) throw new Error("No job_id returned");

        while (!ac.signal.aborted && Date.now() < deadline) {
          await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
          if (ac.signal.aborted) return;

          const poll = await pollReport(jobId, ac.signal);

          if (poll.status === "completed") {
            const merged = normalise(poll, claim);
            setApiResult(merged);
            if (pipelineDone.current && !finished.current) {
              finished.current = true;
              setTimeout(() => onComplete?.(merged), 700);
            }
            return;
          }

          if (poll.status === "failed") {
            const reason = poll.fail_reason || "scraping_failed";

            if (isScrapingFailure(reason) && !manualContent) {
              // FR-04: show manual input with contextual message
              setScrapingFailReason(reason);
            } else {
              // Non-scraping failure or already tried manual — use demo data
              setApiResult(claim);
              if (pipelineDone.current && !finished.current) {
                finished.current = true;
                setTimeout(() => onComplete?.(claim), 700);
              }
            }
            return;
          }
        }

        // US-07: Timeout
        if (!ac.signal.aborted) {
          setTimedOut(true);
          if (pipelineDone.current && !finished.current) {
            finished.current = true;
            setTimeout(() => onComplete?.(claim), 1500);
          }
        }

      } catch (err) {
        if (err.name === "AbortError") return;
        const isUnavailable =
          err.message.includes("404") ||
          err.message.includes("Failed to fetch") ||
          err.message.includes("NetworkError");
        if (isUnavailable) {
          setApiResult(claim);
        } else {
          setApiError(err.message);
        }
        if (pipelineDone.current && !finished.current) {
          finished.current = true;
          setTimeout(() => onComplete?.(claim), 700);
        }
      }
    }
    run();
    return () => ac.abort();
  }, [query, claim, retryCount, manualContent]);

  useEffect(() => { return runFetch(); }, [runFetch]);

  // FR-04: User submitted manual content → restart analysis
  function handleManualSubmit(content) {
    finished.current     = false;
    pipelineDone.current = false;
    setManualContent(content);
    setScrapingFailReason(null);
    setStepIdx(0);
    setDoneSteps(new Set());
    setRetryCount(n => n + 1);
  }

  // FR-04: User wants to retry scraping
  function handleRetryScrap() {
    finished.current     = false;
    pipelineDone.current = false;
    setScrapingFailReason(null);
    setManualContent(null);
    setStepIdx(0);
    setDoneSteps(new Set());
    setRetryCount(n => n + 1);
  }

  const allDone = stepIdx >= steps.length;

  // ── FR-04: Render manual input fallback with contextual message ───────────
  if (scrapingFailReason) {
    return (
      <div className="analysis-screen">
        <div className="ana-context-bar">
          <div className="ana-context-l">
            <span className="mono small mute">
              {scrapingFailReason === "scraping_not_found"
                ? "ESG PAGE NOT FOUND"
                : "ACCESS BLOCKED"}
            </span>
            <span className="ana-context-co">{displayName}</span>
          </div>
          <div className="mono small mute">FR-04 · Manual input mode</div>
        </div>
        <ManualInputFallback
          companyName={displayName}
          failReason={scrapingFailReason}
          onSubmit={handleManualSubmit}
          onRetry={handleRetryScrap}
        />
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="analysis-screen">
      <div className="ana-context-bar">
        <div className="ana-context-l">
          <span className="mono small mute">ANALYSING</span>
          <span className="ana-context-co">{displayName}</span>
          {manualContent && (
            <span className="ana-context-ticker mono">MANUAL INPUT</span>
          )}
        </div>
        <div className="mono small mute">claude-sonnet-4 · rubric v3.2</div>
      </div>

      <div className="ana-stage">
        <aside className="ana-claim">
          <div className="ana-claim-head">
            <span className="mono small mute">ANALYSING</span>
          </div>
          <h2 className="ana-claim-headline">{displayName}</h2>
          {manualContent ? (
            <div className="ana-claim-quote">
              Manual content provided — {manualContent.length} characters
            </div>
          ) : (
            <div className="ana-claim-quote">
              &ldquo;{claim.shortQuote}&rdquo;
            </div>
          )}
          <div className="ana-claim-src mono small mute">
            {manualContent ? "User-provided content" : claim.source}
          </div>
          <div className="ana-claim-meta">
            <div className="ana-claim-meta-row">
              <span className="mute">Input mode</span>
              <span>{manualContent ? "Manual" : "Auto-scrape"}</span>
            </div>
            <div className="ana-claim-meta-row">
              <span className="mute">AI engine</span>
              <span className="mono">claude-sonnet-4</span>
            </div>
            <div className="ana-claim-meta-row">
              <span className="mute">Rubric</span>
              <span className="mono">v3.2 · 5 dimensions · 0–100</span>
            </div>
            <div className="ana-claim-meta-row">
              <span className="mute">Standards</span>
              <span className="mono small">TCFD · GRI 305 · GRI 2-27 · EU Taxonomy · EU GCD</span>
            </div>
          </div>
        </aside>

        <main className="ana-pipeline">
          <div className="ana-title-row">
            <h1 className="ana-title">
              Analysing
              <span className="dots">
                <span></span><span></span><span></span>
              </span>
            </h1>
            <div className="ana-subtle mono">claude-sonnet-4 · rubric v3.2</div>
          </div>

          <ol className="ana-steps">
            {steps.map((step, i) => {
              const state =
                doneSteps.has(step.key) ? "done"
                : i === stepIdx          ? "active"
                :                          "pending";
              return (
                <li key={step.key} className={`ana-step s-${state}`}>
                  <div className="ana-step-rail">
                    <div className="ana-step-bullet">
                      {state === "done" && (
                        <svg viewBox="0 0 12 12" width="10" height="10">
                          <path d="M2 6 L5 9 L10 3" stroke="currentColor" strokeWidth="1.8"
                                fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                      {state === "active"  && <span className="ana-step-spinner" />}
                      {state === "pending" && <span className="ana-step-dot" />}
                    </div>
                    {i < steps.length - 1 && <div className="ana-step-line" />}
                  </div>
                  <div className="ana-step-body">
                    <div className="ana-step-head">
                      <span className="ana-step-num mono">{String(i + 1).padStart(2, "0")}</span>
                      <span className="ana-step-label">{step.label}</span>
                      {state === "active"  && <span className="ana-step-tag mono">RUNNING</span>}
                      {state === "done"    && <span className="ana-step-tag done mono">OK</span>}
                    </div>
                    <div className="ana-step-detail">{step.detail}</div>
                    {state === "active" && (
                      <div className="ana-step-progress">
                        <div className="ana-step-progress-fill" />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {allDone && !timedOut && (
            <div className="ana-done">
              <span className="mono small">
                {apiResult ? "Verdict ready" : "Waiting for analysis service…"}
              </span>
              {apiResult && <span className="ana-done-arrow">→</span>}
            </div>
          )}

          {timedOut && (
            <div className="ana-timeout">
              <div className="ana-timeout-msg">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                Analysis is taking longer than expected
              </div>
              <button className="rep-action small"
                onClick={() => {
                  setTimedOut(false);
                  finished.current     = false;
                  pipelineDone.current = false;
                  setStepIdx(0);
                  setDoneSteps(new Set());
                  setRetryCount(n => n + 1);
                }}>
                Retry →
              </button>
            </div>
          )}

          {apiError && !timedOut && (
            <div className="ana-api-status mono small mute">
              API unavailable · using demo data
            </div>
          )}
        </main>

        <aside className="ana-signals">
          <div className="ana-signal-card">
            <div className="signal-lbl mono small">RISK BUILDING</div>
            <div className="signal-num" style={{
              color: partialScore > 60 ? "var(--c-bad)"
                   : partialScore > 30 ? "var(--c-warn)"
                   : "var(--c-ok)",
            }}>
              {partialScore}
            </div>
            <div className="signal-sub mono small mute">/ 100 · provisional</div>
            <div className="signal-bar">
              <div className="signal-bar-z z-ok" />
              <div className="signal-bar-z z-warn" />
              <div className="signal-bar-z z-bad" />
              <div className="signal-bar-needle" style={{ left: partialScore + "%" }} />
            </div>
          </div>

          <div className="ana-signal-card">
            <div className="signal-lbl mono small">CONFIDENCE</div>
            <div className="signal-num small-num">
              {confidence}<span className="pct">%</span>
            </div>
            <div className="signal-sub mono small mute">model-reported</div>
            <div className="signal-conf-bar">
              <div className="signal-conf-fill" style={{ width: confidence + "%" }} />
            </div>
          </div>

          <div className="ana-signal-grid">
            <div className="ana-signal-mini">
              <div className="signal-lbl mono small">EVIDENCE</div>
              <div className="signal-num small-num">{evidenceFound}</div>
              <div className="signal-sub mono small mute">sources cited</div>
            </div>
            <div className="ana-signal-mini">
              <div className="signal-lbl mono small">CONTRADICTIONS</div>
              <div className="signal-num small-num"
                style={{ color: contradictions > 0 ? "var(--c-bad)" : "var(--c-ink-0)" }}>
                {contradictions}
              </div>
              <div className="signal-sub mono small mute">vs external data</div>
            </div>
          </div>

          <div className="ana-signal-card live">
            <div className="signal-lbl mono small">LIVE QUERIES</div>
            <div className="ana-live-queries">
              <LiveQueries stepIdx={stepIdx} companyName={displayName} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function LiveQueries({ stepIdx, companyName }) {
  const name = encodeURIComponent(companyName);
  const QUERIES = [
    `GET  google.com/search?q=${companyName}+sustainability+ESG+report`,
    `GET  cdp.net/api/v1/responses?company=${name}`,
    `GET  ec.europa.eu/clima/ets/registry/${name}`,
    `GET  sciencebasedtargets.org/companies/${name}`,
    `GET  newsapi.org/v2/everything?q=${name}+ESG+greenwashing`,
    `GET  ogmpartnership.com/members/${name}`,
    `POST api.anthropic.com/v1/messages   model=claude-sonnet-4`,
    `PARSE  claim spans → normalised evidence`,
    `DIFF  scope-1 reported vs EU ETS verified`,
    `RANK  evidence by weight · kind · recency`,
  ];
  const visible = Math.min(QUERIES.length, 3 + stepIdx * 2);
  return (
    <ul className="live-q mono small">
      {QUERIES.slice(0, visible).map((q, i) => {
        const isLast = i === visible - 1 && stepIdx < 5;
        return (
          <li key={i} className={isLast ? "live-q-active" : ""}>
            {isLast ? "›" : "·"} {q}
          </li>
        );
      })}
    </ul>
  );
}

export default AnalysisScreen;
