// 11 — Recent analyses on the landing page (PROD-1 L1).
//
// The audit removed the fake "Recent Analyses" door (a Petrovera nav button
// that led nowhere — spec 07 still pins its absence). This spec is the same
// surface earned back with real data: after a real analysis, the landing
// page shows a strip of recent results and clicking one opens the FULL
// report through the same C-2-hardened path the Reports list uses.
//
// Hermetic strategy: NOTHING is injected at the browser boundary here.
// Supabase is dead (closed port), so the ONLY way a card can appear is
// analysis-service /relay → web-service /api/history merge → strip. The
// spec therefore proves the whole layer end to end: seed one real job via
// the public API (the 06 trick), and let the product's own honesty about
// unpersisted results ("this session") carry the rest.

import { test, expect } from "@playwright/test";
import { expectReport } from "./helpers.js";

const COMPANY = "Aster Renewables";
const BACKEND = "http://127.0.0.1:8000";

const SEED_TEXT =
  "Aster Renewables 2025 sustainability disclosure. We commit to net-zero " +
  "emissions by 2040, cut Scope 1 carbon emissions 12% year over year, and " +
  "publish our renewable energy sourcing data for independent review.";

test("a finished analysis appears on the landing strip and opens the full report", async ({ page }) => {
  // ── Seed: one real completed job through the public API ─────────────────
  const analyze = await page.request.post(`${BACKEND}/api/analyze`, {
    data: { company_name: COMPANY, manual_content: SEED_TEXT },
  });
  const { job_id } = await analyze.json();
  expect(job_id).toBeTruthy();

  await expect
    .poll(
      async () => (await (await page.request.get(`${BACKEND}/api/report/${job_id}`)).json()).status,
      { timeout: 15_000 }
    )
    .toBe("completed");

  // ── Landing: the strip renders from the REAL merged /api/history ────────
  await page.goto("/");
  const strip = page.locator(".lv2-recent");
  await expect(strip).toBeVisible();
  await expect(strip.getByText("RECENT ANALYSES")).toBeVisible();

  // Never more than five cards, newest first — our seed is the newest
  // completed job in the relay, so it must lead the strip.
  const cards = strip.locator(".lv2-recent-card");
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(5);
  await expect(cards.first()).toContainText(COMPANY);

  // Supabase is dead in this topology, so this row exists only in the
  // relay — the strip must say so instead of implying persistence.
  const seedCard = cards.first();
  await expect(seedCard.getByText("this session")).toBeVisible();
  // The mock pipeline's score and risk, straight from the merge:
  await expect(seedCard).toContainText("72");
  await expect(seedCard).toContainText("High Risk");

  // ── Click-through: full report via the C-2 path, not a thin shell ───────
  await seedCard.click();
  await expectReport(page, { score: 72, risk: "High Risk" });
  await expect(page.locator(".rep-crumb-co")).toHaveText(COMPANY);
  await expect(page.locator(".rep-summary-lede")).toContainText("MOCK MODE");

  // Opened FROM the landing page → the way back is Search, and it works.
  await expect(page.locator(".rep-back")).toContainText("Search");
  await page.locator(".rep-back").click();
  await expect(page.getByRole("heading", { name: /Greenwashing/ })).toBeVisible();
});

test("structural guard: the strip is real cards, not a resurrected dead door", async ({ page }) => {
  await page.goto("/");
  // 07's original assertion, restated at the new surface: no nav BUTTON
  // named "Recent Analyses" — the strip label is a non-interactive heading
  // and every interactive element in it is a card naming a real company.
  await expect(page.getByRole("button", { name: /^Recent Analyses$/i })).toHaveCount(0);
  const strip = page.locator(".lv2-recent");
  if (await strip.count()) {
    const cardButtons = strip.getByRole("button");
    const n = await cardButtons.count();
    for (let i = 0; i < n; i++) {
      await expect(cardButtons.nth(i)).toContainText(/\S/); // named by content,
    }                                                       // never an empty shell
  }
});
