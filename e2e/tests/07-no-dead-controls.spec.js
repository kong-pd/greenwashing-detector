// 07 — No dead controls (P2-5 / P2-8 / P2-9 / P1-4 / A-2 / A-6 / B-1..B-5).
//
// After the Petrovera demo universe is removed, the shell must contain no
// control that lies: no fake "LIVE" ticker, no Portfolio/Watchlist screens
// of fictional data, no ⌘K palette over fake domains, no sandbox account,
// no toast-only buttons. This spec is the structural regression guard —
// each assertion is a control that existed and did nothing (or lied).

import { test, expect } from "@playwright/test";
import { startSearch, expectReport } from "./helpers.js";

test("the shell contains only real navigation and real actions", async ({ page }) => {
  await page.goto("/");

  // Top nav is exactly the two real routes. (Scoped to .top-nav — the
  // landing page legitimately has a second <nav> for Methodology.)
  const nav = page.locator("nav.top-nav");
  await expect(nav.getByRole("button")).toHaveText(["Search", "Reports"]);

  // The fake account, ⌘K palette trigger and gear/settings are gone.
  await expect(page.locator(".top-user")).toHaveCount(0);
  await expect(page.locator(".top-search")).toHaveCount(0);
  await expect(page.locator(".icon-btn")).toHaveCount(0);

  // Landing bottom nav: no Petrovera doors; Methodology is REAL — it opens
  // the same scoring-rubric panel the report renders in §5.
  await expect(page.getByRole("button", { name: /Company Portfolio/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Recent Analyses/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Methodology/ }).click();
  const meth = page.getByRole("dialog", { name: "Methodology" });
  await expect(meth).toBeVisible();
  await expect(meth.getByText(/five/i).first()).toBeVisible();
  await meth.getByRole("button", { name: "Close" }).click();
  await expect(meth).toBeHidden();

  // Reports screen: no fake bulk export; and no "LIVE" ticker anywhere.
  await nav.getByRole("button", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { name: "Analysis History" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Export all/ })).toHaveCount(0);
  await expect(page.locator(".ticker")).toHaveCount(0);
  await expect(page.getByText("LIVE RISK FEED")).toHaveCount(0);

  // Report page: the toast-only "Flag as misranked" is gone from the
  // evidence drawer; the two real actions (open / cite) remain.
  await startSearch(page, "Shell");
  await expectReport(page, { score: 78, risk: "High Risk" });
  await page.getByRole("button", { name: "Open full trail →" }).click();
  const drawer = page.getByRole("dialog", { name: "Evidence trail" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Cite this source" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: /Flag as misranked/ })).toHaveCount(0);
});
