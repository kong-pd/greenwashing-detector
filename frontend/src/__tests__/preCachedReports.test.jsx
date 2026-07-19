import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import frontendCache from "../preCachedReports.json";
import {
  PRE_CACHED_COMPANIES,
  getPreCachedReport,
} from "../preCachedReports.js";

const canonicalCache = JSON.parse(readFileSync(
  fileURLToPath(new URL("../../../analysis/local_cache.json", import.meta.url)),
  "utf8",
));

describe("frontend-bundled pre-cached reports", () => {
  it("stays identical to the backend/analysis cache", () => {
    expect(frontendCache).toEqual(canonicalCache);
  });

  it("contains exactly the five portfolio companies", () => {
    expect(PRE_CACHED_COMPANIES).toEqual([
      "Shell", "H&M", "BP", "Tesla", "Patagonia",
    ]);
  });

  it.each([
    ["Shell", 78, "High Risk"],
    ["H&M", 71, "High Risk"],
    ["BP", 74, "High Risk"],
    ["Tesla", 44, "Medium Risk"],
    ["Patagonia", 18, "Low Risk"],
  ])("returns a complete API-shaped report for %s", (company, score, risk) => {
    const report = getPreCachedReport(company);
    expect(report).toMatchObject({
      company_name: company,
      status: "completed",
      score,
      risk_level: risk,
      model_used: "precomputed-cache",
      rubric_version: "3.3",
    });
    expect(report.summary.length).toBeGreaterThan(100);
    expect(report.flags.length).toBeGreaterThan(0);
    expect(report.evidence.length).toBeGreaterThan(0);
    expect(Object.keys(report.dimension_scores)).toHaveLength(5);
    expect(report.events[0].data.source).toBe("frontend-bundle");
  });

  it("never substitutes a fixture for an uncached company", () => {
    expect(getPreCachedReport("Aurora Textiles Group")).toBeNull();
    expect(getPreCachedReport("")).toBeNull();
  });

  it("accepts only explicit aliases, not broad substring matches", () => {
    expect(getPreCachedReport("shell plc")?.company_name).toBe("Shell");
    expect(getPreCachedReport("b")).toBeNull();
    expect(getPreCachedReport("Patagonia competitor")).toBeNull();
  });

  it("returns fresh objects so UI mutation cannot corrupt the next report", () => {
    const first = getPreCachedReport("Shell");
    first.flags[0].description = "mutated";
    first.evidence[0].title = "mutated";

    const second = getPreCachedReport("Shell");
    expect(second.flags[0].description).not.toBe("mutated");
    expect(second.evidence[0].title).not.toBe("mutated");
  });
});
