"""
Weight component & result-hardening tests (M5 + Phase-6 contract).

The component formula is a three-party contract (wiki 10 · Weight Component
Schema). These tests pin it:
    weight = clamp_band(0.45*reliability + 0.20*recency + 0.35*relevance)
    reliability — kind base + Tier-1 outlet floor 0.85
    recency     — ≤90d 0.95 · ≤365d 0.80 · ≤730d 0.65 · else/unknown 0.50
    relevance   — the AI-assigned weight (band midpoint when missing)
"""

import sys, os
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from analyzer import (
    WEIGHT_BANDS, _reliability, _recency, _compose_weight, _band_midpoint,
    _clamp_weight, _normalise_evidence, _process_result, _derive_risk_level,
    _parse_json,
)
from enricher import _normalise_serper_date, _extract_quote


# ── reliability ────────────────────────────────────────────────────────────────

def test_reliability_kind_bases():
    assert _reliability("Filing", "")     == 0.90
    assert _reliability("Database", "")   == 0.86
    assert _reliability("News", "Some Local Gazette") == 0.60
    assert _reliability("Document", "")   == 0.55
    assert _reliability("Linguistic", "") == 0.45

def test_reliability_tier1_floor_applies_to_news():
    for outlet in ("Reuters", "reuters", "The Guardian", "BBC", "Bloomberg",
                   "Financial Times", "FT"):
        assert _reliability("News", outlet) == 0.85, outlet

def test_reliability_tier1_floor_does_not_leak_to_other_kinds():
    # The floor is an outlet-tier concept; a Filing org named "Reuters"
    # keeps its kind base (already higher anyway).
    assert _reliability("Filing", "Reuters") == 0.90

def test_reliability_unknown_kind_default():
    assert _reliability("Mystery", "") == 0.60


# ── recency ────────────────────────────────────────────────────────────────────

def _days_ago(n):
    return (date.today() - timedelta(days=n)).isoformat()

def test_recency_tiers():
    assert _recency(_days_ago(10))   == 0.95
    assert _recency(_days_ago(90))   == 0.95
    assert _recency(_days_ago(91))   == 0.80
    assert _recency(_days_ago(365))  == 0.80
    assert _recency(_days_ago(366))  == 0.65
    assert _recency(_days_ago(730))  == 0.65
    assert _recency(_days_ago(731))  == 0.50

def test_recency_unknown_dates_score_half():
    assert _recency("")        == 0.50
    assert _recency(None)      == 0.50
    assert _recency("Unknown") == 0.50
    assert _recency("2 days ago") == 0.50   # non-ISO never sneaks through


# ── composition & clamping ─────────────────────────────────────────────────────

def test_compose_stays_inside_band_every_kind():
    # Extreme inputs both directions: result must always land inside the band.
    for kind, (lo, hi) in WEIGHT_BANDS.items():
        low  = _compose_weight(kind, 0.0, 0.0, 0.0)
        high = _compose_weight(kind, 1.0, 1.0, 1.0)
        assert lo <= low  <= hi, (kind, low)
        assert lo <= high <= hi, (kind, high)

def test_compose_known_value():
    # News, Tier-1, fresh, relevance .90:
    # 0.45*0.85 + 0.20*0.95 + 0.35*0.90 = 0.8875 → clamp News hi 0.80
    assert _compose_weight("News", 0.85, 0.95, 0.90) == 0.80

def test_clamp_weight_midpoint_when_none():
    assert _clamp_weight("Filing", None) == 0.90
    assert _band_midpoint("News") == 0.60

def test_clamp_weight_out_of_band():
    assert _clamp_weight("News", 0.99) == 0.80
    assert _clamp_weight("News", 0.10) == 0.40
    assert _clamp_weight("Document", 0.99) == 0.65


# ── _normalise_evidence: components land on every item ─────────────────────────

