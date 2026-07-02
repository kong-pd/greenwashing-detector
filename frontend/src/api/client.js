const BASE = "/api";

export async function startAnalysis(companyName, manualContent = null) {
  const res = await fetch(`${BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company_name: companyName, manual_content: manualContent }),
  });
  return res.json();
}

export async function pollReport(jobId, onStep, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${BASE}/report/${jobId}`);
    const data = await res.json();
    if (data.status === "completed") return { success: true, data };
    if (data.status === "failed") return { success: false, reason: data.fail_reason };
    if (onStep) onStep(data.step || "Analysing...");
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { success: false, reason: "timeout" };
}

export async function fetchHistory() {
  const res = await fetch(`${BASE}/history`);
  return res.json();
}

// C-2: single-shot report fetch for already-completed jobs (history rows).
// pollReport is for in-flight jobs — its loop would spin for 60 s on an
// error envelope, which is exactly wrong for "open this old report".
export async function getReport(jobId) {
  const res = await fetch(`${BASE}/report/${jobId}`);
  return res.json();
}
