// data.js — real pipeline metadata only.
// The Petrovera demo universe (COMPANY / PEERS / WATCHLIST / RECENT_CLAIMS /
// CLAIMS, ~400 lines of fiction) was removed in P2-5: every claim in the app
// is now live, and no screen renders invented data.

// Build-time copy of the active product pack metadata. packParity.test.jsx
// pins this value to analysis/packs/greenwash/pack.json so drift fails CI.
export const RUBRIC_VERSION = "3.3";
export const MODEL_CHAIN_LABEL = "Gemini / Groq / Claude";

export const PIPELINE_STEPS = [
  { key: "fetch",   label: "Fetching company content",     detail: "ESG page via search, or user-provided content" },
  { key: "extract", label: "Extracting claims",            detail: "Normalising content for analysis" },
  { key: "enrich",  label: "Gathering external data",      detail: "Serper news\u2009·\u2009Guardian (12-month window)" },
  { key: "analyze", label: "Scoring against rubric",       detail: "5 dimensions\u2009·\u2009model ladder with fallbacks" },
  { key: "compose", label: "Composing credibility report", detail: "Persisting\u2009·\u2009database with relay fallback" },
];

export const GWD_DATA = { PIPELINE_STEPS, RUBRIC_VERSION, MODEL_CHAIN_LABEL };
