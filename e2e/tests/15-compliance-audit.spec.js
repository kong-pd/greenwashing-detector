// 15 — Compliance-audit surfaces on the report (PROD-2 + PROD-4 pin).
//
// PROD-2: every flagged finding carries chips naming the regulation
// clauses a compliance reader would check first — a CURATED static map,
// shipped with an explicit "indicative, not legal advice" note. A
// compliance-scoring product that overstated its legal authority would
// be its own worst finding.
//
// PROD-4: the evidence drawer's weight breakdown (reliability / recency /
// relevance → weight) already existed from an earlier polish round but was
// never pinned — this spec closes that gap.
//
// Rides the cached Shell report: flags = Data Contradiction, Lack of
// Certification, Vague Claims; 5 evidence items (both pinned in
// local_cache.json).

import { test, expect } from "@playwright/test";
import { startSearch, expectReport } from "./helpers.js";

test("flags carry regulation chips and the drawer shows the weight derivation", async ({ page }) => {
  await startSearch(page, "Shell");
  await expectReport(page, { score: 78, risk: "High Risk" });

  // ── PROD-2: regulation chips on the flagged findings ─────────────────────
  await expect(page.getByText("EU GCD Art. 4").first()).toBeVisible();   // Data Contradiction
  await expect(page.getByText("FTC §260.6").first()).toBeVisible();      // Lack of Certification
  await expect(page.getByText("ISO 14021 §5.4").first()).toBeVisible();  // Vague Claims

  // Full regulation name travels as the tooltip, not more screen noise.
  await expect(
    page.locator(".reg-chip", { hasText: "EU GCD Art. 4" }).first()
  ).toHaveAttribute("title", /EU Green Claims Directive/);

  // The honesty note is part of the surface, not fine print elsewhere.
  await expect(page.getByText(/indicative .* not legal advice/i)).toBeVisible();

  // ── PROD-4 pin: weight breakdown in the evidence drawer ──────────────────
  await page.getByRole("button", { name: "Open full trail →" }).click();
  const drawer = page.getByRole("dialog", { name: "Evidence trail" });
  await expect(drawer).toBeVisible();
  await drawer.locator(".ev-drawer-list-item").first().click();

  await expect(drawer.getByText("WEIGHT BREAKDOWN")).toBeVisible();
  await expect(drawer.getByText("Source reliability")).toBeVisible();
  await expect(drawer.locator(".weight-bk-row")).toHaveCount(3);
});
