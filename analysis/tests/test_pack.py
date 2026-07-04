"""ARCH-1 Phase A — the domain pack loader and its consistency contracts.

The engine's domain knowledge (rubric prompt, dimensions, flag vocabulary,
relevance lexicon, search phrasing, weight calibration, mock fixture,
golden corpus) becomes ONE versioned manifest: packs/<id>/pack.json.
Phase A extracts the scoring semantics only — UI copy and branding stay
frontend-side by design (extracting copy is i18n, a different project).

What these tests actually buy (beyond "the loader works"):
  * fail-loud boot — a scoring engine with a half-loaded domain is worse
    than one that refuses to start (unknown pack / missing keys raise);
  * CROSS-MATERIAL CONSISTENCY becomes machine-checked — dimensions used
    to live in four places (prompt JSON schema, frontend META, mock
    fixture, weight code) synchronised by hand. Drift between any two is
    now a red test, not a production surprise;
  * refactor-not-retune: every value the pack carries must equal what the
    code shipped yesterday — pinned here where cheap (weights sum, bands,
    risk labels), and by the untouched 247-test suite everywhere else.
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from pack import load_pack, pack_path, PackError

PACK = load_pack("greenwash")


# ── manifest shape: fail loud, not half-loaded ────────────────────────────────

def test_unknown_pack_raises():
    with pytest.raises(PackError):
        load_pack("no-such-domain")


def test_greenwash_pack_has_the_required_shape():
    assert PACK["id"] == "greenwash"
    assert PACK["rubric_version"] == "3.3"
    dims = PACK["dimensions"]
    assert len(dims) == 5
    for d in dims:
        assert d["key"] and d["label"]
    assert PACK["dimension_max"] == 20
    assert len(PACK["flag_types"]) == 5


def test_referenced_files_exist():
    assert os.path.isfile(pack_path(PACK["prompt"]))
    assert os.path.isfile(pack_path(PACK["mock_result"]))
    assert os.path.isdir(pack_path(PACK["golden_dir"]))


# ── refactor-not-retune: the numbers are yesterday's numbers ─────────────────

def test_weight_calibration_matches_shipped_values():
    w = PACK["weights"]
    assert w["components"] == {"reliability": 0.45, "recency": 0.20,
                               "relevance": 0.35}
    assert abs(sum(w["components"].values()) - 1.0) < 1e-9
    assert w["bands"]["News"] == [0.40, 0.80]
    assert w["kind_reliability"]["Filing"] == 0.90
    assert w["tier1_floor"] == 0.85
    for lo, hi in w["bands"].values():
        assert 0.0 <= lo <= hi <= 1.0


def test_risk_bands_cover_the_scale_in_order():
    bands = PACK["risk_bands"]
    assert [b["label"] for b in bands] == ["Low Risk", "Medium Risk", "High Risk"]
    assert [b["max"] for b in bands] == [30, 60, 100]


def test_relevance_lexicon_travels_with_the_pack():
    rel = PACK["relevance"]
    assert rel["min_signals"] == 3 and rel["min_chars"] == 40
    assert "sustainab" in rel["stems"] and "nachhaltig" in rel["stems"]


# ── cross-material consistency: the drift detectors ──────────────────────────

def test_mock_fixture_dimensions_match_the_pack():
    mock = json.load(open(pack_path(PACK["mock_result"]), encoding="utf-8"))
    dim_keys = {d["key"] for d in PACK["dimensions"]}
    assert set(mock["dimension_scores"]) == dim_keys
    assert {f["type"] for f in mock["flags"]} <= set(PACK["flag_types"])


def test_prompt_mentions_every_dimension_and_flag_type():
    prompt = open(pack_path(PACK["prompt"]), encoding="utf-8").read()
    for d in PACK["dimensions"]:
        assert d["key"] in prompt, f"rubric prompt lost dimension '{d['key']}'"
    for t in PACK["flag_types"]:
        assert t in prompt, f"rubric prompt lost flag type '{t}'"


# ── the engine actually consumes the pack ─────────────────────────────────────

def test_analyzer_binds_to_the_pack():
    import analyzer
    assert analyzer.RUBRIC_VERSION == PACK["rubric_version"]
    assert analyzer.COMPONENT_WEIGHTS == PACK["weights"]["components"]
    assert analyzer._derive_risk_level(0) == "Low Risk"
    assert analyzer._derive_risk_level(45) == "Medium Risk"
    assert analyzer._derive_risk_level(72) == "High Risk"


def test_relevance_binds_to_the_pack():
    import relevance
    assert set(relevance.STEMS) == set(PACK["relevance"]["stems"])
    assert relevance.MIN_SIGNALS == PACK["relevance"]["min_signals"]
