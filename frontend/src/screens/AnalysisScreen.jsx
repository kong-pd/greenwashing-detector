// AnalysisScreen.jsx — US-05, US-06, US-07, FR-04
// Changes vs original:
//   - scraping_failed split into scraping_blocked / scraping_not_found
//   - ManualInputFallback receives failReason prop and shows contextual banner
//   - Both fail reasons trigger manual input (same UX flow, different message)

import { useState, useEffect, useRef, useCallback } from "react";
import { GWD_DATA, MODEL_CHAIN_LABEL, RUBRIC_VERSION } from "../data.js";
import { getPreCachedReport } from "../preCachedReports.js";

// ─── Constants ─────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 3000;
const API_TIMEOUT_MS   = 60000;
// Completed results often arrive with the full event batch on the last poll.
// Keep that truthful log readable long enough to render before handing off.
const RESULT_HANDOFF_DELAY_MS = 1500;

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

// ── W1 spine: the live view is the user-level projection of the trace ──
const STEP_SPANS = {
  fetch:   ["scrape", "cache"],
  extract: ["scrape", "cache", "relevance"],
  enrich:  ["enrich", "cache"],
  analyze: ["analyze", "cache"],
  compose: ["persist", "cache"],
};

// A step may only complete once its span has reported. Before the first
// poll lands, the timer keeps its rhythm (pacing theater is fine —
// content theater is not).
export function stepSatisfied(key, events) {
  if (!events || events.length === 0) return true;
  const spans = STEP_SPANS[key] || [];
  return events.some(e =>
    (e.type === "success" || e.type === "progress") && spans.includes(e.span));
}

export function formatEvent(e) {
  const d = e.data || {};
  switch (e.name) {
    case "cache_hit":        return "Cache hit · precomputed report";
    case "manual_content":   return `Manual content · ${d.chars ?? "?"} chars`;
    case "page_found":       return `ESG page found · ${d.chars ?? "?"} chars`;
    case "snippet_fallback": return "Degraded source · search snippets";
    case "sources_found":    return `External sources · ${d.sources ?? 0}`;
    case "relevance_checked": return `Relevance check · ${d.signals ?? 0} signals`;
    case "model_used":       return `Model · ${d.model} (layer ${d.layer})`;
    case "stage_retry":      return `Retrying ${e.span} · attempt ${d.attempt}`;
    case "db_saved":         return "Saved to database";
    case "relay_only":       return "DB unavailable · served via relay";
    default:                 return `${e.span} · ${e.name}`;
  }
}

async function pollReport(jobId, signal) {
  const res = await fetch(`/api/report/${jobId}`, { signal });
  if (!res.ok) throw new Error(`Poll ${res.status}`);
  return res.json();
}

