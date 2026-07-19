import html as _html
import tempfile
from datetime import datetime


def _esc(value) -> str:
    """Escape user/AI-originated text before HTML interpolation (PDF safety)."""
    return _html.escape(str(value if value is not None else ""), quote=True)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _risk_color(score: int) -> str:
    if score > 60: return "#A64236"
    if score > 30: return "#B0741A"
    return "#4F7A4D"

def _severity_color(severity: str) -> str:
    return {"high": "#A64236", "medium": "#B0741A", "low": "#4F7A4D"}.get(severity, "#6B7280")

def _bar_color(score: int, max_score: int = 20) -> str:
    pct = score / max_score
    if pct >= 0.7: return "#A64236"
    if pct >= 0.4: return "#B0741A"
    return "#4F7A4D"

DIMENSION_META = [
    ("specificity",               "Claim Specificity",        "TCFD"),
    ("data_consistency",          "Data Consistency",          "GRI 305"),
    ("third_party_certification", "Third-Party Verification",  "EU Taxonomy"),
    ("negative_news",             "Negative News",             "GRI 2-27"),
    ("greenwashing_language",     "Greenwashing Language",     "EU GCD 2024"),
]

STANDARD_COLORS = {
    "TCFD":        ("#1A56C4", "#E8F0FB"),
    "GRI 305":     ("#1A7A4A", "#E6F4EC"),
    "EU Taxonomy": ("#003399", "#EAF0FB"),
    "GRI 2-27":    ("#1A7A4A", "#E6F4EC"),
    "EU GCD 2024": ("#B45309", "#FFF3E0"),
}

def _std_badge(standard: str) -> str:
    color, bg = STANDARD_COLORS.get(standard, ("#6B7280", "#F4F4EF"))
    return (
        f'<span style="display:inline-block;padding:2px 7px;border-radius:4px;'
        f'background:{bg};color:{color};border:1px solid {color}40;'
        f'font-family:monospace;font-size:10px;font-weight:600;'
        f'letter-spacing:.05em;margin-right:4px;">{standard}</span>'
    )


# ─── Main generator ───────────────────────────────────────────────────────────

