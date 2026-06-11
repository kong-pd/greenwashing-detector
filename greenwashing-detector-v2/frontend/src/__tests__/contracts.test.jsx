// Contract tests for the pure functions the API boundary depends on.
// Runs in node (no DOM): importing the screens only evaluates module scope.
import { describe, it, expect } from "vitest";
import { normalise, getScrapingCopy, isScrapingFailure }
  from "../screens/AnalysisScreen.jsx";
import { weightFactors, findEvidenceForFlag }
  from "../screens/ReportScreen.jsx";

const demoClaim = {
  id: "LIVE", headline: "Acme", company_name: "Acme",
  shortQuote: "", source: "GreenCheck live analysis", sourceType: "AI Analysis",
  capturedAt: "2026-06-10", analyzedAt: "2026-06-10",
  score: 0, riskLevel: "—", risk_level: "—", summary: "", confidence: 0.85,
  flags: [], evidence: [],
  dimensionScores: { specificity: 0, data_consistency: 0,
    third_party_certification: 0, negative_news: 0, greenwashing_language: 0 },
};

// ── normalise ──────────────────────────────────────────────────────────────

describe("normalise", () => {
  it("returns null on error envelopes (polling keeps going)", () => {
    expect(normalise(null, demoClaim)).toBeNull();
    expect(normalise({ error: "Job not found" }, demoClaim)).toBeNull();
  });

  it("FR-37: never leaks demo flags/evidence into live results", () => {
    const seeded = { ...demoClaim,
      flags: [{ type: "Leak", severity: "high", description: "x", source: "y" }],
      evidence: [{ id: "E-99" }] };
    const out = normalise({ status: "completed", score: 10 }, seeded);
    expect(out.flags).toEqual([]);
    expect(out.evidence).toEqual([]);
    expect(out.score).toBe(10);
  });

  it("maps snake_case payloads and infers severity", () => {
    const out = normalise({
      status: "completed", score: 61, risk_level: "High Risk",
      dimension_scores: { specificity: 12 },
      flags: [{ type: "Negative News", description: "d", source: "s" }],
      evidence: [],
    }, demoClaim);
    expect(out.riskLevel).toBe("High Risk");
    expect(out.dimensionScores.specificity).toBe(12);
    expect(out.flags[0].severity).toBe("high");
  });

  it("Phase-6: completed + snippet marker coexist → contentSource=snippet", () => {
    const out = normalise({
      status: "completed", score: 40,
      fail_reason: "scraping_snippet_fallback",
    }, demoClaim);
    expect(out.failReason).toBe("scraping_snippet_fallback");
    expect(out.contentSource).toBe("snippet");
  });

  it("full-page analyses report contentSource=page", () => {
    const out = normalise({ status: "completed", score: 40 }, demoClaim);
    expect(out.contentSource).toBe("page");
    expect(out.failReason).toBeNull();
  });
});

// ── weightFactors (M5 drawer bars) ─────────────────────────────────────────

describe("weightFactors", () => {
  const backendEv = {
    kind: "News", org: "Reuters", date: "2026-05-01",
    weight: 0.8, reliability: 0.85, recency: 0.95, relevance: 0.8,
  };

  it("prefers backend components and marks none as estimated", () => {
    const f = weightFactors(backendEv);
    expect(f.map(x => x.v)).toEqual([0.85, 0.95, 0.8]);
    expect(f.every(x => x.est === false)).toBe(true);
  });

  it("falls back to estimates for legacy items and says so", () => {
    const f = weightFactors({ kind: "Filing", date: "2024-01-01", weight: 0.9 });
    expect(f.every(x => x.est === true)).toBe(true);
    expect(f[0].v).toBe(0.92);          // legacy kind heuristic preserved
  });

  it('regression: "Unknown"/empty dates are never treated as recent', () => {
    // "U" > "2" lexicographically — the old code scored Unknown as 0.95.
    const unknown = weightFactors({ kind: "News", date: "Unknown", weight: 0.5 });
    expect(unknown[1].v).toBe(0.5);
    const empty = weightFactors({ kind: "News", date: "", weight: 0.5 });
    expect(empty[1].v).toBe(0.5);
  });
});

// ── findEvidenceForFlag (auditability jump) ────────────────────────────────

describe("findEvidenceForFlag", () => {
  const evidence = [
    { id: "E-01", org: "EU ETS Union Registry", title: "Verified emissions",
      url: "https://climate.ec.europa.eu" },
    { id: "E-02", org: "Reuters", title: "ACM opens inquiry into Shell",
      url: "https://reuters.com" },
  ];

  it("resolves the right evidence from a free-text source string", () => {
    const flag = { source: "EU ETS Union Registry 2024; Shell Memorandum" };
    expect(findEvidenceForFlag(flag, evidence)?.id).toBe("E-01");
  });

  it("requires ≥2 token hits — one generic word must not jump", () => {
    expect(findEvidenceForFlag({ source: "Registry" }, evidence)).toBeNull();
  });

  it("handles empty inputs without crashing", () => {
    expect(findEvidenceForFlag({ source: "" }, evidence)).toBeNull();
    expect(findEvidenceForFlag({ source: "x y" }, [])).toBeNull();
    expect(findEvidenceForFlag(null, evidence)).toBeNull();
  });
});

// ── scraping-failure copy ──────────────────────────────────────────────────

describe("scraping failure helpers", () => {
  it("two hard failures get distinct user copy", () => {
    const nf = getScrapingCopy("scraping_not_found", "Acme");
    const bl = getScrapingCopy("scraping_blocked", "Acme");
    expect(nf.title).not.toBe(bl.title);
    expect(nf.body).toContain("Acme");
  });

  it("snippet fallback is NOT a scraping failure (no manual-input UI)", () => {
    expect(isScrapingFailure("scraping_blocked")).toBe(true);
    expect(isScrapingFailure("scraping_not_found")).toBe(true);
    expect(isScrapingFailure("scraping_snippet_fallback")).toBe(false);
  });
});
