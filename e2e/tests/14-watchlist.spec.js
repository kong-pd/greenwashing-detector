// 14 — Local-first watchlist + change since last analysis (PROD-1 L3).
//
// This closes the accumulation loop the audit's deletions made room for:
// star a company ON its report, run it again later, and the Reports page
// tells you what moved — baseline score → latest score with a signed
// delta. The list is localStorage and the UI says so ("local to this
// browser"); no fake sync, no fake account.
//
// Journey: cached Shell report (78) → ☆ Watch → survives a reload →
// a NEW manual Shell run lands at 72 (mock pipeline, via the relay) →
// Reports shows the watch row 78 → 72 (▼ -6) → Open latest → the 72
// report → back → unstar → the block is gone.

import { test, expect } from "@playwright/test";
import { startSearch, expectReport } from "./helpers.js";

const BACKEND = "http://127.0.0.1:8000";

test("watch a company, re-analyse it, and read the change since last analysis", async ({ page }) => {
  // ── Baseline: the cached Shell report, starred ───────────────────────────
  await startSearch(page, "Shell");
  await expectReport(page, { score: 78, risk: "High Risk" });

  const watchBtn = page.getByRole("button", { name: "☆ Watch" });
  await expect(watchBtn).toBeVisible();
  await watchBtn.click();
  await expect(page.getByRole("button", { name: "★ Watching" })).toBeVisible();

  // localStorage, not component state: the star survives a full reload.
  await page.reload();
  await expect(page.getByRole("heading", { name: /Greenwashing/ })).toBeVisible();
  await startSearch(page, "Shell");
  await expectReport(page, { score: 78, risk: "High Risk" });
  await expect(page.getByRole("button", { name: "★ Watching" })).toBeVisible();

  // ── A new run for the same company lands at a different score ───────────
  const res = await page.request.post(`${BACKEND}/api/analyze`, {
    data: {
      company_name: "Shell",
      manual_content:
        "Shell sustainability update 2026: revised net-zero emissions " +
        "pathway, verified carbon reduction milestones, renewable sourcing.",
    },
  });
  const { job_id } = await res.json();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`${BACKEND}/api/report/${job_id}`)).json()).status,
      { timeout: 15_000 }
    )
    .toBe("completed");

  // ── Reports: the watch row reads baseline → latest with the delta ───────
  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Reports" }).click();

  const watch = page.locator(".rpts-watch");
  await expect(watch).toBeVisible();
  await expect(watch).toContainText("local to this browser");
  const watchRow = watch.locator(".rpts-watch-row", { hasText: "Shell" });
  await expect(watchRow).toContainText("watched at 78");
  await expect(watchRow).toContainText("→ 72");
  await expect(watchRow).toContainText("▼ -6");

  // ── The row's actions are real: open the latest run ─────────────────────
  await watchRow.getByRole("button", { name: "Open latest →" }).click();
  await expectReport(page, { score: 72, risk: "High Risk" });
  await expect(page.locator(".rep-crumb-co")).toHaveText("Shell");
  await page.locator(".rep-back").click();

  // ── Unstar from the block: no orphaned chrome ────────────────────────────
  await page.locator(".rpts-watch-row", { hasText: "Shell" })
    .getByRole("button", { name: "★" }).click();
  await expect(page.locator(".rpts-watch")).toHaveCount(0);
});
