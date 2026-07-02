// 10 — AI-1: the relevance gate refuses non-ESG content honestly.
//
// The founding failure: a random homework PDF got a confident "high risk
// greenwashing" verdict. The contract: content without sustainability
// signals is refused with its own copy — never scored, never a report.
// (Spec written before the gate existed; red on first run.)
import { test, expect } from "@playwright/test";
import { SEARCH_PLACEHOLDER } from "./helpers.js";

test("non-ESG content is refused, not scored", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Claim" }).click();
  await page.getByPlaceholder(/Company behind this claim/).fill("Sweet Crumbs Bakery");
  await page.getByPlaceholder(/Paste a sustainability claim/).fill(
    "Cream the butter and sugar, fold in flour and cocoa, bake at 180C for " +
    "35 minutes, then cool on a wire rack before icing generously."
  );
  await page.getByRole("button", { name: "Analyse claim →" }).click();

  await expect(page.getByText("NOT SUSTAINABILITY CONTENT", { exact: true })).toBeVisible();
  await expect(page.getByText(/didn't carry enough sustainability signals/)).toBeVisible();
  await expect(page.locator(".rep-topbar-score-num")).toHaveCount(0);

  await page.getByRole("button", { name: "← Back to search" }).click();
  await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible();
});
