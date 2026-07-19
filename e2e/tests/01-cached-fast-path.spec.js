// 01 — Cached fast path (US-03).
//
// "Shell" is one of five pre-computed companies bundled with the frontend.
// The browser must render it without making POST /api/analyze at all, so the
// portfolio narrative remains available while the entire backend is down.
//
// Full path exercised: bundled cache → response normaliser → React report.

import { test, expect } from "@playwright/test";
import { startSearch, expectAnalysing, expectReport } from "./helpers.js";

test("cached company renders a full report without live analysis", async ({ page }) => {
  let analyzeRequests = 0;
  await page.route("**/api/analyze", (route) => {
    analyzeRequests += 1;
    return route.abort("connectionrefused");
  });

  await startSearch(page, "Shell");
  await expectAnalysing(page, "Shell");

  // Values pinned in local_cache.json — deterministic by construction.
  await expectReport(page, { score: 78, risk: "High Risk" });

  // The report is substantive, not a bare score: company identity,
  // dimension rubric, and the evidence trail section all rendered.
  await expect(page.locator(".rep-crumb-co")).toHaveText("Shell");
  await expect(page.getByText("§ 2 · DIMENSIONAL SCORING")).toBeVisible();
  await expect(page.getByText("§ 4 · EVIDENCE TRAIL")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open full trail →" })).toBeVisible();
  expect(analyzeRequests).toBe(0);
});