def generate_pdf(job: dict) -> str:
    """Generate a full credibility report PDF and return the temp file path."""
    from weasyprint import HTML

    company     = _esc(job.get("company_name", "Unknown Company"))
    score       = job.get("score", 0) or 0
    risk_level  = _esc(job.get("risk_level", "—"))
    summary     = _esc(job.get("summary", "—"))
    completed   = (job.get("completed_at") or "")[:10] or datetime.now().strftime("%Y-%m-%d")
    job_id      = _esc(job.get("id", "—"))
    model_used  = _esc(job.get("model_used") or "configured model chain")
    rubric_ver  = _esc(job.get("rubric_version") or "3.3")
    dim         = job.get("dimension_scores") or {}
    flags       = job.get("analysis_flags") or job.get("flags") or []
    evidence    = job.get("sources") or []
    risk_color  = _risk_color(score)

    # ── §1 Score arc (SVG) ────────────────────────────────────────────────────
    pct     = min(100, max(0, score))
    r       = 54
    cx, cy  = 70, 70
    import math
    angle   = math.pi - (pct / 100) * math.pi
    nx      = cx + r * math.cos(angle)
    ny      = cy - r * math.sin(angle)
    arc_svg = f"""
    <svg viewBox="0 0 140 90" width="160" height="104" style="display:block;margin:0 auto 8px;">
      <path d="M {cx-r} {cy} A {r} {r} 0 0 1 {cx+r} {cy}"
            stroke="#E6E5DD" stroke-width="10" fill="none"/>
      <path d="M {cx-r} {cy} A {r} {r} 0 0 1 {nx:.1f} {ny:.1f}"
            stroke="{risk_color}" stroke-width="10" fill="none"/>
      <line x1="{cx}" y1="{cy}" x2="{nx:.1f}" y2="{ny:.1f}"
            stroke="#0F1A14" stroke-width="2.5"/>
      <circle cx="{cx}" cy="{cy}" r="4" fill="#0F1A14"/>
      <text x="{cx}" y="{cy-8}" text-anchor="middle"
            font-size="28" font-weight="600" fill="{risk_color}"
            font-family="Georgia,serif">{score}</text>
      <text x="{cx}" y="{cy+14}" text-anchor="middle"
            font-size="9" fill="#6B7280" font-family="monospace"
            letter-spacing="1">/ 100</text>
    </svg>"""

    # ── §2 Dimension bars ─────────────────────────────────────────────────────
    dim_rows = ""
    for key, label, standard in DIMENSION_META:
        val     = dim.get(key, 0) or 0
        pct_bar = (val / 20) * 100
        color   = _bar_color(val)
        dim_rows += f"""
        <tr>
          <td style="padding:8px 10px;font-size:12px;width:180px;">
            <strong>{label}</strong><br>
            {_std_badge(standard)}
          </td>
          <td style="padding:8px 10px;">
            <div style="background:#F4F4EF;border-radius:4px;height:10px;overflow:hidden;">
              <div style="background:{color};height:100%;width:{pct_bar:.0f}%;border-radius:4px;"></div>
            </div>
          </td>
          <td style="padding:8px 10px;text-align:right;font-family:monospace;
                     font-size:13px;font-weight:600;color:{color};width:60px;">
            {val}/20
          </td>
        </tr>"""

    # ── §3 Flag cards ─────────────────────────────────────────────────────────
    flags_html = ""
    for i, f in enumerate(flags[:3]):
        sev   = f.get("severity", "medium")
        color = _severity_color(sev)
        flags_html += f"""
        <div style="border-left:4px solid {color};padding:12px 16px;
                    margin-bottom:10px;background:#FAFAF8;border-radius:0 6px 6px 0;">
          <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px;">
            <span style="font-family:monospace;font-size:10px;color:#9AA0A1;">
              F-{str(i+1).zfill(2)}
            </span>
            <strong style="font-size:14px;">{_esc(f.get('type',''))}</strong>
            <span style="margin-left:auto;font-family:monospace;font-size:10px;
                         font-weight:600;color:{color};text-transform:uppercase;">
              {sev}
            </span>
          </div>
          <p style="margin:0 0 6px;font-size:12.5px;color:#3A3F37;line-height:1.5;">
            {_esc(f.get('description',''))}
          </p>
          <div style="font-family:monospace;font-size:10px;color:#9AA0A1;
                      border-top:1px dashed #E6E5DD;padding-top:6px;margin-top:6px;">
            SOURCE: {_esc(f.get('source',''))}
          </div>
        </div>"""

    # ── §4 Evidence rows ──────────────────────────────────────────────────────
    ev_rows = ""
    evidence_items = evidence if isinstance(evidence, list) else []
    # Handle both evidence objects and plain URL strings
    for i, ev in enumerate(evidence_items[:5]):
        if isinstance(ev, dict):
            weight  = ev.get("weight", 0) or 0
            w_pct   = int(weight * 100)
            ev_rows += f"""
            <tr style="border-bottom:.5px solid #E6E5DD;">
              <td style="padding:8px 10px;font-family:monospace;font-size:10px;
                         color:#9AA0A1;width:32px;">{str(i+1).zfill(2)}</td>
              <td style="padding:8px 10px;">
                <div style="font-size:11px;font-weight:500;margin-bottom:3px;">
                  {_esc(ev.get('title',''))}
                </div>
                <div style="font-size:10px;color:#9AA0A1;font-family:monospace;">
                  {_esc(ev.get('org',''))} · {_esc(ev.get('date',''))}
                </div>
                <div style="font-size:11px;color:#3A3F37;font-style:italic;
                            margin-top:4px;">"{_esc(ev.get('quote',''))}"</div>
              </td>
              <td style="padding:8px 10px;text-align:right;width:80px;">
                <div style="background:#F4F4EF;border-radius:3px;height:4px;
                            overflow:hidden;margin-bottom:3px;">
                  <div style="background:#3F5E48;height:100%;width:{w_pct}%;"></div>
                </div>
                <div style="font-family:monospace;font-size:11px;font-weight:600;">
                  {w_pct}
                </div>
              </td>
            </tr>"""
        else:
            ev_rows += f"""
            <tr style="border-bottom:.5px solid #E6E5DD;">
              <td style="padding:8px 10px;font-family:monospace;font-size:10px;
                         color:#9AA0A1;">{str(i+1).zfill(2)}</td>
              <td style="padding:8px 10px;font-size:11px;color:#3A3F37;"
                  colspan="2">{_esc(ev)}</td>
            </tr>"""

    # ── Standards row ─────────────────────────────────────────────────────────
    standards_html = "".join([_std_badge(s) for _, _, s in DIMENSION_META])

    # ── Full HTML ─────────────────────────────────────────────────────────────
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @page {{ margin: 20mm 18mm; }}
  body {{
    font-family: Georgia, "Times New Roman", serif;
    font-size: 13px;
    color: #0F1A14;
    line-height: 1.5;
    margin: 0;
  }}
  h1, h2, h3 {{ font-weight: 500; margin: 0; }}
  table {{ border-collapse: collapse; width: 100%; }}
  .mono {{ font-family: "Courier New", monospace; }}
  .section {{ margin-bottom: 28px; }}
  .section-head {{
    border-bottom: 1.5px solid #0F1A14;
    padding-bottom: 6px;
    margin-bottom: 14px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }}
  .kicker {{
    font-family: monospace;
    font-size: 10px;
    letter-spacing: .08em;
    color: #6B7280;
    margin-bottom: 4px;
  }}
