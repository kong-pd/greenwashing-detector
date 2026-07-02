"""The eval runner — golden set, executed as pytest (W2).

Layered by what the environment can honestly verify:
  · Relevance-gate expectations run ALWAYS (deterministic, zero-network).
  · Result-shape properties run whenever the pipeline yields a result
    (mock or real) — structured output is checked with assertions, not
    with a judge model.
  · Score bands / must-flag types run only with real keys
    (RUN_MODEL_EVALS=1 and USE_MOCK unset) — skipped, never faked.
"""
import glob
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from relevance import check_relevance          # noqa: E402
from analyzer import analyze, RUBRIC_VERSION   # noqa: E402

GOLDEN = sorted(glob.glob(os.path.join(os.path.dirname(__file__), "golden", "*.json")))
CASES = [json.load(open(p)) for p in GOLDEN]
REAL = os.environ.get("RUN_MODEL_EVALS") == "1" and \
       os.environ.get("USE_MOCK", "").lower() != "true"


def _props(result, company):
    assert isinstance(result.get("score"), int) and 0 <= result["score"] <= 100
    assert result.get("risk_level") or result.get("riskLevel")
    dims = result.get("dimension_scores") or result.get("dimensionScores") or {}
    assert len(dims) == 5 and all(0 <= v <= 20 for v in dims.values())
    assert result["rubric_version"] == RUBRIC_VERSION and result["model_used"]
    for f in result.get("flags") or []:
        assert f.get("type") and f.get("description")


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_relevance_gate(case):
    r = check_relevance(case["content"])
    assert r["relevant"] == case["expected"]["relevant"], (
        f"{case['id']}: gate said {r['relevant']} "
        f"({r['signals']} signals: {r['matched']}) — {case.get('note','')}")


@pytest.mark.parametrize("case", [c for c in CASES if c["expected"]["relevant"]],
                         ids=[c["id"] for c in CASES if c["expected"]["relevant"]])
def test_result_properties(case, monkeypatch):
    if not REAL:
        monkeypatch.setenv("USE_MOCK", "true")
    result = analyze(case["company"], case["content"], [])
    assert result, f"{case['id']}: pipeline returned nothing"
    _props(result, case["company"])
    if REAL:
        band = case["expected"].get("score_band")
        if band:
            assert band[0] <= result["score"] <= band[1], (
                f"{case['id']}: score {result['score']} outside {band}")
        for ft in case["expected"].get("must_flag_types") or []:
            assert any(f["type"] == ft for f in result.get("flags") or []), (
                f"{case['id']}: missing expected flag type {ft}")
        assert case["company"].split()[0].lower() in (result.get("summary") or "").lower()
