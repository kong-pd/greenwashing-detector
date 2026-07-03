// 13 — The DB-online topology (born from a user report: "multi-select
//      doesn't work, single-select only").
//
// Every other spec runs with Supabase DEAD (config points SUPABASE_URL at
// closed port 59999). The report couldn't be reproduced there OR here —
// but it exposed that the entire suite had never exercised the topology
// real users actually run: Supabase UP, history rows source:"db".
//
// The trick: this spec OPENS port 59999 with a ~20-line PostgREST stub,
// flipping the very same running backend into DB-online mode for the
// spec's lifetime. Seeding happens BEFORE the stub starts, so the full
// reports live in the relay; the stub then serves the LIST — which pins
// the merge exactly: db rows WIN the dedupe (source:"db", no session
// tag), while opening/comparing falls through get_job(miss) → relay.
//
// Pinned here, on db-sourced rows: no duplicates after the merge, no
// "this session" tag, multi-select of two rows, and the full comparison.

import { test, expect } from "@playwright/test";
import http from "http";

const BACKEND = "http://127.0.0.1:8000";
const CO_A = "Halcyon Grid";
const CO_B = "Terrafirm Logistics";

let stub;
const startStub = (rows) =>
  new Promise((resolve) => {
    stub = http.createServer((req, res) => {
      const u = new URL(req.url, "http://x");
      const isList =
        req.method === "GET" &&
        u.pathname === "/rest/v1/analysis_jobs" &&
        !u.search.includes("id=eq.");
      res.writeHead(isList ? 200 : req.method === "GET" ? 200 : 201, {
        "Content-Type": "application/json",
      });
      // Single-job lookups return [] → backend get_job misses → relay
      // fallback serves the full report, same ladder production uses.
      res.end(isList ? JSON.stringify(rows) : "[]");
    });
    stub.listen(59999, "127.0.0.1", resolve);
  });

test.afterAll(() => new Promise((r) => (stub ? stub.close(r) : r())));

async function seed(page, company) {
  const res = await page.request.post(`${BACKEND}/api/analyze`, {
    data: {
      company_name: company,
      manual_content:
        `${company} sustainability disclosure 2025: net-zero emissions ` +
        `target, verified carbon reduction data, renewable sourcing.`,
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
  return job_id;
}

test("with Supabase up, db-sourced rows dedupe, drop the session tag, and multi-select into a comparison", async ({ page }) => {
  // Seeds complete while 59999 is still closed → relay holds full reports.
  const idA = await seed(page, CO_A);
  const idB = await seed(page, CO_B);

  // Time-bomb lesson (found when the container clock crossed noon UTC):
  // hardcoded stub timestamps eventually sort BELOW the accumulating relay
  // rows' real timestamps, and the db-wins dedupe then stamps the seeds
  // with the stale time — pushing them off the capped list. Stub rows must
  // be relative to now: always the newest, deterministic forever.
  const ts = (secAgo) => new Date(Date.now() - secAgo * 1000).toISOString();
  await startStub([
    { id: idA, company_name: CO_A, score: 72, risk_level: "High Risk",
      completed_at: ts(0) },
    { id: idB, company_name: CO_B, score: 72, risk_level: "High Risk",
      completed_at: ts(30) },
  ]);

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Reports" }).click();

  const rowA = page.locator(".rpts-row", { hasText: CO_A });
  const rowB = page.locator(".rpts-row", { hasText: CO_B });
  await expect(rowA).toBeVisible();
  await expect(rowB).toBeVisible();

  // The same jobs exist in BOTH sources right now — the merge must emit
  // each exactly once, and the surviving row is the persisted one:
  await expect(rowA).toHaveCount(1);
  await expect(rowB).toHaveCount(1);
  await expect(rowA.getByText("this session")).toHaveCount(0);
  await expect(rowB.getByText("this session")).toHaveCount(0);

  // The user-reported gesture, verbatim, on db-sourced rows:
  await rowA.getByRole("button", { name: "Select" }).click();
  await expect(rowA.getByRole("button", { name: "Selected" })).toBeVisible();
  await rowB.getByRole("button", { name: "Select" }).click();
  await expect(rowA.getByRole("button", { name: "Selected" })).toBeVisible();
  await expect(rowB.getByRole("button", { name: "Selected" })).toBeVisible();

  const bar = page.locator(".rpts-compare-bar");
  await expect(bar).toContainText(CO_A);
  await expect(bar).toContainText(CO_B);
  await bar.getByRole("button", { name: "Compare →" }).click();

  // Full comparison, reports served through get_job(miss) → relay:
  await expect(page.getByRole("heading", { name: "Comparison" })).toBeVisible();
  const cols = page.locator(".cmp-col");
  await expect(cols).toHaveCount(2);
  await expect(cols.nth(0)).toContainText(CO_A);
  await expect(cols.nth(1)).toContainText(CO_B);
});