</style>
</head>
<body>

<!-- Masthead -->
<div style="border-bottom:2px solid #0F1A14;padding-bottom:16px;margin-bottom:24px;">
  <div class="kicker">GREENCHECK ESG FACT-CHECKING ENGINE · CREDIBILITY REPORT</div>
  <h1 style="font-size:32px;letter-spacing:-.02em;margin:8px 0 12px;">
    {company}
  </h1>
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
    {standards_html}
  </div>
  <div class="mono" style="font-size:10px;color:#9AA0A1;margin-top:8px;">
    Report ID: {job_id} · Analysed: {completed} ·
    AI engine: {model_used} · Rubric v{rubric_ver} · 5 dimensions
  </div>
</div>

<!-- Verdict band -->
<div style="display:flex;gap:32px;margin-bottom:28px;
            border-bottom:.5px solid #E6E5DD;padding-bottom:24px;">
  <!-- Score -->
  <div style="text-align:center;min-width:160px;">
    <div class="kicker" style="text-align:center;">VERDICT</div>
    {arc_svg}
    <div style="font-family:monospace;font-size:13px;font-weight:700;
                color:{risk_color};letter-spacing:.05em;">
      {risk_level.upper()}
    </div>
  </div>
  <!-- Meta -->
  <div style="flex:1;">
    <table style="font-size:12px;">
      <tr style="border-bottom:.5px solid #E6E5DD;">
        <td style="padding:7px 0;color:#6B7280;font-family:monospace;
                   font-size:10px;width:160px;letter-spacing:.04em;">RISK LEVEL</td>
        <td style="padding:7px 0;font-weight:600;color:{risk_color};">
          ● {risk_level}
        </td>
      </tr>
      <tr style="border-bottom:.5px solid #E6E5DD;">
        <td style="padding:7px 0;color:#6B7280;font-family:monospace;font-size:10px;">
          FLAGS RAISED</td>
        <td style="padding:7px 0;">{len(flags)}</td>
      </tr>
      <tr style="border-bottom:.5px solid #E6E5DD;">
        <td style="padding:7px 0;color:#6B7280;font-family:monospace;font-size:10px;">
          EVIDENCE SOURCES</td>
        <td style="padding:7px 0;">{len(evidence_items)} cited</td>
      </tr>
      <tr>
        <td style="padding:7px 0;color:#6B7280;font-family:monospace;font-size:10px;">
          STANDARDS APPLIED</td>
        <td style="padding:7px 0;">{standards_html}</td>
      </tr>
    </table>
  </div>
</div>

<!-- §1 Executive Summary -->
<div class="section">
  <div class="section-head">
    <div>
      <div class="kicker">§ 1 · EXECUTIVE SUMMARY</div>
      <h2 style="font-size:20px;">Analyst summary</h2>
    </div>
  </div>
  <p style="font-size:14px;line-height:1.65;margin:0;text-align:justify;">
    {summary}
  </p>
</div>

<!-- §2 Dimensional Scoring -->
<div class="section">
  <div class="section-head">
    <div>
      <div class="kicker">§ 2 · DIMENSIONAL SCORING</div>
      <h2 style="font-size:20px;">Five-dimension rubric</h2>
    </div>
    <span class="mono" style="font-size:10px;color:#6B7280;">
      higher = greater risk · max 20 each
    </span>
  </div>
  <table>
    <tbody>{dim_rows}</tbody>
  </table>
</div>

<!-- §3 Flagged Findings -->
<div class="section">
  <div class="section-head">
    <div>
      <div class="kicker">§ 3 · FLAGGED FINDINGS</div>
      <h2 style="font-size:20px;">Three highest-risk findings</h2>
    </div>
  </div>
  {flags_html if flags_html else '<p style="color:#9AA0A1;font-size:12px;">No flags raised.</p>'}
</div>

<!-- §4 Evidence Trail -->
<div class="section">
  <div class="section-head">
    <div>
      <div class="kicker">§ 4 · EVIDENCE TRAIL</div>
      <h2 style="font-size:20px;">Sources ranked by weight</h2>
    </div>
  </div>
  {'<table><tbody>' + ev_rows + '</tbody></table>'
   if ev_rows else
   '<p style="color:#9AA0A1;font-size:12px;">No external sources found for this analysis.</p>'}
