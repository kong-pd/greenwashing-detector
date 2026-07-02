// 06 — History opens the FULL report (C-2 / P1-2).
//
// The bug this spec pins down: /api/history returns thin rows (5 fields),
// and clicking one used to shove that thin row straight into ReportScreen —
// an empty shell: placeholder summary on a completed job, blank breadcrumb,
// zeroed dimensions, no findings.
//
// The contract: opening a history row must fetch the full record via the
// real GET /api/report/{job_id} and render a complete report.
//
// Hermetic strategy: the history LIST is a pure Supabase view and Supabase
// is deliberately dead here, so the list response is the ONE thing injected
// at the browser boundary. The seed job and the row-open fetch are real:
// the job is created through the public API into the NFR-09 relay, and the
// click hits the live backend which serves it from that relay.

import { test, expect } from "@playwright/test";
import { expectReport } from "./helpers.js";

const COMPANY = "Meridian Foods";
const BACKEND = "http://127.0.0.1:8000";

const SEED_TEXT =
  "Meridian Foods 2025 sustainability disclosure. We target net-zero " +
  "operations by 2045 and report a 9% reduction in Scope 2 emissions.";

test("opening a history row renders the full report, not a thin shell", async ({ page }) => {
  // ── Seed: a real completed job, created via the public API ──────────────
  const analyze = await page.request.post(`${BACKEND}/api/analyze`, {
    data: { company_name: COMPANY, manual_content: SEED_TEXT },
  });
  const { job_id } = await analyze.json();
  expect(job_id).toBeTruthy();

  // The mock pipeline completes into the relay within a moment.
  await expect
    .poll(
      async () => (await (await page.request.get(`${BACKEND}/api/report/${job_id}`)).json()).status,
      { timeout: 15_000 }
    )
    .toBe("completed");

  // ── The one injected boundary: the Supabase-backed list view ────────────
  await page.route("**/api/history", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        results: [{
          job_id,
          company_name: COMPANY,
          score: 72,
          risk_level: "High Risk",
          completed_at: "2026-07-02T05:00:00Z",
        }],
      }),
    })
  );

  // ── The user journey: Reports list → open → full report ─────────────────
  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { name: "Analysis History" })).toBeVisible();

  const row = page.locator(".rpts-row", { hasText: COMPANY });
  await expect(row).toBeVisible();
  // The meta line carries the real job id — never "undefined".
  await expect(row.locator(".rpts-meta")).toContainText(job_id);
  await expect(row.locator(".rpts-meta")).not.toContainText("undefined");

  await row.getByRole("button", { name: "Open →" }).click();

  // A COMPLETE report — every field the thin row lacked:
  await expectReport(page, { score: 72, risk: "High Risk" });          // topbar
  await expect(page.locator(".rep-crumb-co")).toHaveText(COMPANY);     // identity
  await expect(page.locator(".rep-summary-lede"))                      // §1 real summary,
    .toContainText("MOCK MODE");                                       // not the placeholder
  await expect(page.getByText(/\[MOCK\] Company claims a 15% reduction/))
    .toBeVisible();                                                    // §3 findings present

  // P3-12 (C-5): this report was opened FROM the Reports list, so the
  // breadcrumb root says "Reports" and ← returns there.
  await expect(page.locator(".rep-back")).toContainText("Reports");
  await page.locator(".rep-back").click();
  await expect(page.getByRole("heading", { name: "Analysis History" })).toBeVisible();
});
