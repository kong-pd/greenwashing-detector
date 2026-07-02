// 03 — Report interactions: evidence drawer + back navigation.
//
// The report is not a static page — auditability lives in the evidence
// drawer. This spec verifies the drawer opens with the real evidence list
// (5 sources for Shell), closes cleanly, and that the user can return to
// the landing page for a new search.

import { test, expect } from "@playwright/test";
import { startSearch, expectReport, SEARCH_PLACEHOLDER } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await startSearch(page, "Shell");
  await expectReport(page, { score: 78, risk: "High Risk" });
});

test("evidence drawer opens with all sources and closes", async ({ page }) => {
  await page.getByRole("button", { name: "Open full trail →" }).click();

  const drawer = page.getByRole("dialog", { name: "Evidence trail" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("5 sources")).toBeVisible(); // pinned in local_cache.json
  await expect(drawer.locator(".ev-drawer-title")).toHaveText("Shell");

  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toBeHidden();
});

test("back navigation walks the breadcrumb up, then top-nav returns to search", async ({ page }) => {
  // ← follows the breadcrumb (Reports / Shell / LIVE) one level up to the
  // Reports history list — not straight to the landing page.
  await page.locator(".rep-back").click();
  await expect(page.getByRole("heading", { name: "Analysis History" })).toBeVisible();

  // Top-nav "Search" is the way back to a fresh landing search.
  await page.getByRole("navigation").getByRole("button", { name: "Search" }).click();
  await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible();
  await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toHaveValue("");
});
