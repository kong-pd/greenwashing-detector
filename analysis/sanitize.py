"""SEC-3 — the ingestion sanitiser.

One pure seam through which ALL analyzer-bound text passes: the scraped
page, a pasted claim, PDF-extracted text, and every evidence field.

What it does — and deliberately nothing more:
  * strips control characters (keeping \\n and \\t) and zero-width
    characters (U+200B–200D, U+2060, U+FEFF) used to smuggle payloads
    past naive filters;
  * neutralises the prompt-boundary sentinels ('<<<' → '⟨⟨⟨',
    '>>>' → '⟩⟩⟩') at ingestion — defence in depth with the same
    neutralisation `analyzer.build_user_prompt` applies at assembly;
  * caps per-source length with an honest truncation marker;
  * returns accounting ({removed, truncated}) so the pipeline can leave
    a `content_sanitised` trace event (debug level — machinery, not
    Live-view news).

Ordinary multilingual text (CJK, umlauts, emoji, punctuation) passes
through byte-identical: this is a neutraliser, not a normaliser.
"""
import re

MAX_CONTENT_CHARS = 20_000
TRUNCATION_MARK = "\n[... truncated by sanitiser ...]"

# C0 controls except \t (09) and \n (0A); \r dropped deliberately — the
# prompt builder works in \n and stray \r only aids filter-evasion tricks.
_CONTROL_RE    = re.compile(r"[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f\r]")
_ZERO_WIDTH_RE = re.compile("[\u200b\u200c\u200d\u2060\ufeff]")


def neutralise_sentinels(text: str) -> str:
    """Make it impossible for data to forge the prompt-boundary markers.
    Length-preserving (1 char → 1 char), so weight/length accounting holds."""
    return text.replace("<<<", "⟨⟨⟨").replace(">>>", "⟩⟩⟩")


def sanitize_text(text, max_len: int = MAX_CONTENT_CHARS):
    """→ (clean_text, {removed, truncated})"""
    if not isinstance(text, str):
        return "", {"removed": 0, "truncated": False}
    before = len(text)
    clean = _CONTROL_RE.sub("", text)
    clean = _ZERO_WIDTH_RE.sub("", clean)
    clean = neutralise_sentinels(clean)  # length-preserving
    removed = before - len(clean)
    truncated = False
    if len(clean) > max_len:
        clean = clean[:max_len] + TRUNCATION_MARK
        truncated = True
    return clean, {"removed": removed, "truncated": truncated}


def sanitize_evidence(items):
    """Clean the text fields of every evidence item (quote/title/org/url),
    leaving numeric/structured fields untouched. → (new_items, removed)"""
    out, removed = [], 0
    for ev in items or []:
        ev = dict(ev)
        for key in ("quote", "title", "org", "url"):
            if isinstance(ev.get(key), str):
                clean, stats = sanitize_text(ev[key], max_len=1_000)
                removed += stats["removed"]
                ev[key] = clean
        out.append(ev)
    return out, removed
