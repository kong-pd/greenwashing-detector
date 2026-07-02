"""evals compare — offline regression diff between two runs (the honest
version of "A/B testing" until real users exist).

  python -m evals.compare --label v3.2            # snapshot current code
  python -m evals.compare --label v3.3 --against v3.2   # snapshot + diff
"""
import argparse
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from relevance import check_relevance  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))


def snapshot(label: str) -> dict:
    out = {}
    for p in sorted(glob.glob(os.path.join(HERE, "golden", "*.json"))):
        case = json.load(open(p))
        r = check_relevance(case["content"])
        out[case["id"]] = {"relevant": r["relevant"], "signals": r["signals"]}
    os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
    path = os.path.join(HERE, "results", f"{label}.json")
    json.dump(out, open(path, "w"), indent=2)
    print(f"snapshot '{label}' → {path} ({len(out)} cases)")
    return out


def diff(new: dict, old_label: str):
    old = json.load(open(os.path.join(HERE, "results", f"{old_label}.json")))
    flips = [(k, old[k], new[k]) for k in new
             if k in old and old[k]["relevant"] != new[k]["relevant"]]
    moved = [(k, old[k]["signals"], new[k]["signals"]) for k in new
             if k in old and old[k]["signals"] != new[k]["signals"]]
    print(f"\nvs '{old_label}': {len(flips)} relevance flips, {len(moved)} signal shifts")
    for k, o, n in flips:
        print(f"  FLIP  {k}: {o['relevant']} → {n['relevant']}")
    for k, o, n in moved:
        print(f"  shift {k}: {o} → {n} signals")
    if not flips and not moved:
        print("  no behavioural change on the golden set")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", required=True)
    ap.add_argument("--against")
    a = ap.parse_args()
    snap = snapshot(a.label)
    if a.against:
        diff(snap, a.against)
