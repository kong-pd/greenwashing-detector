import { describe, it, expect } from "vitest";
import {
  LOCAL_HISTORY_LIMIT, loadLocalHistory, saveLocalReport, mergeHistoryRows,
} from "../localHistory.js";

const fakeStorage = (initial) => {
  const map = new Map(initial ? [["gwd.analysisHistory.v1", initial]] : []);
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  };
};

const report = (id, company = "Shell", score = 78) => ({
  id, company_name: company, headline: company, score,
  riskLevel: "High Risk", risk_level: "High Risk", flags: [], evidence: [],
});

describe("browser report history", () => {
  it("roundtrips a full report snapshot", () => {
    const storage = fakeStorage();
    saveLocalReport(report("pre-cached:shell"), storage, "2026-07-19T10:00:00Z");
    const [row] = loadLocalHistory(storage);
    expect(row).toMatchObject({
      job_id: "pre-cached:shell", company_name: "Shell", score: 78,
      completed_at: "2026-07-19T10:00:00Z", source: "local",
    });
    expect(row.report.id).toBe("pre-cached:shell");
  });

  it("moves a repeated job to the front instead of duplicating it", () => {
    const storage = fakeStorage();
    saveLocalReport(report("a", "A"), storage, "2026-07-19T10:00:00Z");
    saveLocalReport(report("b", "B"), storage, "2026-07-19T10:01:00Z");
    saveLocalReport(report("a", "A", 80), storage, "2026-07-19T10:02:00Z");
    expect(loadLocalHistory(storage).map(row => row.job_id)).toEqual(["a", "b"]);
    expect(loadLocalHistory(storage)[0].score).toBe(80);
  });

  it("caps storage and safely ignores corrupt or malformed payloads", () => {
    const storage = fakeStorage();
    for (let i = 0; i < LOCAL_HISTORY_LIMIT + 3; i += 1) {
      saveLocalReport(report(`j-${i}`, `Company ${i}`), storage, `2026-07-19T10:${String(i).padStart(2, "0")}:00Z`);
    }
    expect(loadLocalHistory(storage)).toHaveLength(LOCAL_HISTORY_LIMIT);
    expect(loadLocalHistory(fakeStorage("{broken"))).toEqual([]);
    expect(loadLocalHistory(fakeStorage('[{"job_id":"thin-only"}]'))).toEqual([]);
    expect(loadLocalHistory(fakeStorage(JSON.stringify([{
      job_id: "a", company_name: "Shell", report: report("different"),
    }])))).toEqual([]);
  });

  it("never lets unavailable storage or quota errors break completion", () => {
    expect(saveLocalReport(report("a"), null)).toEqual([]);
    const throwing = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    expect(() => saveLocalReport(report("a"), throwing)).not.toThrow();
  });
});

describe("mergeHistoryRows", () => {
  it("combines local and backend history newest-first", () => {
    const local = [{
      job_id: "local-1", company_name: "Shell", score: 78,
      risk_level: "High Risk", completed_at: "2026-07-19T10:00:00Z",
      source: "local", report: report("local-1"),
    }];
    const remote = [{
      job_id: "remote-1", company_name: "Tesla", score: 44,
      risk_level: "Medium Risk", completed_at: "2026-07-19T11:00:00Z",
      source: "relay",
    }];
    expect(mergeHistoryRows(remote, local).map(row => row.job_id))
      .toEqual(["remote-1", "local-1"]);
  });

  it("deduplicates matching jobs while retaining the offline snapshot", () => {
    const snapshot = report("same", "Shell", 78);
    const local = [{
      job_id: "same", company_name: "Shell", score: 78,
      completed_at: "2026-07-19T11:00:00Z", source: "local", report: snapshot,
    }];
    const remote = [{
      job_id: "same", company_name: "Shell", score: 79,
      completed_at: "2026-07-19T10:00:00Z", source: "db",
    }];
    const [row] = mergeHistoryRows(remote, local);
    expect(row).toMatchObject({ job_id: "same", score: 79, source: "db" });
    expect(row.report).toBe(snapshot);
  });
});
