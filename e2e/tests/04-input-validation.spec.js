// 04 — Landing input validation (US-01 AC2).
//
// Empty submissions must be rejected inline without navigating away and
// without firing an /api/analyze request — a cheap spec, but it pins the
// contract that the loading screen is only ever entered with real input.

import { test, expect } from "@playwright/test";
import { SEARCH_PLACEHOLDER } from "./helpers.js";

test("empty search shows inline validation and does not navigate", async ({ page }) => {
  let analyzeCalled = false;
  await page.route("**/api/analyze", (route) => {
    analyzeCalled = true;
    route.continue();
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Analyse →" }).click();

  await expect(
    page.getByText("Enter a company name, ticker, or paste a claim to continue")
  ).toBeVisible();

  // Still on the landing page, and the backend was never touched.
  await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible();
  expect(analyzeCalled).toBe(false);

  // The message is transient by design (auto-clears after ~3s).
  await expect(
    page.getByText("Enter a company name, ticker, or paste a claim to continue")
  ).toBeHidden({ timeout: 6_000 });
});
