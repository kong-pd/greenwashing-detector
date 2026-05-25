import tempfile

def generate_pdf(job: dict) -> str:
    """Generate a PDF report and return the temp file path."""
    from weasyprint import HTML

    flags_html = "".join([
        f"<li><strong>{f['type']}</strong>: {f['description']} <em>({f['source']})</em></li>"
        for f in (job.get("analysis_flags") or [])
    ])

    html = f"""
    <html><body style="font-family: sans-serif; padding: 2rem;">
      <h1>{job['company_name']} — Greenwashing Risk Report</h1>
      <p>Analyzed at: {job.get('completed_at', '—')}</p>
      <h2>Risk Score: {job.get('score', '—')} / 100 ({job.get('risk_level', '—')})</h2>
      <h2>Risk Flags</h2>
      <ul>{flags_html}</ul>
      <h2>Summary</h2>
      <p>{job.get('summary', '—')}</p>
    </body></html>
    """

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    HTML(string=html).write_pdf(tmp.name)
    return tmp.name
