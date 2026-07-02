// 01 — Cached fast path (US-03).
//
// "Shell" is one of five pre-computed companies in analysis/local_cache.json.
// With Supabase unreachable, POST /api/analyze falls through its three-layer
// cache to local_cache.json and answers `status: completed` in a single round
// trip — the browser never enters the polling loop.
//
// Full stack exercised: Chromium → Vite proxy → web-service cache chain →
// local-cache job synthesis → response normaliser → React report render.

import { test, expect } from "@playwright/test";
import { startSearch, expectAnalysing, expectReport } from "./helpers.js";

test("cached company renders a full report without live analysis", async ({ page }) => {
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
});
