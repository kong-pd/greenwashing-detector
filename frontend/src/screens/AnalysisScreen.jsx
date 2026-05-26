// AnalysisScreen.jsx — the "AI thinking" moment.
// Runs the pipeline animation in parallel with a real backend call.
// onComplete(result) is called with the API response when both are done;
// falls back to the static demo claim if the API is unavailable.

import { useState, useEffect, useRef, useCallback } from "react";
import { GWD_DATA } from "../data.js";

// ─── API contract ──────────────────────────────────────────────────────────
// POST /api/analyze
// Body:  { query: string, claimId?: string }
// Response shape the frontend expects:
// {
//   id: string,           // e.g. "CLM-2026-0331-A"
//   headline: string,
//   shortQuote: string,
//   source: string,
//   sourceType: string,
//   capturedAt: string,
//   analyzedAt: string,
//   score: number,        // 0–100
//   riskLevel: string,    // "Low Risk" | "Medium Risk" | "High Risk"
//   confidence: number,   // 0–1
//   summary: string,
//   dimensionScores: { specificity, dataConsistency, thirdPartyVerification, negativeNews, greenwashingLanguage },
//   flags: [{ type, severity, dimension, description, evidence }],
//   evidence: [{ id, kind, title, org, date, url, quote, weight }]
// }
//
// If you return a partial object, the frontend merges with the demo claim as fallback.
// If the backend is unavailable (404, network error), it silently uses the demo claim.

const API_TIMEOUT_MS = 60_000; // US-02: show timeout UI after 60s

