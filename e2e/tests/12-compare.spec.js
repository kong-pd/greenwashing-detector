// 12 — Two-company comparison (PROD-1 L2).
//
// The differentiated value the audit's deletions made room for: put two
// COMPLETED analyses side by side — scores, the five dimensions paired per
// row, and each side's top flags. Entry: select two rows in Reports.
//
// Hermetic strategy: nothing injected. Supabase is dead, so the Reports
// list exists only because of the L1 relay merge — this spec deliberately
// rides on that layer. Two jobs are seeded through the public API (the 06
// trick), and every fetch the compare screen makes is the real
// GET /api/report/{job_id} served from the relay.

import { test, expect } from "@playwright/test";

const BACKEND = "http://127.0.0.1:8000";
const CO_A = "Nordlicht Energie";
const CO_B = "Solvane Materials";

async function seed(page, company) {
  const res = await page.request.post(`${BACKEND}/api/analyze`, {
    data: {
      company_name: company,
      manual_content:
        `${company} sustainability disclosure 2025: net-zero emissions ` +
        `target, verified carbon reduction data, renewable energy sourcing.`,
    },
  });
  const { job_id } = await res.json();
  expect(job_id).toBeTruthy();
  await expect
    .poll(
      async () => (await (await page.request.get(`${BACKEND}/api/report/${job_id}`)).json()).status,
      { timeout: 15_000 }
    )
    .toBe("completed");
  return job_id;
}

test("selecting two reports opens a side-by-side comparison", async ({ page }) => {
  await seed(page, CO_A);
  await seed(page, CO_B);

  // ── Reports: pick two rows ───────────────────────────────────────────────
  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { name: "Analysis History" })).toBeVisible();

  const rowA = page.locator(".rpts-row", { hasText: CO_A });
  const rowB = page.locator(".rpts-row", { hasText: CO_B });
  await expect(rowA).toBeVisible();
  await expect(rowB).toBeVisible();

  // Layout guard (P2-5 regression, found by geometry probe): removing the
  // sidebar left .gwd-body's `260px 1fr` grid behind, and `reports` was a
  // sidebar route — so the whole screen fell into the 260px ghost track.
  // The list must occupy the real main column, not a gutter.
  const listBox = await page.locator(".rpts-list").boundingBox();
  expect(listBox.width).toBeGreaterThan(700);

  await rowA.getByRole("button", { name: "Select" }).click();
  // One selected → the bar is honest about what is still missing.
  const bar = page.locator(".rpts-compare-bar");
  await expect(bar).toBeVisible();
  await expect(bar).toContainText("Select one more report to compare");

  await rowB.getByRole("button", { name: "Select" }).click();
  await expect(bar).toContainText(CO_A);
  await expect(bar).toContainText(CO_B);

  // Selecting must not have hijacked the row's original action:
  // both rows still offer "Open →" (06's journey is untouched).
  await expect(rowA.getByRole("button", { name: "Open →" })).toBeVisible();

  await bar.getByRole("button", { name: "Compare →" }).click();

  // ── The comparison: both identities, both scores ─────────────────────────
  await expect(page.getByRole("heading", { name: "Comparison" })).toBeVisible();
  const cols = page.locator(".cmp-col");
  await expect(cols).toHaveCount(2);
  await expect(cols.nth(0)).toContainText(CO_A);
  await expect(cols.nth(1)).toContainText(CO_B);
  await expect(cols.nth(0)).toContainText("72");
  await expect(cols.nth(1)).toContainText("72");

  // Five dimensions, PAIRED per row — the point of a comparison view.
  const dims = page.locator(".cmp-dim-row");
  await expect(dims).toHaveCount(5);
  await expect(dims.first()).toContainText("Claim Specificity");
  await expect(dims.first().locator(".cmp-dim-fill")).toHaveCount(2);

  // Same layout guard on this screen, plus the assertion the probe showed
  // was missing: the fills must have REAL width, not just exist. (Counting
  // elements passed while the ghost track crushed every 1fr bar to 0px.)
  const dimsBox = await page.locator(".cmp-dims").boundingBox();
  expect(dimsBox.width).toBeGreaterThan(700);
  const fillBox = await dims.first().locator(".cmp-dim-fill").first().boundingBox();
  expect(fillBox.width).toBeGreaterThan(40);

  // Each side carries its own top flags (mock corpus → the [MOCK] findings).
  await expect(cols.nth(0).locator(".cmp-flag")).not.toHaveCount(0);
  await expect(cols.nth(1).getByText(/\[MOCK\]/).first()).toBeVisible();

  // ── The way back is honest and works ─────────────────────────────────────
  await page.locator(".cmp-back").click();
  await expect(page.getByRole("heading", { name: "Analysis History" })).toBeVisible();
});

test("two runs of the SAME company become a change narrative", async ({ page }) => {
  // PROD-3: comparing a company with itself is the accumulation loop's
  // payoff — the view stops being A-vs-B and starts answering "what
  // changed?". Two fresh Shell runs through the mock pipeline land on
  // identical scores/flags, which pins the honest zero-state too:
  // "± 0" and "no flag changes", never an invented delta.
  await seed(page, "Shell");
  await seed(page, "Shell");

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Reports" }).click();

  const shellRows = page.locator(".rpts-row", { hasText: "Shell" });
  await expect(shellRows.nth(1)).toBeVisible();
  await shellRows.nth(0).getByRole("button", { name: "Select" }).click();
  await shellRows.nth(1).getByRole("button", { name: "Select" }).click();
  await page.locator(".rpts-compare-bar").getByRole("button", { name: "Compare →" }).click();

  // Same-company mode announces itself and orders the runs in time:
  // the EARLIER run reads left, the LATEST right — a before/after, not A/B.
  await expect(page.locator(".cmp-same")).toContainText("SAME COMPANY");
  const cols = page.locator(".cmp-col");
  await expect(cols.nth(0)).toContainText("earlier");
  await expect(cols.nth(1)).toContainText("latest");

  // Identical runs → the delta is honestly zero…
  await expect(page.locator(".cmp-same")).toContainText("72 → 72");
  await expect(page.locator(".cmp-same")).toContainText("± 0");
  // …and the flag diff says so instead of inventing movement.
  await expect(page.getByText("No flag changes between runs")).toBeVisible();

  // PROD-2 reaches this screen too: the compared flags carry their chips.
  await expect(page.getByText("FTC §260.2").first()).toBeVisible();
});

test("deselecting collapses the bar; a third pick swaps out the oldest", async ({ page }) => {
  // Relay state persists across this file (workers=1): the two seeds above
  // are still listed. A third company completes the swap scenario.
  const CO_C = "Veridia Foods";
  await seed(page, CO_C);

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Reports" }).click();

  const row = (name) => page.locator(".rpts-row", { hasText: name });
  const bar = page.locator(".rpts-compare-bar");

  await row(CO_A).getByRole("button", { name: "Select" }).click();
  await row(CO_B).getByRole("button", { name: "Select" }).click();
  await expect(bar).toContainText(CO_A);

  // Third pick: no dead click, no scolding — the OLDEST selection yields.
  await row(CO_C).getByRole("button", { name: "Select" }).click();
  await expect(bar).not.toContainText(CO_A);
  await expect(bar).toContainText(CO_B);
  await expect(bar).toContainText(CO_C);

  // Toggling both off collapses the bar entirely — no orphaned chrome.
  await row(CO_B).getByRole("button", { name: "Selected" }).click();
  await row(CO_C).getByRole("button", { name: "Selected" }).click();
  await expect(bar).toHaveCount(0);
});
