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

test("a search-born report goes back to a fresh search (origin-aware ←)", async ({ page }) => {
  // P3-12 (C-5): the breadcrumb root and the ← button remember the origin.
  // This report came from a landing search, so both say "Search" and back
  // lands on a fresh landing page — not on the Reports list.
  await expect(page.locator(".rep-back")).toContainText("Search");
  await page.locator(".rep-back").click();
  await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible();
  await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toHaveValue("");
});
