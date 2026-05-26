// AnalysisScreen.jsx — the "AI thinking" moment.
// Runs the pipeline animation in parallel with a real backend call.
// Uses polling (POST → job_id → GET until complete) to match our async backend.
// Falls back to the static demo claim if the API is unavailable.

import { useState, useEffect, useRef, useCallback } from "react";
import { GWD_DATA } from "../data.js";

// ─── API constants ─────────────────────────────────────────────────────────
const POLL_INTERVAL_MS  = 3000;
const API_TIMEOUT_MS    = 60000;  // US-02: show timeout UI after 60s

// ─── API helpers ───────────────────────────────────────────────────────────

async function startAnalysis(query, signal) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Send both field names for maximum compat
    body: JSON.stringify({ company_name: query, query }),
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
// Maps whatever the backend returns onto the shape the frontend components
// expect, using the demo claim as a safety-net for any missing fields.
function normalise(raw, demoClaim) {
  if (!raw || raw.error) return null;

  // If the backend already returned a completed report, reshape it
  const dim = raw.dimensionScores || raw.dimension_scores || {};
  const flags = (raw.flags || []).map(f => ({
    type:        f.type        || "Finding",
    severity:    f.severity    || inferSeverity(f.type),
    description: f.description || "",
    source:      f.source      || "",
  }));

  return {
    // Merge demo claim first so any missing field has a safe default
    ...demoClaim,
    // Then override with real API data
    id:           raw.id        || raw.job_id || demoClaim.id,
    score:        raw.score     ?? demoClaim.score,
    riskLevel:    raw.riskLevel || raw.risk_level || demoClaim.riskLevel,
    summary:      raw.summary   || demoClaim.summary,
    confidence:   raw.confidence ?? demoClaim.confidence,
    company_name: raw.company_name || demoClaim.company_name,
    headline:     raw.headline  || raw.company_name || demoClaim.headline,
    analyzedAt:   raw.analyzedAt || raw.completed_at || demoClaim.analyzedAt,
    dimensionScores: {
      specificity:               dim.specificity               ?? demoClaim.dimensionScores.specificity,
      data_consistency:          dim.data_consistency          ?? demoClaim.dimensionScores.data_consistency,
      third_party_certification: dim.third_party_certification ?? demoClaim.dimensionScores.third_party_certification,
      negative_news:             dim.negative_news             ?? demoClaim.dimensionScores.negative_news,
      greenwashing_language:     dim.greenwashing_language     ?? demoClaim.dimensionScores.greenwashing_language,
    },
    // Only override flags/evidence if the API actually returned them
    flags:    flags.length    > 0 ? flags    : demoClaim.flags,
    evidence: raw.evidence?.length > 0 ? raw.evidence : demoClaim.evidence,
  };
}

function inferSeverity(type) {
  if (!type) return "medium";
  if (["Data Contradiction", "Negative News"].includes(type)) return "high";
  if (["Vague Claims", "Lack of Certification"].includes(type)) return "medium";
  return "low";
}

// ─── Component ─────────────────────────────────────────────────────────────

export function AnalysisScreen({ claim, query, onComplete }) {
  const steps = GWD_DATA.PIPELINE_STEPS;

  // Pipeline animation state
  const [stepIdx,        setStepIdx]        = useState(0);
  const [doneSteps,      setDoneSteps]      = useState(new Set());
  const [confidence,     setConfidence]     = useState(0);
  const [partialScore,   setPartialScore]   = useState(0);
  const [evidenceFound,  setEvidenceFound]  = useState(0);
  const [contradictions, setContradictions] = useState(0);

  // API state
  const [apiResult, setApiResult] = useState(null);
  const [apiError,  setApiError]  = useState(null);
  const [timedOut,  setTimedOut]  = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const finished      = useRef(false);
  const pipelineDone  = useRef(false);
  const abortRef      = useRef(null);

  const company      = GWD_DATA.COMPANY;
  const displayName  = company.legalName;
  const displayTicker = company.ticker;

  // ── 1. Pipeline animation ────────────────────────────────────────────────
  useEffect(() => {
    if (finished.current) return;
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
  }, [stepIdx, apiResult, apiError]);

  // ── 2. Animate counters toward final values ──────────────────────────────
  useEffect(() => {
    const target = apiResult ?? claim;
    const progress = Math.min(
      1,
      (stepIdx + (doneSteps.size > stepIdx ? 1 : 0)) / steps.length,
    );
    setConfidence(Math.round(progress * (target.confidence ?? 0.85) * 100));
    setPartialScore(Math.round(progress * target.score));
    setEvidenceFound(Math.round(progress * target.evidence.length));
    setContradictions(Math.round(
      progress * target.flags.filter(f => f.type === "Data Contradiction").length,
    ));
  }, [stepIdx, doneSteps, apiResult]);

  // ── 3. Real API call with polling ────────────────────────────────────────
  const runFetch = useCallback(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setApiError(null);
    setTimedOut(false);

    const deadline = Date.now() + API_TIMEOUT_MS;

    async function run() {
      try {
        // Step 1 — POST /api/analyze → get job_id
        const initRes = await startAnalysis(query ?? claim.headline, ac.signal);

        // If already completed (cache hit), we're done
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

        // Step 2 — poll until complete or timeout
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
            if (poll.fail_reason === "scraping_failed") {
              // Fallback to demo — scraping expected to fail in sandbox
              setApiResult(claim);
            } else {
              setApiError(poll.fail_reason || "Analysis failed");
            }
            if (pipelineDone.current && !finished.current) {
              finished.current = true;
              setTimeout(() => onComplete?.(claim), 700);
            }
            return;
          }
        }

        // Timeout
        if (!ac.signal.aborted) {
          setTimedOut(true);
          if (pipelineDone.current && !finished.current) {
            finished.current = true;
            setTimeout(() => onComplete?.(claim), 700);
          }
        }

      } catch (err) {
        if (err.name === "AbortError") return;
        // 404 / network error → API not up yet, use demo data silently
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
  }, [query, claim, retryCount]);

  useEffect(() => {
    return runFetch();
  }, [runFetch]);

  const allDone = stepIdx >= steps.length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="analysis-screen">
      <div className="ana-context-bar">
        <div className="ana-context-l">
          <span className="mono small mute">ANALYSING</span>
          <span className="ana-context-co">{displayName}</span>
          <span className="ana-context-ticker mono">{displayTicker}</span>
          {query && query.toLowerCase() !== displayName.toLowerCase() && (
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
              <span>
                <strong>{displayName}</strong>{" "}
                <span className="mono mute">{displayTicker}</span>
              </span>
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

        {/* Centre: pipeline steps */}
        <main className="ana-pipeline">
          <div className="ana-title-row">
            <h1 className="ana-title">
              Analysing claim
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
                onClick={() => { setTimedOut(false); setRetryCount(n => n + 1); }}>
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

        {/* Right: live signals */}
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
    "GET  company.com/sustainability/report.pdf",
    "GET  cdp.net/api/v1/responses?company=...",
    "GET  ec.europa.eu/clima/ets/registry/...",
    "GET  sciencebasedtargets.org/companies/...",
    "GET  newsapi.org/v2/everything?q=...+esg",
    "GET  ogmpartnership.com/members/...",
    "POST anthropic.com/v1/messages   model=claude-sonnet-4",
    "PARSE  candidate spans → normalised claims",
    "DIFF  scope-1 reported vs EU ETS verified",
    "RANK  evidence by weight, kind, recency",
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
