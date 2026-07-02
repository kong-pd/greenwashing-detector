// 09 — The loading screen shows REAL pipeline events (W1 spine).
//
// Before: the "LIVE QUERIES" panel printed hardcoded requests
// (google.serper.dev, generativelanguage.googleapis.com, …) that never
// happened — pacing theater was acceptable, content theater was not.
//
// The contract: the panel renders the user-level projection of the actual
// trace, delivered through the existing poll. A cache hit shows its one
// honest event; a live manual run shows manual-content → sources → model,
// and the completed report binds the model/rubric the pipeline recorded.

import { test, expect } from "@playwright/test";
import { startSearch, expectReport } from "./helpers.js";

test("live run: event log shows real trace events, fake queries are gone", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Claim" }).click();
  await page.getByPlaceholder(/Company behind this claim/).fill("Nordwind Energy");
  await page.getByPlaceholder(/Paste a sustainability claim/)
    .fill("We will reach net-zero by 2050, cutting Scope 1 emissions 40% below baseline.");
  await page.getByRole("button", { name: "Analyse claim →" }).click();

  // Real user-level events, arriving via the poll:
  await expect(page.getByText(/Manual content · \d+ chars/)).toBeVisible();
  await expect(page.getByText(/Relevance check · \d+ signals/)).toBeVisible();
  await expect(page.getByText(/External sources · 0/)).toBeVisible();
  await expect(page.getByText(/Model · mock \(layer 1\)/)).toBeVisible();

  // The hardcoded query theater is dead.
  await expect(page.getByText(/serper\.dev/)).toHaveCount(0);
  await expect(page.getByText(/generativelanguage/)).toHaveCount(0);

  // The report binds what the pipeline actually recorded.
  await expectReport(page, { score: 72, risk: "High Risk" });
  await expect(page.getByText("mock (layer 1)").first()).toBeVisible(); // masthead + byline both bind
  await expect(page.getByText(/rubric v3\.2/).first()).toBeVisible();
});

test("cache hit: the one honest event is shown instead of fake queries", async ({ page }) => {
  await startSearch(page, "Shell");
  await expect(page.getByText(/Cache hit/)).toBeVisible();
  await expect(page.getByText(/serper\.dev/)).toHaveCount(0);
  await expectReport(page, { score: 78, risk: "High Risk" });
});
