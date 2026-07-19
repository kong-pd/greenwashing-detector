// useOpenReport — the C-2-hardened "open a history row" path, extracted so
// the Reports list and the landing Recent-analyses strip (PROD-1 L1) share
// ONE implementation. Backend rows fetch their full record through
// GET /api/report/{job_id}; browser rows carry a bounded full snapshot so a
// pre-cached report remains openable while the backend is unavailable.
import { useState } from "react";
import { gwdToast } from "../toast.js";
import { normalise } from "../screens/AnalysisScreen.jsx";
import { getReport } from "../api/client.js";

export async function loadHistoryReport(row, makeClaim, fetchFull = getReport) {
  const claim = makeClaim(row?.company_name || "Unknown");
  const snapshot = () => normalise(row?.report, claim);

  if (row?.source === "local") return snapshot();

  try {
    const full = normalise(await fetchFull(row.job_id), claim);
    return full || snapshot();
  } catch (error) {
    const fallback = snapshot();
    if (fallback) return fallback;
    throw error;
  }
}

/**
 * @param onOpen    (fullReport, companyName) => void — navigate on success
 * @param makeClaim (companyName) => claim template for `normalise`
 */
export function useOpenReport(onOpen, makeClaim) {
  const [openingId, setOpeningId] = useState(null);

  async function openReport(row) {
    if (openingId) return;
    setOpeningId(row.job_id);
    try {
      const full = await loadHistoryReport(row, makeClaim);
      if (!full) {
        gwdToast("Report no longer available — it may have expired", { kind: "warn" });
        return;
      }
      onOpen(full, row.company_name);
    } catch {
      gwdToast("Couldn't load the report — backend unreachable", { kind: "warn" });
    } finally {
      setOpeningId(null);
    }
  }

  return { openingId, openReport };
}

/**
 * recentCards — pure prep between /api/history rows and the landing strip.
 * C-2 was exactly this kind of seam (endpoint/UI field mismatch), so the
 * boundary logic is a tested function, not JSX:
 *   * drop rows that couldn't open a report (no job_id) or render a name;
 *   * cap the strip (default 5), preserving the backend's newest-first order;
 *   * default `source` to "db" for legacy payloads while preserving explicit
 *     relay and browser-local scope labels.
 */
export function recentCards(rows, cap = 5) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(r => r && r.job_id && r.company_name)
    .slice(0, cap)
    .map(r => ({
      ...r,
      source: r.source === "relay" || r.source === "local" ? r.source : "db",
    }));
}
