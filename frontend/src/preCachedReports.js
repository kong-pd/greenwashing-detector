// The five portfolio-demo reports are bundled with the frontend so the
// showcase remains usable while the web service is sleeping or unavailable.
// Keep preCachedReports.json aligned with analysis/local_cache.json;
// preCachedReports.test.jsx enforces that contract in CI.
import cache from "./preCachedReports.json";

const DISPLAY_NAMES = {
  shell: "Shell",
  "h&m": "H&M",
  bp: "BP",
  tesla: "Tesla",
  patagonia: "Patagonia",
};

const ALIASES = {
  shell: "shell",
  "shell plc": "shell",
  "h&m": "h&m",
  "h & m": "h&m",
  "h and m": "h&m",
  hm: "h&m",
  bp: "bp",
  "bp plc": "bp",
  tesla: "tesla",
  "tesla inc": "tesla",
  "tesla inc.": "tesla",
  patagonia: "patagonia",
};

export const PRE_CACHED_COMPANIES = Object.freeze(Object.values(DISPLAY_NAMES));

function cacheKeyFor(companyName) {
  const key = String(companyName || "").trim().toLowerCase().replace(/\s+/g, " ");
  return ALIASES[key] || null;
}

function coerceEvidence(evidence) {
  if (!Array.isArray(evidence)) return [];
  return evidence.map((item, index) => {
    if (item && typeof item === "object") return { ...item };
    const value = String(item || "");
    return {
      id: "E-" + String(index + 1).padStart(2, "0"),
      kind: "Source",
      title: value,
      org: "",
      date: "",
      url: value.startsWith("http") ? value : "",
      quote: "",
      weight: 0.5,
    };
  });
}

/**
 * Return a fresh API-shaped report only for the five named demo companies.
 * Unknown companies return null and must still go through the live pipeline.
 */
export function getPreCachedReport(companyName) {
  const cacheKey = cacheKeyFor(companyName);
  const cached = cacheKey ? cache[cacheKey] : null;
  if (!cached) return null;

  const canonicalName = DISPLAY_NAMES[cacheKey];
  const evidence = coerceEvidence(cached.evidence || cached.sources);
  return {
    id: "pre-cached:" + cacheKey,
    job_id: "pre-cached:" + cacheKey,
    company_name: canonicalName,
    status: "completed",
    score: cached.score,
    risk_level: cached.risk_level || cached.riskLevel,
    confidence: cached.confidence ?? null,
    summary: cached.summary || "",
    dimension_scores: { ...(cached.dimension_scores || cached.dimensionScores || {}) },
    flags: (cached.flags || []).map(flag => ({ ...flag })),
    evidence,
    model_used: "precomputed-cache",
    model_layer: null,
    rubric_version: cached.rubric_version || "3.3",
    events: [{
      span: "cache",
      name: "cache_hit",
      type: "success",
      data: { source: "frontend-bundle", company: canonicalName },
    }],
  };
}
