// useOpenReport — the C-2-hardened "open a history row" path, extracted so
// the Reports list and the landing Recent-analyses strip (PROD-1 L1) share
// ONE implementation: a row is a thin 5-field summary, never a report;
// opening it fetches the full record through GET /api/report/{job_id}
// (DB first, NFR-09 relay fallback) and only navigates on success.
import { useState } from "react";
import { gwdToast } from "../toast.js";
import { normalise } from "../screens/AnalysisScreen.jsx";
import { getReport } from "../api/client.js";

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
      const raw  = await getReport(row.job_id);
      const full = normalise(raw, makeClaim(row.company_name || "Unknown"));
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
 *   * default `source` to "db" for pre-L1 payloads — only an explicit
 *     "relay" earns the session-scoped honesty tag.
 */
export function recentCards(rows, cap = 5) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(r => r && r.job_id && r.company_name)
    .slice(0, cap)
    .map(r => ({ ...r, source: r.source === "relay" ? "relay" : "db" }));
}