def test_normalise_evidence_attaches_components_and_sorts():
    items = [
        {"id": "E-01", "kind": "News", "title": "t", "org": "Reuters",
         "date": _days_ago(5), "url": "https://x", "quote": "q" * 30,
         "weight": 0.78},
        {"id": "E-02", "kind": "Document", "title": "t2", "org": "Acme",
         "date": _days_ago(900), "url": "https://y", "quote": "q" * 30,
         "weight": 0.60},
    ]
    out = _normalise_evidence(items)
    for ev in out:
        for f in ("reliability", "recency", "relevance", "weight"):
            assert f in ev, f
        lo, hi = WEIGHT_BANDS[ev["kind"]]
        assert lo <= ev["weight"] <= hi
    assert out[0]["weight"] >= out[1]["weight"]          # sorted desc
    news = next(e for e in out if e["kind"] == "News")
    assert news["reliability"] == 0.85                    # Tier-1 floor
    assert news["relevance"]   == 0.78                    # AI weight preserved as relevance

def test_normalise_evidence_relevance_defaults_to_midpoint():
    out = _normalise_evidence([{"id": "E-01", "kind": "Linguistic",
                                "title": "", "org": "", "date": "",
                                "url": "", "quote": "", "weight": None}])
    assert out[0]["relevance"] == _band_midpoint("Linguistic")


# ── _process_result hardening ──────────────────────────────────────────────────

def test_derive_risk_level_thresholds():
    assert _derive_risk_level(0)   == "Low Risk"
    assert _derive_risk_level(30)  == "Low Risk"
    assert _derive_risk_level(31)  == "Medium Risk"
    assert _derive_risk_level(60)  == "Medium Risk"
    assert _derive_risk_level(61)  == "High Risk"
    assert _derive_risk_level(100) == "High Risk"

def test_process_result_clamps_score_and_fixes_risk_label():
    raw = {"score": 142, "risk_level": "Low Risk",
           "dimension_scores": {}, "flags": [], "evidence": [], "summary": ""}
    out = _process_result(raw, [])
    assert out["score"] == 100
    assert out["risk_level"] == "High Risk"      # derived, not the AI's wrong label

def test_process_result_score_missing_falls_back_to_dimension_sum():
    raw = {"risk_level": None, "summary": "",
           "dimension_scores": {"specificity": 5, "data_consistency": 5,
                                "third_party_certification": 5,
                                "negative_news": 5, "greenwashing_language": 5},
           "flags": [], "evidence": []}
    out = _process_result(raw, [])
    assert out["score"] == 25
    assert out["risk_level"] == "Low Risk"

def test_process_result_severity_inferred_when_missing():
    raw = {"score": 50, "risk_level": "Medium Risk", "summary": "",
           "dimension_scores": {},
           "flags": [{"type": "Data Contradiction", "description": "", "source": ""},
                     {"type": "Vague Claims", "description": "", "source": ""},
                     {"type": "Greenwashing Language", "description": "", "source": ""}],
           "evidence": []}
    sev = {f["type"]: f["severity"] for f in _process_result(raw, [])["flags"]}
    assert sev == {"Data Contradiction": "high",
                   "Vague Claims": "medium",
                   "Greenwashing Language": "low"}

def test_process_result_uses_input_evidence_when_ai_omits_it():
    inp = [{"id": "E-01", "kind": "News", "title": "t", "org": "BBC",
            "date": "", "url": "https://x", "quote": "q" * 25, "weight": 0.7}]
    raw = {"score": 40, "risk_level": "Medium Risk", "summary": "",
           "dimension_scores": {}, "flags": [], "evidence": []}
    out = _process_result(raw, inp)
    assert len(out["evidence"]) == 1
    assert out["evidence"][0]["reliability"] == 0.85   # BBC Tier-1 floor


# ── parsing & date utilities ───────────────────────────────────────────────────

def test_parse_json_strips_markdown_fences():
    assert _parse_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert _parse_json('```\n{"a": 1}\n```')     == {"a": 1}
    assert _parse_json('{"a": 1}')               == {"a": 1}

def test_serper_relative_dates_normalise_to_iso():
    out = _normalise_serper_date("2 days ago")
    assert out == _days_ago(2)
    assert _normalise_serper_date("Mar 12, 2024") == "2024-03-12"
    assert _normalise_serper_date("") == ""        # unknown stays empty, never "Unknown"

def test_extract_quote_bounds():
    assert _extract_quote("short") is None                       # < 20 chars
    assert len(_extract_quote("x" * 500)) == 300                 # truncated
    assert _extract_quote("y" * 25 + "[+1234 chars]") == "y" * 25  # tail marker stripped
