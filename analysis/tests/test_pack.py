"""ARCH-1 — domain pack contracts.

Two layers, deliberately separated:

  1. PACK-AGNOSTIC contracts, parametrized over every directory under
     packs/ — shape, referenced files, weight sanity, risk-band coverage,
     and the cross-material consistency that used to be hand-synchronised
     (mock fixture ↔ manifest dimensions, prompt ↔ dimensions & flag
     vocabulary). Adding a pack automatically puts it under this net.
  2. GREENWASH VALUE PINS — refactor-not-retune: the shipped calibration
     numbers, lexicon entries and rubric version for pack #1.

Phase B note: exactly-5 dimensions is the v1 ENGINE contract (the report
UI and the eval runner's shape properties both assume it), so it is
asserted here explicitly rather than hidden in a consumer.
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from pack import load_pack, pack_path, PackError, PACKS_DIR

ALL_PACK_IDS = sorted(
    d for d in os.listdir(PACKS_DIR)
    if os.path.isfile(os.path.join(PACKS_DIR, d, "pack.json"))
)


# ── layer 1 · pack-agnostic contracts (every pack, automatically) ────────────

def test_at_least_one_pack_is_discoverable():
    assert "greenwash" in ALL_PACK_IDS


def test_unknown_pack_raises():
    with pytest.raises(PackError):
        load_pack("no-such-domain")


@pytest.mark.parametrize("pack_id", ALL_PACK_IDS)
def test_pack_shape_and_files(pack_id):
    p = load_pack(pack_id)
    assert p["id"] == pack_id
    assert len(p["dimensions"]) == 5, "v1 engine contract: exactly 5 dimensions"
    for d in p["dimensions"]:
        assert d["key"] and d["label"]
    assert p["dimension_max"] == 20, "v1 engine contract: 0–20 scale"
    assert p["flag_types"]
    assert os.path.isfile(pack_path(p["prompt"]))
    assert os.path.isfile(pack_path(p["mock_result"]))
    assert os.path.isdir(pack_path(p["golden_dir"]))


@pytest.mark.parametrize("pack_id", ALL_PACK_IDS)
def test_pack_weights_are_sane(pack_id):
    w = load_pack(pack_id)["weights"]
    assert abs(sum(w["components"].values()) - 1.0) < 1e-9
    for lo, hi in w["bands"].values():
        assert 0.0 <= lo <= hi <= 1.0
    assert 0.0 <= w["tier1_floor"] <= 1.0


@pytest.mark.parametrize("pack_id", ALL_PACK_IDS)
def test_pack_risk_bands_cover_the_scale(pack_id):
    bands = load_pack(pack_id)["risk_bands"]
    maxes = [b["max"] for b in bands]
    assert maxes == sorted(maxes) and maxes[-1] >= 100
    assert all(b["label"] for b in bands)


@pytest.mark.parametrize("pack_id", ALL_PACK_IDS)
def test_mock_fixture_is_consistent_with_its_pack(pack_id):
    p = load_pack(pack_id)
    mock = json.load(open(pack_path(p["mock_result"]), encoding="utf-8"))
    dim_keys = {d["key"] for d in p["dimensions"]}
    assert set(mock["dimension_scores"]) == dim_keys
    assert all(0 <= v <= p["dimension_max"]
               for v in mock["dimension_scores"].values())
    assert {f["type"] for f in mock["flags"]} <= set(p["flag_types"])
    # the fixture's own risk label must match the pack's bands for its score
    expected = next(b["label"] for b in p["risk_bands"]
                    if mock["score"] <= b["max"])
    assert mock["risk_level"] == expected


@pytest.mark.parametrize("pack_id", ALL_PACK_IDS)
def test_prompt_mentions_every_dimension_and_flag_type(pack_id):
    p = load_pack(pack_id)
    prompt = open(pack_path(p["prompt"]), encoding="utf-8").read()
    for d in p["dimensions"]:
        assert d["key"] in prompt, f"[{pack_id}] rubric lost dimension '{d['key']}'"
    for t in p["flag_types"]:
        assert t in prompt, f"[{pack_id}] rubric lost flag type '{t}'"


@pytest.mark.parametrize("pack_id", ALL_PACK_IDS)
def test_golden_cases_parse_with_the_runner_schema(pack_id):
    p = load_pack(pack_id)
    import glob
    files = sorted(glob.glob(os.path.join(pack_path(p["golden_dir"]), "*.json")))
    assert files, f"[{pack_id}] golden corpus is empty"
    for f in files:
        case = json.load(open(f, encoding="utf-8"))
        assert case["id"] and case["company"] and case["content"]
        assert isinstance(case["expected"]["relevant"], bool)


# ── layer 2 · greenwash value pins (refactor-not-retune) ─────────────────────

GW = load_pack("greenwash")


def test_greenwash_identity():
    assert GW["rubric_version"] == "3.3"
    assert [d["key"] for d in GW["dimensions"]] == [
        "specificity", "data_consistency", "third_party_certification",
        "negative_news", "greenwashing_language",
    ]
    assert len(GW["flag_types"]) == 5


def test_greenwash_weight_calibration_matches_shipped_values():
    w = GW["weights"]
    assert w["components"] == {"reliability": 0.45, "recency": 0.20,
                               "relevance": 0.35}
    assert w["bands"]["News"] == [0.40, 0.80]
    assert w["kind_reliability"]["Filing"] == 0.90
    assert w["tier1_floor"] == 0.85


def test_greenwash_risk_band_labels():
    assert [b["label"] for b in GW["risk_bands"]] == \
        ["Low Risk", "Medium Risk", "High Risk"]
    assert [b["max"] for b in GW["risk_bands"]] == [30, 60, 100]


def test_greenwash_lexicon_travels_with_the_pack():
    rel = GW["relevance"]
    assert rel["min_signals"] == 3 and rel["min_chars"] == 40
    assert "sustainab" in rel["stems"] and "nachhaltig" in rel["stems"]


def test_analyzer_binds_to_the_active_pack():
    import analyzer
    assert analyzer.RUBRIC_VERSION == GW["rubric_version"]
    assert analyzer.COMPONENT_WEIGHTS == GW["weights"]["components"]
    assert analyzer._derive_risk_level(0) == "Low Risk"
    assert analyzer._derive_risk_level(45) == "Medium Risk"
    assert analyzer._derive_risk_level(72) == "High Risk"


def test_relevance_binds_to_the_active_pack():
    import relevance
    assert set(relevance.STEMS) == set(GW["relevance"]["stems"])
    assert relevance.MIN_SIGNALS == GW["relevance"]["min_signals"]
