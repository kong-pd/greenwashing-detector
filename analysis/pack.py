"""pack.py — the domain pack loader (ARCH-1 Phase A).

A "pack" is the unit of domain configuration: one versioned manifest
(packs/<id>/pack.json) carrying the scoring semantics — dimensions, flag
vocabulary, risk bands, weight calibration, relevance lexicon, search
phrasing — plus paths to the rubric prompt, the mock fixture, and the
golden corpus. The engine (analyzer / relevance / scraper / enricher)
consumes the pack instead of hardcoded constants.

Design rules:
  * FAIL LOUD at first load — a scoring engine with a half-loaded domain
    is worse than one that refuses to boot. Unknown pack ids and missing
    manifest keys raise PackError immediately.
  * MODULE-ANCHORED paths — pack resolution never depends on the launch
    CWD (the tracing-dump lesson, applied at design time here).
  * Phase A extracts scoring semantics only. UI copy and branding stay
    frontend-side; frontend parity with the pack is pinned by a vitest
    contract, not runtime coupling (a /pack/meta endpoint is Phase B).
"""
import json
import os
from functools import lru_cache

_ANALYSIS_ROOT = os.path.dirname(os.path.abspath(__file__))
PACKS_DIR = os.path.join(_ANALYSIS_ROOT, "packs")

_REQUIRED_KEYS = (
    "id", "rubric_version", "prompt", "mock_result", "golden_dir",
    "dimensions", "dimension_max", "flag_types", "risk_bands",
    "weights", "relevance", "search", "evidence_stub_note",
)


class PackError(RuntimeError):
    """Raised when a pack is missing, malformed, or inconsistent."""


def pack_path(rel: str) -> str:
    """Resolve a manifest-declared path against the analysis root."""
    return os.path.join(_ANALYSIS_ROOT, rel)


def _validate(pack: dict, pack_id: str) -> None:
    missing = [k for k in _REQUIRED_KEYS if k not in pack]
    if missing:
        raise PackError(f"pack '{pack_id}' missing keys: {missing}")
    if pack["id"] != pack_id:
        raise PackError(f"pack id mismatch: dir '{pack_id}' vs manifest '{pack['id']}'")
    dims = pack["dimensions"]
    if not (isinstance(dims, list) and dims
            and all(d.get("key") and d.get("label") for d in dims)):
        raise PackError(f"pack '{pack_id}': dimensions must be a non-empty "
                        "list of {key, label}")
    bands = pack["risk_bands"]
    maxes = [b["max"] for b in bands]
    if maxes != sorted(maxes) or maxes[-1] < 100:
        raise PackError(f"pack '{pack_id}': risk_bands must ascend and cover 100")
    comp = pack["weights"]["components"]
    if abs(sum(comp.values()) - 1.0) > 1e-9:
        raise PackError(f"pack '{pack_id}': weight components must sum to 1.0")
    for name in ("prompt", "mock_result"):
        if not os.path.isfile(pack_path(pack[name])):
            raise PackError(f"pack '{pack_id}': {name} file not found: {pack[name]}")
    if not os.path.isdir(pack_path(pack["golden_dir"])):
        raise PackError(f"pack '{pack_id}': golden_dir not found: {pack['golden_dir']}")


@lru_cache(maxsize=None)
def load_pack(pack_id: str | None = None) -> dict:
    pack_id = pack_id or os.environ.get("DOMAIN_PACK", "greenwash")
    manifest = os.path.join(PACKS_DIR, pack_id, "pack.json")
    if not os.path.isfile(manifest):
        raise PackError(f"unknown domain pack '{pack_id}' "
                        f"(no manifest at {manifest})")
    try:
        with open(manifest, encoding="utf-8") as f:
            pack = json.load(f)
    except json.JSONDecodeError as e:
        raise PackError(f"pack '{pack_id}' manifest is not valid JSON: {e}") from e
    _validate(pack, pack_id)
    return pack


def load_mock_result(pack: dict) -> dict:
    with open(pack_path(pack["mock_result"]), encoding="utf-8") as f:
        return json.load(f)


def fill(template: str, company: str) -> str:
    """Brace-proof template fill: user-typed company names may contain
    '{' or '}', which would blow up str.format — plain replace instead."""
    return template.replace("{company}", company)
