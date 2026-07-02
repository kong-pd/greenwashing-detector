// 02 — Scrape failure → manual-input recovery (FR-04), completing over the
//      NFR-09 in-memory relay. The suite's centrepiece: one journey proves
//      the two resilience mechanisms the product is built around.
//
// Leg 1 — failure surfaces honestly (FR-04):
//   An uncached company triggers a live job. With no SERPER_API_KEY the
//   scraper reports `scraping_not_found`; Supabase is down, so that verdict
//   reaches the browser purely via analysis-service memory → relay endpoint
//   → web-service fallback lookup → poll response. The UI must react by
//   offering the manual-input escape hatch, not by hanging or lying.
//
// Leg 2 — recovery completes end-to-end (FR-04 + NFR-09):
//   Pasting content restarts the pipeline (scrape skipped), the mock
//   analyzer scores it, the DB write fails again — and the finished report
//   still reaches the user through the same relay. "Job is not persisted,
//   user still receives their complete report" (NFR-09), asserted from a
//   real browser rather than a TestClient.

import { test, expect } from "@playwright/test";
import { startSearch, expectAnalysing, expectReport } from "./helpers.js";

const COMPANY = "Aurora Textiles Group"; // not in local_cache.json, no demo-name overlap

const PASTED_ESG_TEXT = `
Aurora Textiles Group Sustainability Statement 2025.
We are committed to achieving net-zero operations by 2050 and have reduced
Scope 1 emissions by 12% year over year. Our supply chain program covers
84% of tier-one suppliers, audited under our internal responsibility code.
`.trim();

test("scraping failure offers manual input; pasted content completes via relay", async ({ page }) => {
  await startSearch(page, COMPANY);
  await expectAnalysing(page, COMPANY);

  // ── Leg 1: the honest failure state ────────────────────────────────────
  // First poll lands at ~3s; the relay already holds the failed verdict.
  // exact:true — Playwright string matching is case-insensitive, and the
  // banner copy "ESG page not found —" would otherwise also match.
  await expect(page.getByText("ESG PAGE NOT FOUND", { exact: true })).toBeVisible();
  await expect(page.getByText("FR-04 · Manual input mode")).toBeVisible();
  // Contextual copy names the company — not a generic error wall.
  await expect(page.getByText(new RegExp(`searched for ${COMPANY}`))).toBeVisible();

  // Both exits are offered: retry automation, or take over manually.
  await expect(
    page.getByRole("button", { name: "← Try automatic scraping again" })
  ).toBeVisible();

  // ── Leg 2: manual recovery ──────────────────────────────────────────────
  await page.getByPlaceholder(new RegExp(`Paste ${COMPANY}`)).fill(PASTED_ESG_TEXT);
  await page.getByRole("button", { name: "Continue analysis →" }).click();

  // Pipeline restarts and is transparent about the degraded input mode.
  await expect(page.locator(".ana-context-ticker")).toHaveText("MANUAL INPUT");
  await expect(page.getByText("User-provided content", { exact: true })).toBeVisible();

  // Mock analyzer verdict (analyzer.py MOCK_RESULT), delivered despite the
  // database being unreachable for the entire journey.
  await expectReport(page, { score: 72, risk: "High Risk" });
  await expect(page.locator(".rep-crumb-co")).toHaveText(COMPANY);
});