async function fetchAnalysis(query, claimId, signal) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, claimId }),
    signal,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export function AnalysisScreen({ claim, query, onComplete }) {
  const steps = GWD_DATA.PIPELINE_STEPS;
  const [stepIdx, setStepIdx] = useState(0);
  const [doneSteps, setDoneSteps] = useState(new Set());
  const [confidence, setConfidence] = useState(0);
  const [partialScore, setPartialScore] = useState(0);
  const [evidenceFound, setEvidenceFound] = useState(0);
  const [contradictions, setContradictions] = useState(0);
  // API state
  const [apiResult, setApiResult]   = useState(null);   // real scored claim or null
  const [apiError, setApiError]     = useState(null);   // error message or null
  const [timedOut, setTimedOut]     = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const finished    = useRef(false);
  const pipelineDone = useRef(false);
  const abortRef    = useRef(null);

  const company       = GWD_DATA.COMPANY;
  const displayCompany = company.legalName;
  const displayTicker  = company.ticker;

  // Derive live counters from whichever source is available
  const targetClaim  = apiResult ?? claim;
  const targetScore  = targetClaim.score;
  const targetEvid   = targetClaim.evidence.length;
  const targetContra = targetClaim.flags.filter(f => f.type === "Data Contradiction").length;

  // ── 1. Pipeline animation ─────────────────────────────────────────────────
  useEffect(() => {
    if (finished.current) return;
    const timings = [900, 1100, 1500, 1700, 1200];
    if (stepIdx >= steps.length) {
      pipelineDone.current = true;
      // If API already returned, complete immediately; otherwise wait for it
      if (apiResult !== null || apiError !== null) {
        finished.current = true;
        const t = setTimeout(() => onComplete?.(apiResult ?? claim), 700);
        return () => clearTimeout(t);
      }
      return; // will complete in the API effect below
    }
    const t = setTimeout(() => {
      setDoneSteps(prev => new Set([...prev, steps[stepIdx].key]));
      setStepIdx(i => i + 1);
    }, timings[stepIdx] ?? 1200);
    return () => clearTimeout(t);
  }, [stepIdx, apiResult, apiError]);

  // ── 2. Animate counters ───────────────────────────────────────────────────
  useEffect(() => {
    const progress = Math.min(1, (stepIdx + (doneSteps.size > stepIdx ? 1 : 0)) / steps.length);
    setConfidence(Math.round(progress * targetClaim.confidence * 100));
    setPartialScore(Math.round(progress * targetScore));
    setEvidenceFound(Math.round(progress * targetEvid));
    setContradictions(Math.round(progress * targetContra));
  }, [stepIdx, doneSteps, targetClaim]);

  // ── 3. Real API call ──────────────────────────────────────────────────────
  const runFetch = useCallback(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setApiError(null);
    setTimedOut(false);

    // US-02: 60-second timeout UI
    const timeoutId = setTimeout(() => {
      setTimedOut(true);
      ac.abort();
    }, API_TIMEOUT_MS);

    fetchAnalysis(query ?? claim.headline, claim.id, ac.signal)
      .then(result => {
        clearTimeout(timeoutId);
        // Merge with demo claim as safety net for missing fields
        const merged = { ...claim, ...result };
        setApiResult(merged);
        // If pipeline already done, complete now
        if (pipelineDone.current && !finished.current) {
          finished.current = true;
          setTimeout(() => onComplete?.(merged), 700);
        }
      })
      .catch(err => {
        clearTimeout(timeoutId);
        if (err.name === "AbortError") return; // ignore abort
        // Network error / 404 → API not available yet, silently use demo data
        const isUnavailable = err.message.includes("404") || err.message.includes("Failed to fetch") || err.message.includes("NetworkError");
        if (isUnavailable) {
          setApiResult(claim); // demo fallback
          if (pipelineDone.current && !finished.current) {
            finished.current = true;
            setTimeout(() => onComplete?.(claim), 700);
          }
        } else {
          setApiError(err.message);
          if (pipelineDone.current && !finished.current) {
            finished.current = true;
            setTimeout(() => onComplete?.(claim), 700); // fallback on error
          }
        }
      });

    return () => { clearTimeout(timeoutId); ac.abort(); };
  }, [query, claim, retryCount]);

  useEffect(() => {
    return runFetch();
  }, [runFetch]);

  const allDone = stepIdx >= steps.length;

  return (
    <div className="analysis-screen">
      {/* Sticky context bar — company identity always visible */}
      <div className="ana-context-bar">
        <div className="ana-context-l">
          <span className="mono small mute">ANALYSING</span>
          <span className="ana-context-co">{displayCompany}</span>
          <span className="ana-context-ticker mono">{displayTicker}</span>
          {query && query.toLowerCase() !== displayCompany.toLowerCase() && (
            <span className="mono small mute">· matched from "{query}"</span>
          )}
        </div>
        <div className="mono small mute">claude-sonnet-4 · rubric v3.2</div>
      </div>

      <div className="ana-stage">
        {/* Left: claim under analysis */}
        <aside className="ana-claim">
          <div className="ana-claim-head">
            <span className="mono small mute">CLAIM · {claim.id}</span>
          </div>
          <h2 className="ana-claim-headline">{claim.headline}</h2>
          <blockquote className="ana-claim-quote">
            &ldquo;{claim.shortQuote}&rdquo;
          </blockquote>
          <div className="ana-claim-src mono small mute">{claim.source}</div>
          <div className="ana-claim-meta">
            <div className="ana-claim-meta-row">
              <span className="mute">Company</span>
              <span><strong>{displayCompany}</strong> <span className="mono mute">{displayTicker}</span></span>
            </div>
            <div className="ana-claim-meta-row">
              <span className="mute">Source type</span>
              <span>{claim.sourceType}</span>
            </div>
            <div className="ana-claim-meta-row">
              <span className="mute">Captured</span>
              <span className="mono">{claim.capturedAt}</span>
            </div>
          </div>
        </aside>

        {/* Center: pipeline */}
        <main className="ana-pipeline">
          <div className="ana-title-row">
            <h1 className="ana-title">Analysing claim<span className="dots"><span></span><span></span><span></span></span></h1>
            <div className="ana-subtle mono">claude-sonnet-4 · rubric v3.2</div>
          </div>

          <ol className="ana-steps">
            {steps.map((step, i) => {
              const state = doneSteps.has(step.key) ? "done"
                          : i === stepIdx ? "active"
                          : "pending";
              return (
                <li key={step.key} className={"ana-step s-" + state}>
                  <div className="ana-step-rail">
                    <div className="ana-step-bullet">
                      {state === "done" && <svg viewBox="0 0 12 12" width="10" height="10"><path d="M2 6 L5 9 L10 3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      {state === "active" && <span className="ana-step-spinner"></span>}
                      {state === "pending" && <span className="ana-step-dot"></span>}
                    </div>
                    {i < steps.length - 1 && <div className="ana-step-line"></div>}
                  </div>
                  <div className="ana-step-body">
                    <div className="ana-step-head">
                      <span className="ana-step-num mono">{String(i + 1).padStart(2, "0")}</span>
                      <span className="ana-step-label">{step.label}</span>
                      {state === "active" && <span className="ana-step-tag mono">RUNNING</span>}
                      {state === "done" && <span className="ana-step-tag done mono">OK</span>}
                    </div>
                    <div className="ana-step-detail">{step.detail}</div>
                    {state === "active" && <div className="ana-step-progress"><div className="ana-step-progress-fill"></div></div>}
                  </div>
                </li>
              );
            })}
          </ol>

          {allDone && !timedOut && (
            <div className="ana-done">
              <span className="mono small">{apiResult ? "Verdict ready" : "Awaiting API response…"}</span>
              {apiResult && <span className="ana-done-arrow">→</span>}
            </div>
          )}

          {/* US-02: 60s timeout UI with retry */}
          {timedOut && (
            <div className="ana-timeout">
              <div className="ana-timeout-msg">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/><path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                Analysis is taking longer than expected
              </div>
              <button className="rep-action small" onClick={() => {
                setTimedOut(false);
                setRetryCount(n => n + 1);
              }}>
                Retry →
              </button>
            </div>
          )}

          {/* API error (non-timeout, non-unavailable) */}
          {apiError && !timedOut && (
            <div className="ana-api-status mono small mute">
              API unavailable · using demo data
            </div>
          )}
        </main>

        {/* Right: live signals dashboard */}
        <aside className="ana-signals">
          <div className="ana-signal-card">
            <div className="signal-lbl mono small">RISK BUILDING</div>
            <div className="signal-num" style={{ color: partialScore > 60 ? "var(--c-bad)" : partialScore > 30 ? "var(--c-warn)" : "var(--c-ok)" }}>
              {partialScore}
            </div>
            <div className="signal-sub mono small mute">/ 100 · provisional</div>
            <div className="signal-bar">
              <div className="signal-bar-z z-ok"></div>
              <div className="signal-bar-z z-warn"></div>
              <div className="signal-bar-z z-bad"></div>
              <div className="signal-bar-needle" style={{ left: partialScore + "%" }}></div>
            </div>
          </div>

          <div className="ana-signal-card">
            <div className="signal-lbl mono small">CONFIDENCE</div>
            <div className="signal-num small-num">{confidence}<span className="pct">%</span></div>
            <div className="signal-sub mono small mute">model-reported</div>
            <div className="signal-conf-bar">
              <div className="signal-conf-fill" style={{ width: confidence + "%" }}></div>
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
              <div className="signal-num small-num" style={{ color: contradictions > 0 ? "var(--c-bad)" : "var(--c-ink-0)" }}>{contradictions}</div>
              <div className="signal-sub mono small mute">vs external data</div>
            </div>
          </div>

          <div className="ana-signal-card live">
            <div className="signal-lbl mono small">LIVE QUERIES</div>
            <div className="ana-live-queries">
              <LiveQueries stepIdx={stepIdx} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function LiveQueries({ stepIdx }) {
  const QUERIES = [
    "GET  petrovera.com/sustainability/report-2025.pdf",
    "GET  cdp.net/api/v1/responses?company=petrovera",
    "GET  ec.europa.eu/clima/ets/registry/petrovera",
    "GET  sciencebasedtargets.org/companies/petrovera",
    "GET  newsapi.org/v2/everything?q=petrovera+esg",
    "GET  ogmpartnership.com/members/petrovera",
    "POST anthropic.com/v1/messages   model=claude-sonnet-4",
    "PARSE  31 candidate spans → 8 normalised claims",
    "DIFF  scope-1 reported vs EU ETS verified",
    "RANK  evidence by weight, kind, recency",
  ];
  const visible = Math.min(QUERIES.length, 3 + stepIdx * 2);
  const slice = QUERIES.slice(0, visible);
  return (
    <ul className="live-q mono small">
      {slice.map((q, i) => {
        const isLast = i === slice.length - 1 && stepIdx < 5;
        return <li key={i} className={isLast ? "live-q-active" : ""}>{isLast ? "›" : "·"} {q}</li>;
      })}
    </ul>
  );
}

export default AnalysisScreen;