// ─── Response normaliser ───────────────────────────────────────────────────
// FR-37: Never spread demoClaim as defaults — demoClaim is a generic blank
//        template (makeLiveClaim) or a Petrovera fixture. Spreading it would
//        leak Petrovera flags/evidence into real company reports when the API
//        returns incomplete data. All fields must come from raw or be empty/0.
export function normalise(raw, demoClaim) {
  if (!raw || raw.error) return null;

  const dim = raw.dimensionScores || raw.dimension_scores || {};

  const flags = (raw.flags || []).map(f => ({
    type:        f.type        || "Finding",
    severity:    f.severity    || inferSeverity(f.type),
    description: f.description || "",
    source:      f.source      || "",
  }));

  return {
    // identity — prefer API values, fall back to demoClaim only for display metadata
    id:           raw.id          || raw.job_id      || demoClaim.id,
    headline:     raw.headline    || raw.company_name || demoClaim.headline,
    company_name: raw.company_name || demoClaim.company_name,
    shortQuote:   demoClaim.shortQuote || "",
    source:       raw.source      || demoClaim.source,
    sourceType:   raw.sourceType  || demoClaim.sourceType || "AI Analysis",
    capturedAt:   demoClaim.capturedAt,
    analyzedAt:   raw.analyzedAt  || raw.completed_at || demoClaim.analyzedAt,

    // scoring — only from API; no Petrovera fallback
    score:      raw.score      ?? 0,
    riskLevel:  raw.riskLevel  || raw.risk_level || "—",
    risk_level: raw.risk_level || raw.riskLevel  || "—",
    summary:    raw.summary    || "",
    confidence: raw.confidence ?? null,

    dimensionScores: {
      specificity:               dim.specificity               ?? 0,
      data_consistency:          dim.data_consistency          ?? 0,
      third_party_certification: dim.third_party_certification ?? 0,
      negative_news:             dim.negative_news             ?? 0,
      greenwashing_language:     dim.greenwashing_language     ?? 0,
    },

    // flags & evidence — API only; empty if API returns nothing
    flags:    flags,
    evidence: raw.evidence || [],

    // Degraded-source marker (scraping_snippet_fallback): a *completed* job can
    // carry fail_reason as a data-quality note. Passed through so the Report
    // screen renders an honest "based on search snippets" banner. This value
    // sits beside (never replaces) the hard-failure reasons.
    rubricVersion: raw.rubric_version || raw.rubricVersion || null,
    modelUsed:     raw.model_used     || raw.modelUsed     || null,
    modelLayer:    raw.model_layer    ?? raw.modelLayer    ?? null,

    failReason:    raw.fail_reason || raw.failReason || null,
    contentSource: (raw.fail_reason || raw.failReason) === "scraping_snippet_fallback"
                     ? "snippet" : "page",
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

export function getScrapingCopy(failReason, companyName) {
  const template = SCRAPING_FAIL_COPY[failReason] || SCRAPING_FAIL_COPY.scraping_failed;
  return {
    title: template.title,
    body:  template.body.replace("{company}", companyName),
  };
}

export function isScrapingFailure(failReason) {
  return ["scraping_not_found", "scraping_blocked", "scraping_failed"].includes(failReason);
}

// ─── C-1: Analysis error copy ────────────────────────────────────────────────
// Non-scraping terminal failures (backend unreachable / pipeline error).
// These render the honest error card instead of the old behaviour of
// silently completing into a demo-data report.

const ANALYSIS_ERROR_COPY = {
  service_unreachable: {
    kicker: "SERVICE UNREACHABLE",
    title:  "Analysis service unreachable",
    body:   "We couldn't reach the analysis backend, so {company} was not analysed. On the hosted demo this usually means the Railway instance is cold-starting (~60 s) — try again in a moment.",
  },
  content_not_relevant: {
    kicker: "NOT SUSTAINABILITY CONTENT",
    title:  "This doesn't read as sustainability content",
    body:   "GreenCheck scores ESG claims and disclosures. The content provided for {company} didn't carry enough sustainability signals to score honestly — no verdict was produced.",
  },
  analysis_failed: {
    kicker: "ANALYSIS FAILED",
    title:  "Analysis failed",
    body:   "The pipeline reported an error while analysing {company}. No partial or demo result is shown — you can retry, or go back and try another company.",
  },
};

export function getAnalysisErrorCopy(error, companyName) {
  const template =
    ANALYSIS_ERROR_COPY[error?.kind] || ANALYSIS_ERROR_COPY.analysis_failed;
  return {
    kicker: template.kicker,
    title:  template.title,
    body:   template.body.replace("{company}", companyName),
    detail: error?.detail || null,
  };
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
export function AnalysisScreen({ claim, query, onComplete, onBack }) {
  const steps = GWD_DATA.PIPELINE_STEPS;

  const [stepIdx,        setStepIdx]        = useState(0);
  const [doneSteps,      setDoneSteps]      = useState(new Set());
  const [confidence,     setConfidence]     = useState(null);
  const [partialScore,   setPartialScore]   = useState(0);
  const [evidenceFound,  setEvidenceFound]  = useState(0);
  const [contradictions, setContradictions] = useState(0);

  const [apiResult,      setApiResult]      = useState(null);
  const [apiError,       setApiError]       = useState(null);
  const [timedOut,       setTimedOut]       = useState(false);
  const [retryCount,     setRetryCount]     = useState(0);

  // FR-04: scraping failure state — now tracks the specific fail reason
  const [scrapingFailReason, setScrapingFailReason] = useState(null); // null = no failure
  // P2-6: the Claim and Report-PDF tabs pre-supply content via
  // claim._manualContent — the pipeline then skips scraping entirely.
  // (Previously this field was attached upstream and silently dropped.)
  const [manualContent,      setManualContent]      = useState(claim?._manualContent ?? null);
  const [events,             setEvents]             = useState([]);

  const finished     = useRef(false);
  const pipelineDone = useRef(false);
  const abortRef     = useRef(null);

  const displayName = query || claim?.company_name || "Company";

  // ── 1. Pipeline animation ────────────────────────────────────────────────
  useEffect(() => {
    if (finished.current || scrapingFailReason || apiError) return;
    const timings = [900, 1100, 1500, 1700, 1200];
    if (stepIdx >= steps.length) {
      pipelineDone.current = true;
      // C-1: only a REAL result may complete this screen. Errors and
      // timeouts hold here — their cards offer retry / back, never a
      // demo-data report.
      if (apiResult !== null) {
        finished.current = true;
        const t = setTimeout(() => onComplete?.(apiResult), RESULT_HANDOFF_DELAY_MS);
        return () => clearTimeout(t);
      }
      return;
    }
    const key = steps[stepIdx].key;
    const wait = stepSatisfied(key, events) ? (timings[stepIdx] ?? 1200) : 400;
    const t = setTimeout(() => {
      if (!stepSatisfied(key, events)) return; // re-armed when events arrive
      setDoneSteps(prev => new Set([...prev, key]));
      setStepIdx(i => i + 1);
    }, wait);
    return () => clearTimeout(t);
  }, [stepIdx, apiResult, apiError, scrapingFailReason, events]);

  // ── 2. Animate counters ──────────────────────────────────────────────────
  useEffect(() => {
    const target = apiResult ?? claim;
    if (!target) return;
    const progress = Math.min(1,
      (stepIdx + (doneSteps.size > stepIdx ? 1 : 0)) / steps.length,
    );
    const reportedConfidence = apiResult?.confidence;
    setConfidence(
      reportedConfidence == null
        ? null
        : Math.round(progress * reportedConfidence * 100),
    );
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

    // US-03: the five named portfolio fixtures are a frontend-owned demo
    // fast path. They must remain available even when the entire web service
    // is down. Manual content deliberately bypasses this path because a
    // precomputed company report cannot answer the user's submitted text.
    const preCached = manualContent == null
      ? getPreCachedReport(query ?? claim?.headline ?? "")
      : null;
    if (preCached) {
      const merged = normalise(preCached, claim);
      setEvents(preCached.events);
      setApiResult(merged);
      if (pipelineDone.current && !finished.current) {
        finished.current = true;
        setTimeout(() => onComplete?.(merged), RESULT_HANDOFF_DELAY_MS);
      }
      return () => ac.abort();
    }

    const deadline = Date.now() + API_TIMEOUT_MS;

    async function run() {
      try {
        const initRes = await startAnalysis(
          query ?? claim?.headline ?? "",
          manualContent,
          ac.signal,
        );

        if (Array.isArray(initRes.events)) setEvents(initRes.events);
        if (initRes.status === "completed" || initRes.score != null) {
          const merged = normalise(initRes, claim);
          setApiResult(merged);
          if (pipelineDone.current && !finished.current) {
            finished.current = true;
            setTimeout(() => onComplete?.(merged), RESULT_HANDOFF_DELAY_MS);
          }
          return;
        }

        const jobId = initRes.job_id || initRes.id;
        if (!jobId) throw new Error("No job_id returned");

        while (!ac.signal.aborted && Date.now() < deadline) {
          await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
          if (ac.signal.aborted) return;

          const poll = await pollReport(jobId, ac.signal);
          if (Array.isArray(poll.events)) setEvents(poll.events);

          if (poll.status === "completed") {
            const merged = normalise(poll, claim);
            setApiResult(merged);
            if (pipelineDone.current && !finished.current) {
              finished.current = true;
              setTimeout(() => onComplete?.(merged), RESULT_HANDOFF_DELAY_MS);
            }
            return;
          }

          if (poll.status === "failed") {
            const reason = poll.fail_reason || "scraping_failed";

            if (isScrapingFailure(reason) && !manualContent) {
              // FR-04: show manual input with contextual message
              setScrapingFailReason(reason);
            } else {
              // C-1: non-scraping failure (or a manual retry that failed
              // again) — surface it. Never substitute demo data for a verdict.
              // AI-1: an irrelevant-content refusal gets its own honest copy.
              const kind = reason === "content_not_relevant"
                ? "content_not_relevant" : "analysis_failed";
              setApiError({ kind, detail: reason });
            }
            return;
          }
        }

        // US-07: Timeout
        if (!ac.signal.aborted) {
          // C-1: the timeout card (with its own Retry) is the terminal
          // state — no auto-completion into demo data after 1.5 s.
          setTimedOut(true);
        }

      } catch (err) {
        if (err.name === "AbortError") return;
        const isUnavailable =
          err.message.includes("404") ||
          err.message.includes("Failed to fetch") ||
          err.message.includes("NetworkError");
        // C-1: both branches land on the honest error card. The old code
        // silently completed into a demo-data report from here.
        setApiError(
          isUnavailable
            ? { kind: "service_unreachable" }
            : { kind: "analysis_failed", detail: err.message }
        );
      }
    }
    run();
    return () => ac.abort();
  }, [query, claim, retryCount, manualContent]);

  // Defer one tick so React StrictMode's development-only setup/cleanup probe
  // can cancel the first setup before it dispatches a real analysis job.
  // Without this guard one click creates two backend jobs in dev/E2E.
  useEffect(() => {
    let cleanup;
    const timer = setTimeout(() => { cleanup = runFetch(); }, 0);
    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [runFetch]);

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

  // C-1: shared restart for the timeout card and the error card.
  // Keeps manualContent — retrying a failed manual run resubmits the same text.
  function handleRetryAnalysis() {
    finished.current     = false;
    pipelineDone.current = false;
    setTimedOut(false);
    setApiError(null);
    setStepIdx(0);
    setDoneSteps(new Set());
    setRetryCount(n => n + 1);
  }

  const allDone = stepIdx >= steps.length;

  // ── C-1: honest error state ────────────────────────────────────────────────
  // Backend unreachable or a non-scraping pipeline failure. Nothing was
  // analysed, so nothing report-shaped is rendered — retry or leave.
  if (apiError) {
    const copy = getAnalysisErrorCopy(apiError, displayName);
    return (
      <div className="analysis-screen">
        <div className="ana-context-bar">
          <div className="ana-context-l">
            <span className="mono small mute">{copy.kicker}</span>
            <span className="ana-context-co">{displayName}</span>
          </div>
          <div className="mono small mute">Live analysis · halted</div>
        </div>
        <div className="fallback-wrap">
          <div className="fallback-card">
            <div className="fallback-banner">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M8 5v3.5M8 10v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <span><strong>{copy.title} — </strong>{copy.body}</span>
            </div>
            {copy.detail && (
              <div className="mono small mute" style={{ padding: "0 4px" }}>
                pipeline said: {copy.detail}
              </div>
            )}
            <div className="fallback-actions">
              <button className="rep-action ghost" onClick={onBack}>
                ← Back to search
              </button>
              <button className="rep-action" onClick={handleRetryAnalysis}>
                Try again →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
        <div className="mono small mute">{MODEL_CHAIN_LABEL} · rubric v{RUBRIC_VERSION}</div>
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
              <span className="mono">{MODEL_CHAIN_LABEL}</span>
            </div>
            {apiResult?.contentSource === "snippet" && (
              <div className="ana-claim-meta-row">
                <span className="mute">Source</span>
                <span className="mono" style={{ color: "var(--c-warn, #B0741A)" }}>
                  search snippets · degraded
                </span>
              </div>
            )}
            <div className="ana-claim-meta-row">
              <span className="mute">Rubric</span>
              <span className="mono">v{RUBRIC_VERSION} · 5 dimensions · 0–100</span>
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
            <div className="ana-subtle mono">{MODEL_CHAIN_LABEL} · rubric v{RUBRIC_VERSION}</div>
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
              <button className="rep-action small" onClick={handleRetryAnalysis}>
                Retry →
              </button>
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
              {confidence == null ? "—" : confidence}
              {confidence != null && <span className="pct">%</span>}
            </div>
            <div className="signal-sub mono small mute">
              {confidence == null ? "awaiting model report" : "model-reported"}
            </div>
            <div className="signal-conf-bar">
              <div className="signal-conf-fill" style={{ width: (confidence ?? 0) + "%" }} />
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
            <div className="signal-lbl mono small">PIPELINE EVENTS</div>
            <div className="ana-live-queries">
              <EventLog events={events} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// W1 spine: renders the user-level trace projection delivered by the poll.
// Every line here corresponds to something that actually happened.
function EventLog({ events }) {
  if (!events || events.length === 0) {
    return (
      <ul className="live-q mono small">
        <li className="live-q-active">› waiting for pipeline events…</li>
      </ul>
    );
  }
  return (
    <ul className="live-q mono small">
      {events.map((e, i) => (
        <li key={e.seq ?? i} className={i === events.length - 1 ? "live-q-active" : ""}>
          {i === events.length - 1 ? "›" : "·"} {formatEvent(e)}
        </li>
      ))}
    </ul>
  );
}

export default AnalysisScreen;
