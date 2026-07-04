"""ARCH-1 Phase B — the pluggability proof.

"A configurable scrape-and-score engine" stops being a README sentence
when a SECOND pack runs through the same machinery. The toy pack here is
`privacy` — privacy-policy risk screening — deliberately tiny (a real
prompt skeleton, a 4-case golden corpus, a mock fixture) and deliberately
NOT wired into the product UI: Phase B proves the ENGINE is pluggable
(loading, gating, mock scoring, rubric binding); making the frontend
pack-aware is a copy/branding project with its own trigger.

What is pinned here:
  * the toy pack exists and passes the SAME pack-agnostic contract net
    as greenwash (parametrized in test_pack.py — automatic);
  * the CROSS-REFUSAL MATRIX — the gate is the pack's, not the engine's:
    privacy lexicon accepts privacy text and refuses ESG text; the
    greenwash lexicon refuses privacy text. Fail-closed travels with
    whichever domain is loaded;
  * the toy golden corpus passes the gate expectations under its own
    lexicon (same runner semantics, injected config — no env games);
  * the whole import chain BOOTS on the toy pack: a subprocess with
    DOMAIN_PACK=privacy imports the analyzer and reports the toy rubric
    and toy dimensions. Fail-loud and rebinding, proven end to end.

Demo command (full toy eval run through the unmodified runner):
    DOMAIN_PACK=privacy USE_MOCK=true pytest analysis/evals/ -q
"""
import glob
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from pack import load_pack, pack_path
from relevance import check_relevance

ANALYSIS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

ESG_TEXT = (
    "We commit to net-zero emissions by 2040, publish verified carbon "
    "reduction data, and source renewable energy across our operations "
    "under our sustainability programme."
)
PRIVACY_TEXT = (
    "We collect personal data including cookies and device identifiers, "
    "share information with third-party advertising partners, retain data "
    "indefinitely, and you may contact our DPO to exercise GDPR rights "
    "including erasure."
)


def test_privacy_pack_exists_and_identifies_itself():
    p = load_pack("privacy")
    assert p["rubric_version"] == "0.1-toy"
    assert "third_party_sharing" in [d["key"] for d in p["dimensions"]]


def test_cross_refusal_matrix():
    priv = load_pack("privacy")["relevance"]
    # privacy pack: accepts its own domain, refuses the other one
    assert check_relevance(PRIVACY_TEXT, cfg=priv)["relevant"] is True
    assert check_relevance(ESG_TEXT, cfg=priv)["relevant"] is False
    # greenwash pack (module default): the mirror image
    assert check_relevance(ESG_TEXT)["relevant"] is True
    assert check_relevance(PRIVACY_TEXT)["relevant"] is False


def test_toy_goldens_pass_the_gate_under_their_own_lexicon():
    p = load_pack("privacy")
    files = sorted(glob.glob(os.path.join(pack_path(p["golden_dir"]), "*.json")))
    assert len(files) >= 4
    for f in files:
        case = json.load(open(f, encoding="utf-8"))
        got = check_relevance(case["content"], cfg=p["relevance"])["relevant"]
        assert got == case["expected"]["relevant"], case["id"]


def test_engine_boots_on_the_toy_pack():
    """The money shot: the SAME import chain, rebound by one env var."""
    out = subprocess.run(
        [sys.executable, "-c",
         "import analyzer, json; "
         "print(analyzer.RUBRIC_VERSION); "
         "print(json.dumps(sorted(analyzer.MOCK_RESULT['dimension_scores'])))"],
        capture_output=True, text=True, timeout=60,
        cwd=ANALYSIS_DIR,
        env={**os.environ, "DOMAIN_PACK": "privacy", "USE_MOCK": "true"},
    )
    assert out.returncode == 0, out.stderr[-500:]
    assert "0.1-toy" in out.stdout
    assert "third_party_sharing" in out.stdout
    assert "specificity" not in out.stdout, "greenwash dims must NOT leak in"
