// A bundled report never calls the backend, but it is still a completed
// analysis from the user's point of view. It must survive in browser history,
// remain visible after reload, and open without /api/report.

import { test, expect } from "@playwright/test";
import { startSearch, expectReport } from "./helpers.js";

test("pre-cached reports persist in Analysis History while the backend is offline", async ({ page }) => {
  let analyzeRequests = 0;
  let reportRequests = 0;

  await page.route("**/api/analyze", route => {
    analyzeRequests += 1;
    return route.abort("connectionrefused");
  });
  await page.route("**/api/history", route => route.abort("connectionrefused"));
  await page.route("**/api/report/**", route => {
    reportRequests += 1;
    return route.abort("connectionrefused");
  });

  await startSearch(page, "Shell");
  await expectReport(page, { score: 78, risk: "High Risk" });

  // Prove persistence, not just route-level React state.
  await page.reload();
  await page.getByRole("navigation").getByRole("button", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { name: "Analysis History" })).toBeVisible();
  await expect(page.locator(".co-head-blurb")).toContainText("1 completed analysis");
  await expect(page.locator(".co-head-blurb")).toContainText("backend unavailable");

  const row = page.locator(".rpts-row", { hasText: "Shell" });
  await expect(row).toBeVisible();
  await expect(row.locator(".rpts-meta")).toContainText("pre-cached:shell");
  await expect(row.locator(".rpts-meta")).toContainText("this browser");

  await row.getByRole("button", { name: "Open →" }).click();
  await expectReport(page, { score: 78, risk: "High Risk" });
  await expect(page.locator(".rep-crumb-co")).toHaveText("Shell");
  expect(analyzeRequests).toBe(0);
  expect(reportRequests).toBe(0);
});