</div>

<!-- §5 Methodology -->
<div class="section">
  <div class="section-head">
    <div>
      <div class="kicker">§ 5 · METHODOLOGY</div>
      <h2 style="font-size:20px;">Scoring rubric &amp; regulatory alignment</h2>
    </div>
  </div>
  <p style="font-size:12px;color:#3A3F37;line-height:1.6;margin:0 0 10px;">
    GreenCheck scores each claim across five dimensions (0–20 per dimension,
    0–100 total), each aligned to an international regulatory standard.
    Evidence weights are clamped to source-kind-specific bands.
    Risk thresholds: 0–30 Low Risk · 31–60 Medium Risk · 61–100 High Risk.
  </p>
  <table style="font-size:11px;">
    <thead>
      <tr style="border-bottom:1px solid #0F1A14;">
        <th style="text-align:left;padding:6px 10px;font-family:monospace;
                   font-size:10px;font-weight:500;color:#6B7280;">DIMENSION</th>
        <th style="text-align:left;padding:6px 10px;font-family:monospace;
                   font-size:10px;font-weight:500;color:#6B7280;">STANDARD</th>
        <th style="text-align:left;padding:6px 10px;font-family:monospace;
                   font-size:10px;font-weight:500;color:#6B7280;">0 — LOW RISK</th>
        <th style="text-align:left;padding:6px 10px;font-family:monospace;
                   font-size:10px;font-weight:500;color:#6B7280;">20 — HIGH RISK</th>
      </tr>
    </thead>
    <tbody>
      <tr style="border-bottom:.5px solid #E6E5DD;">
        <td style="padding:8px 10px;font-weight:500;">Claim Specificity</td>
        <td style="padding:8px 10px;">{_std_badge("TCFD")}</td>
        <td style="padding:8px 10px;color:#4F7A4D;">Time-bound quantifiable targets</td>
        <td style="padding:8px 10px;color:#A64236;">Slogans only, no commitments</td>
      </tr>
      <tr style="border-bottom:.5px solid #E6E5DD;">
        <td style="padding:8px 10px;font-weight:500;">Data Consistency</td>
        <td style="padding:8px 10px;">{_std_badge("GRI 305")}</td>
        <td style="padding:8px 10px;color:#4F7A4D;">Claims align with databases</td>
        <td style="padding:8px 10px;color:#A64236;">Contradicts verified data</td>
      </tr>
      <tr style="border-bottom:.5px solid #E6E5DD;">
        <td style="padding:8px 10px;font-weight:500;">Third-Party Verification</td>
        <td style="padding:8px 10px;">{_std_badge("EU Taxonomy")}</td>
        <td style="padding:8px 10px;color:#4F7A4D;">Multiple credible certifications</td>
        <td style="padding:8px 10px;color:#A64236;">No independent verification</td>
      </tr>
      <tr style="border-bottom:.5px solid #E6E5DD;">
        <td style="padding:8px 10px;font-weight:500;">Negative News</td>
        <td style="padding:8px 10px;">{_std_badge("GRI 2-27")}</td>
        <td style="padding:8px 10px;color:#4F7A4D;">No negative coverage</td>
        <td style="padding:8px 10px;color:#A64236;">Active regulatory investigation</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;font-weight:500;">Greenwashing Language</td>
        <td style="padding:8px 10px;">{_std_badge("EU GCD 2024")}</td>
        <td style="padding:8px 10px;color:#4F7A4D;">Precise data-backed language</td>
        <td style="padding:8px 10px;color:#A64236;">Heavy buzzword use, no data</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- Footer -->
<div style="margin-top:40px;padding-top:12px;border-top:.5px solid #E6E5DD;
            display:flex;justify-content:space-between;
            font-family:monospace;font-size:10px;color:#9AA0A1;">
  <div>
    GreenCheck · Greenwashing Detection Engine<br>
    AI engine: {model_used} · Rubric v{rubric_ver} · Standards: TCFD · GRI 305 · GRI 2-27 · EU Taxonomy · EU GCD 2024<br>
    This report is generated by an AI fact-checking system.
    Findings are analytical opinions, not legal determinations.
  </div>
  <div style="text-align:right;">
    Report ID<br>
    <strong style="color:#0F1A14;">{job_id}</strong>
  </div>
</div>

</body>
</html>"""

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    # WeasyPrint opens the target path itself. Keeping NamedTemporaryFile's
    # handle open works on Unix but can lock the file on Windows.
    tmp.close()
    HTML(string=html).write_pdf(tmp.name)
    return tmp.name
