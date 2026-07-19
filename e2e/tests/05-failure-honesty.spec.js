// 05 — Failure honesty (C-1).
//
// The contract this spec pins down: when analysis cannot produce a real
// result — backend unreachable, or the pipeline reports a non-scraping
// failure — the UI must say so and offer a way out. It must NEVER complete
// into a report backed by demo data, and no Petrovera demo content may
// appear in the main canvas.
//
// Failure modes are injected at the browser boundary (page.route) because
// the hermetic stack is deliberately un-breakable: USE_MOCK never fails and
// the relay always answers. Intercepting fetch is the honest way to simulate
// "the network/pipeline broke" without un-hermetic tricks.
//
// (The 60s client timeout path shares the same no-demo-completion fix but is
// asserted by code review + the existing timeout card, not E2E — a 60s wait
// would double the suite for one branch.)

import { test, expect } from "@playwright/test";
import { startSearch, expectReport, SEARCH_PLACEHOLDER } from "./helpers.js";

test("uncached company + backend unreachable → honest error, retry accepts API recovery", async ({ page }) => {
  // Simulate the web-service being down / Railway cold and refusing connections.
  await page.route("**/api/analyze", (route) => route.abort("connectionrefused"));

  const company = "Aurora Textiles Group";
  await startSearch(page, company);

  // The honest error state: named, explained, actionable.
  await expect(page.getByText("SERVICE UNREACHABLE", { exact: true })).toBeVisible();
  await expect(page.getByText(/couldn't reach the analysis backend/)).toBeVisible();
  const retry = page.getByRole("button", { name: "Try again →" });
  await expect(retry).toBeVisible();
  await expect(page.getByRole("button", { name: "← Back to search" })).toBeVisible();

  // No report was faked into existence.
  await expect(page.locator(".rep-topbar-score-num")).toHaveCount(0);

  // Service "comes back" — retry accepts a completed API response.
  await page.unroute("**/api/analyze");
  await page.route("**/api/analyze", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      status: "completed",
      company_name: company,
      score: 42,
      risk_level: "Medium Risk",
      confidence: 0.72,
      summary: "Recovered API response",
      dimension_scores: {},
      flags: [],
      evidence: [],
      model_used: "test-provider",
      rubric_version: "3.3",
    }),
  }));
  await retry.click();
  await expectReport(page, { score: 42, risk: "Medium Risk" });
});

test("pipeline failure → error card, never a demo-data report", async ({ page }) => {
  // Real /api/analyze creates a real job; every poll is then forced to a
  // non-scraping failure (scraping failures have their own FR-04 path).
  await page.route("**/api/report/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "failed", fail_reason: "analysis_failed" }),
    })
  );

  await startSearch(page, "Aurora Textiles Group");

  await expect(page.getByText("ANALYSIS FAILED", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again →" })).toBeVisible();

  // The two lies this spec forbids: a conjured report, and Petrovera
  // demo content standing in for a real company.
  await expect(page.locator(".rep-topbar-score-num")).toHaveCount(0);
  await expect(page.locator(".gwd-main").getByText(/Petrovera/)).toHaveCount(0);

  // The escape hatch works.
  await page.getByRole("button", { name: "← Back to search" }).click();
  await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible();
});
