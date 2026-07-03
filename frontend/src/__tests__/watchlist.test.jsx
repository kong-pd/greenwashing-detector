// PROD-1 L3 — the local-first watchlist's pure core.
//
// Identity is the COMPANY (trimmed, case-insensitive), not a job: watching
// "Shell" means caring about the next analysis of Shell, whichever job_id
// it gets. The stored snapshot is the baseline; watchDelta compares it to
// the newest history row for that company:
//   no_new  — no row, or the newest row IS the baseline job
//   same    — a new run landed on the same score
//   changed — delta = latest.score - baseline.score (▲ worse, ▼ better)
// Storage is localStorage behind try/catch: corrupt JSON loads as [],
// quota/privacy-mode failures never throw into the UI.
import { describe, it, expect } from "vitest";
import {
  loadWatchlist, saveWatchlist, toggleWatch, isWatched, watchDelta,
} from "../watchlist.js";

const snap = (company_name, score, job_id = "base-1") => ({
  company_name, score, job_id, completed_at: "2026-07-01T10:00:00+00:00",
});
const row = (company_name, score, job_id) => ({
  company_name, score, job_id, risk_level: "High Risk",
  completed_at: "2026-07-03T10:00:00+00:00",
});

describe("toggleWatch / isWatched", () => {
  it("adds a snapshot, then removes it on the second toggle", () => {
    let list = toggleWatch([], snap("Shell", 78));
    expect(list).toHaveLength(1);
    expect(isWatched(list, "Shell")).toBe(true);
    list = toggleWatch(list, snap("Shell", 78));
    expect(list).toEqual([]);
  });

  it("identity is company, trimmed and case-insensitive", () => {
    const list = toggleWatch([], snap("Shell", 78));
    expect(isWatched(list, "  shell ")).toBe(true);
    expect(toggleWatch(list, snap("SHELL", 80))).toEqual([]);
  });

  it("leaves other entries untouched and never mutates input", () => {
    const list = toggleWatch(toggleWatch([], snap("Shell", 78)), snap("Tesla", 44));
    const next = toggleWatch(list, snap("Shell", 78));
    expect(next.map(w => w.company_name)).toEqual(["Tesla"]);
    expect(list).toHaveLength(2);
  });
});

describe("watchDelta", () => {
  const base = snap("Shell", 78, "base-1");

  it("no history for the company → no_new", () => {
    expect(watchDelta(base, [row("Tesla", 44, "t-1")]).status).toBe("no_new");
  });

  it("newest row is the baseline job itself → no_new", () => {
    const d = watchDelta(base, [row("Shell", 78, "base-1")]);
    expect(d.status).toBe("no_new");
  });

  it("a different, newer run → changed, delta = latest − baseline", () => {
    const d = watchDelta(base, [row("Shell", 72, "new-1"), row("Shell", 78, "base-1")]);
    expect(d.status).toBe("changed");
    expect(d.delta).toBe(-6);
    expect(d.latest.job_id).toBe("new-1");
  });

  it("a new run on the same score → same", () => {
    const d = watchDelta(base, [row("Shell", 78, "new-2")]);
    expect(d.status).toBe("same");
    expect(d.delta).toBe(0);
  });

  it("company match is trimmed and case-insensitive", () => {
    const d = watchDelta(base, [row("  SHELL ", 70, "new-3")]);
    expect(d.status).toBe("changed");
    expect(d.delta).toBe(-8);
  });
});

describe("storage glue degrades, never throws", () => {
  const fake = (initial) => {
    const m = new Map(initial ? [["gwd.watchlist", initial]] : []);
    return {
      getItem: k => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, v),
      _map: m,
    };
  };

  it("roundtrips through save/load", () => {
    const s = fake();
    saveWatchlist([snap("Shell", 78)], s);
    expect(loadWatchlist(s).map(w => w.company_name)).toEqual(["Shell"]);
  });

  it("corrupt JSON loads as an empty list", () => {
    expect(loadWatchlist(fake("{nope"))).toEqual([]);
  });

  it("a non-array payload loads as an empty list", () => {
    expect(loadWatchlist(fake('{"a":1}'))).toEqual([]);
  });

  it("missing storage (SSR / privacy mode) → [] and silent save", () => {
    expect(loadWatchlist(null)).toEqual([]);
    expect(() => saveWatchlist([snap("Shell", 78)], null)).not.toThrow();
  });

  it("a throwing setItem (quota) is swallowed", () => {
    const s = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    expect(() => saveWatchlist([snap("Shell", 78)], s)).not.toThrow();
  });
});
