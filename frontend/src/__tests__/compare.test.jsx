// PROD-1 L2 — the two pure seams behind the comparison view.
//
// toggleSelection: the Reports-list pick queue. Cap 2; a third pick swaps
// out the OLDEST selection (no dead click, no scolding); re-picking a
// selected row deselects it.
//
// topFlags: severity-ranked top-N per side. Missing severity defaults to
// "medium" — the same convention the backend normaliser uses — so legacy
// flag payloads never sink below rated ones by accident.
import { describe, it, expect } from "vitest";
import { toggleSelection, topFlags } from "../screens/CompareScreen.jsx";

const row = (job_id) => ({ job_id, company_name: job_id.toUpperCase() });

describe("toggleSelection", () => {
  it("picks up to two, in pick order", () => {
    let sel = [];
    sel = toggleSelection(sel, row("a"));
    sel = toggleSelection(sel, row("b"));
    expect(sel.map(r => r.job_id)).toEqual(["a", "b"]);
  });

  it("a third pick swaps out the oldest selection", () => {
    let sel = [row("a"), row("b")];
    sel = toggleSelection(sel, row("c"));
    expect(sel.map(r => r.job_id)).toEqual(["b", "c"]);
  });

  it("re-picking a selected row deselects it (identity by job_id)", () => {
    let sel = [row("a"), row("b")];
    sel = toggleSelection(sel, { job_id: "a", company_name: "different copy" });
    expect(sel.map(r => r.job_id)).toEqual(["b"]);
  });

  it("never mutates its input", () => {
    const sel = [row("a")];
    toggleSelection(sel, row("b"));
    expect(sel.map(r => r.job_id)).toEqual(["a"]);
  });

  it("rows without a job_id are unselectable — and never poison the queue", () => {
    // undefined === undefined would otherwise make two DIFFERENT id-less
    // rows toggle each other off (reads as "single-select only" in the UI).
    const ghost1 = { company_name: "No Id A" };
    const ghost2 = { company_name: "No Id B" };
    let sel = toggleSelection([], ghost1);
    expect(sel).toEqual([]);
    sel = toggleSelection([row("a")], ghost2);
    expect(sel.map(r => r.job_id)).toEqual(["a"]);
  });
});

describe("topFlags", () => {
  const f = (type, severity) => ({ type, severity, description: type });

  it("ranks high > medium > low and caps at three by default", () => {
    const out = topFlags([
      f("L1", "low"), f("M1", "medium"), f("H1", "high"),
      f("H2", "high"), f("M2", "medium"),
    ]);
    expect(out.map(x => x.type)).toEqual(["H1", "H2", "M1"]);
  });

  it("keeps original order within a severity (stable)", () => {
    const out = topFlags([f("M1", "medium"), f("M2", "medium"), f("M3", "medium")]);
    expect(out.map(x => x.type)).toEqual(["M1", "M2", "M3"]);
  });

  it("defaults a missing severity to medium", () => {
    const out = topFlags([f("L1", "low"), { type: "X", description: "no severity" }], 2);
    expect(out.map(x => x.type)).toEqual(["X", "L1"]);
  });

  it("tolerates empty and non-array input", () => {
    expect(topFlags([])).toEqual([]);
    expect(topFlags(undefined)).toEqual([]);
  });
});
