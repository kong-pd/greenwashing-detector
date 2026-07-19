// Browser-owned report history.
//
// Backend history remains the source of truth when it is reachable. This
// bounded local snapshot covers reports the browser has actually completed.
// The five bundled portfolio reports never touch the backend, so without this
// layer they would disappear from Analysis History as soon as they rendered.

const KEY = "gwd.analysisHistory.v1";
export const LOCAL_HISTORY_LIMIT = 20;

const defaultStorage = () =>
  (typeof localStorage !== "undefined" ? localStorage : null);

const validRow = row => {
  const reportId = row?.report?.id || row?.report?.job_id;
  return Boolean(
    row?.job_id && row?.company_name && reportId &&
    String(reportId) === String(row.job_id)
  );
};

export function loadLocalHistory(storage = defaultStorage()) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(validRow).slice(0, LOCAL_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

/** Save a full, normalised report snapshot; stable job IDs prevent duplicates. */
export function saveLocalReport(report, storage = defaultStorage(), completedAt = new Date().toISOString()) {
  const jobId = report?.id || report?.job_id;
  const companyName = report?.company_name || report?.headline;
  if (!storage || !jobId || jobId === "LIVE" || !companyName) return loadLocalHistory(storage);

  const row = {
    job_id: String(jobId),
    company_name: String(companyName),
    score: report.score ?? null,
    risk_level: report.risk_level || report.riskLevel || "—",
    completed_at: completedAt,
    source: "local",
    report,
  };
  const next = [
    row,
    ...loadLocalHistory(storage).filter(existing => existing.job_id !== row.job_id),
  ].slice(0, LOCAL_HISTORY_LIMIT);

  try {
    storage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota/privacy mode: completing the report must still succeed.
  }
  return next;
}

const timeValue = value => {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Merge backend summaries with browser snapshots by job_id, newest first.
 * A backend row owns persisted metadata/source; a matching browser snapshot
 * stays attached as an offline fallback for opening and comparison.
 */
export function mergeHistoryRows(remoteRows, localRows) {
  const merged = new Map();
  const locals = Array.isArray(localRows) ? localRows.filter(validRow) : [];
  const remotes = Array.isArray(remoteRows) ? remoteRows : [];

  locals.forEach(row => merged.set(row.job_id, row));
  remotes
    .filter(row => row && row.job_id && row.company_name)
    .forEach(row => {
      const local = merged.get(row.job_id);
      merged.set(row.job_id, {
        ...local,
        ...row,
        source: row.source === "relay" ? "relay" : "db",
        ...(local?.report ? { report: local.report } : {}),
      });
    });

  return [...merged.values()].sort(
    (a, b) => timeValue(b.completed_at) - timeValue(a.completed_at),
  );
}
