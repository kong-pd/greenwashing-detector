// 08 — The Claim and Report-PDF tabs are REAL inputs (P2-6 / C-4, plus the
//      _manualContent threading bug discovered during P2 recon).
//
// Before this fix:
//   · Claim tab mapped any pasted text to a hash-picked Petrovera demo claim.
//   · Upload tab extracted the PDF's text and then silently DROPPED it —
//     `_manualContent` was attached to the claim in App.jsx and never read
//     by AnalysisScreen, so the pipeline scraped (and failed) anyway.
//
// The contract: both tabs feed the user's own content into the real
// pipeline as manual_content, the loading screen is honest about the
// input mode ("MANUAL INPUT"), and the report belongs to the named company.

import { test, expect } from "@playwright/test";
import { expectReport } from "./helpers.js";

const CLAIM_TEXT =
  "We will reach net-zero across all operations by 2050 and have already " +
  "cut Scope 1 emissions by 40% against our 2019 baseline.";

test("Claim tab: pasted claim + company name run the real manual pipeline", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Claim" }).click();

  await page.getByPlaceholder(/Company behind this claim/).fill("Nordwind Energy");
  await page.getByPlaceholder(/Paste a sustainability claim/).fill(CLAIM_TEXT);
  await page.getByRole("button", { name: "Analyse claim →" }).click();

  // Honest about the degraded input mode, and about whose claim it is.
  await expect(page.locator(".ana-context-ticker")).toHaveText("MANUAL INPUT");
  await expect(page.locator(".ana-context-co")).toHaveText("Nordwind Energy");

  await expectReport(page, { score: 72, risk: "High Risk" });
  await expect(page.locator(".rep-crumb-co")).toHaveText("Nordwind Energy");
});

test("Report-PDF tab: extracted file text reaches the pipeline as manual content", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Report PDF" }).click();

  // The tab reads the file client-side with FileReader.readAsText, so a
  // text payload with a .pdf name exercises the exact threading path.
  await page.locator('input[type="file"]').setInputFiles({
    name: "Baltic-Paper-Group.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(
      "Baltic Paper Group sustainability report 2025. Net-zero by 2045; " +
      "62% recycled fibre share; SBTi target submitted."
    ),
  });

  // Regression pin for the discovered bug: the old code dropped the text
  // and fell into the scrape-failure screen. The fixed path goes straight
  // to a MANUAL INPUT run and completes.
  await expect(page.locator(".ana-context-ticker")).toHaveText("MANUAL INPUT");
  await expect(page.getByText("ESG PAGE NOT FOUND", { exact: true })).toHaveCount(0);

  await expectReport(page, { score: 72, risk: "High Risk" });
  await expect(page.locator(".rep-crumb-co")).toHaveText("Baltic Paper Group");
});
