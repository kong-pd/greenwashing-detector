// data.js — real pipeline metadata only.
// The Petrovera demo universe (COMPANY / PEERS / WATCHLIST / RECENT_CLAIMS /
// CLAIMS, ~400 lines of fiction) was removed in P2-5: every claim in the app
// is now live, and no screen renders invented data.

export const PIPELINE_STEPS = [
  { key: "fetch",   label: "Fetching company content",     detail: "Resolving petrovera.com\u2009/\u2009sustainability\u2009; following 4 in-bound links" },
  { key: "extract", label: "Extracting claims",            detail: "Parsing Sustainability Report 2025\u2009; 31 candidate claim spans identified" },
  { key: "enrich",  label: "Gathering external data",      detail: "EU ETS\u2009·\u2009CDP\u2009·\u2009OGMP 2.0\u2009·\u2009SBTi\u2009·\u2009MSCI\u2009·\u2009NewsAPI (12-month window)" },
  { key: "analyze", label: "Scoring against rubric",       detail: "Specificity\u2009·\u2009Data Consistency\u2009·\u2009Verification\u2009·\u2009Negative News\u2009·\u2009Language" },
  { key: "compose", label: "Composing credibility report", detail: "Drafting summary\u2009·\u2009ranking evidence\u2009·\u2009citing sources" },
];

export const GWD_DATA = { PIPELINE_STEPS };
