// watchlist.js — the local-first watchlist (PROD-1 L3).
//
// Deliberately localStorage, deliberately honest about it: the list lives
// in THIS browser, the UI says so, and nothing here pretends to be synced.
// Identity is the company (trimmed, case-insensitive) — watching "Shell"
// means caring about the NEXT analysis of Shell, whichever job_id it gets.
// The stored snapshot is the baseline for "change since last analysis".

const KEY = "gwd.watchlist";

const defaultStorage = () =>
  (typeof localStorage !== "undefined" ? localStorage : null);

const norm = (name) => (name || "").trim().toLowerCase();
const sameCompany = (a, b) => norm(a) === norm(b) && norm(a) !== "";

export function loadWatchlist(storage = defaultStorage()) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWatchlist(list, storage = defaultStorage()) {
  if (!storage) return list;
  try {
    storage.setItem(KEY, JSON.stringify(list));
  } catch {
    // quota / privacy mode — the in-memory list still works this session
  }
  return list;
}

/** The baseline snapshot taken at star time, from a normalised report. */
export function watchSnapshot(claim) {
  return {
    company_name: claim.company_name || claim.headline || "Unknown",
    job_id:       claim.id ?? null,
    score:        claim.score ?? 0,
    completed_at: claim.analyzedAt || null,
    watched_at:   new Date().toISOString(),
  };
}

export function isWatched(list, name) {
  return (list || []).some(w => sameCompany(w.company_name, name));
}

export function toggleWatch(list, snap) {
  const current = Array.isArray(list) ? list : [];
  if (isWatched(current, snap.company_name)) {
    return current.filter(w => !sameCompany(w.company_name, snap.company_name));
  }
  return [...current, snap];
}

/**
 * Change since the baseline, against merged /api/history rows (newest
 * first, per the endpoint's contract).
 *   no_new  — no row for the company, or the newest row IS the baseline job
 *   same    — a new run landed on the same score (delta 0)
 *   changed — delta = latest.score − baseline.score (▲ worse, ▼ better)
 */
export function watchDelta(entry, rows) {
  const latest = (rows || []).find(r => sameCompany(r.company_name, entry.company_name)) || null;
  if (!latest || latest.job_id === entry.job_id) {
    return { status: "no_new", delta: 0, latest };
  }
  const delta = (latest.score ?? 0) - (entry.score ?? 0);
  return { status: delta === 0 ? "same" : "changed", delta, latest };
}
