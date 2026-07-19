// PROD-1 L1 — recentCards: the pure boundary between /api/history rows and
// the landing "Recent analyses" strip. C-2 was exactly this kind of seam
// (field mismatch between endpoint and UI), so the prep function gets its
// own contract: tolerate malformed rows, default the new source field for
// older payloads, and cap the strip.
import { describe, it, expect } from "vitest";
import { recentCards, loadHistoryReport } from "../hooks/useOpenReport.js";

const row = (job_id, company_name, over = {}) => ({
  job_id, company_name, score: 72, risk_level: "High Risk",
  completed_at: "2026-07-01T12:00:00+00:00", source: "relay", ...over,
});

describe("recentCards", () => {
  it("caps the strip at five cards, preserving backend order", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(`j-${i}`, `Co ${i}`));
    const cards = recentCards(rows);
    expect(cards.map(c => c.job_id)).toEqual(["j-0", "j-1", "j-2", "j-3", "j-4"]);
  });

  it("drops rows missing job_id or company_name instead of rendering shells", () => {
    const cards = recentCards([
      row("ok-1", "Aster Renewables"),
      row(undefined, "No Id Corp"),
      row("no-name", undefined),
    ]);
    expect(cards.map(c => c.job_id)).toEqual(["ok-1"]);
  });

  it("defaults a missing source to db (pre-L1 payloads, E2E-06 injection)", () => {
    const legacy = row("db-1", "Persisted Corp");
    delete legacy.source;
    expect(recentCards([legacy])[0].source).toBe("db");
  });

  it("keeps the relay tag so the UI can say 'this session' honestly", () => {
    expect(recentCards([row("r-1", "Aster")])[0].source).toBe("relay");
  });

  it("keeps the local tag so the UI can say 'this browser' honestly", () => {
    expect(recentCards([row("l-1", "Shell", { source: "local" })])[0].source).toBe("local");
  });

  it("returns [] for empty or non-array input (strip simply not rendered)", () => {
    expect(recentCards([])).toEqual([]);
    expect(recentCards(undefined)).toEqual([]);
    expect(recentCards(null)).toEqual([]);
  });
});

describe("loadHistoryReport", () => {
  const makeClaim = company => ({
    id: "LIVE", headline: company, company_name: company,
    source: "GreenCheck", sourceType: "AI Analysis",
  });
  const full = {
    id: "pre-cached:shell", company_name: "Shell", score: 78,
    risk_level: "High Risk", summary: "Cached summary", flags: [], evidence: [],
  };

  it("opens a browser row without calling the backend", async () => {
    let calls = 0;
    const loaded = await loadHistoryReport(
      { job_id: full.id, company_name: "Shell", source: "local", report: full },
      makeClaim,
      async () => { calls += 1; },
    );
    expect(loaded.score).toBe(78);
    expect(calls).toBe(0);
  });

  it("uses an attached browser snapshot if a backend report fetch fails", async () => {
    const loaded = await loadHistoryReport(
      { job_id: full.id, company_name: "Shell", source: "db", report: full },
      makeClaim,
      async () => { throw new Error("offline"); },
    );
    expect(loaded.summary).toBe("Cached summary");
  });
});
