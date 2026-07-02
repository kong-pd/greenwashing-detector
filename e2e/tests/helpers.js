// e2e/tests/helpers.js — shared user-journey steps.
//
// Selector philosophy: user-visible text and ARIA roles first, semantic CSS
// classes only where the DOM offers nothing better. No data-testid pollution
// in production markup.

import { expect } from "@playwright/test";

export const SEARCH_PLACEHOLDER = /Company name, ticker, or ISIN/;

/** Landing page → type a company → click "Analyse →". */
export async function startSearch(page, company) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Greenwashing/ })).toBeVisible();
  await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill(company);
  await page.getByRole("button", { name: "Analyse →" }).click();
}

/** The loading screen is on: pipeline header shows the company being analysed. */
export async function expectAnalysing(page, company) {
  await expect(page.locator(".ana-context-co")).toHaveText(company);
}

/**
 * Wait out the animated pipeline (~6.4s floor) plus live polling, then assert
 * the report landed with the expected score and risk label.
 */
export async function expectReport(page, { score, risk }) {
  const scoreEl = page.locator(".rep-topbar-score-num");
  await expect(scoreEl).toBeVisible({ timeout: 30_000 });
  await expect(scoreEl).toHaveText(String(score));
  await expect(page.locator(".rep-topbar-score-lbl")).toHaveText(risk);
}
