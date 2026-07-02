"""Failure corpus intake: flag a bad run by trace_id.

  python -m evals.flag <trace_id> --reason "scored a homework PDF"

Copies traces/<id>.jsonl into evals/failures/ with a metadata sidecar.
House rule: every diagnosed failure becomes a golden-set case.
"""
import argparse
import json
import os
import shutil
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("trace_id")
    ap.add_argument("--reason", required=True)
    a = ap.parse_args()
    src = os.path.join(os.path.dirname(HERE), "traces", f"{a.trace_id}.jsonl")
    if not os.path.exists(src):
        raise SystemExit(f"no trace at {src}")
    dst_dir = os.path.join(HERE, "failures")
    os.makedirs(dst_dir, exist_ok=True)
    shutil.copy(src, os.path.join(dst_dir, f"{a.trace_id}.jsonl"))
    meta = {"trace_id": a.trace_id, "reason": a.reason,
            "flagged_at": datetime.now(timezone.utc).isoformat(),
            "promoted_to_golden": False}
    json.dump(meta, open(os.path.join(dst_dir, f"{a.trace_id}.meta.json"), "w"), indent=2)
    print(f"flagged {a.trace_id}: {a.reason}\nnext: diagnose, then add a golden case and set promoted_to_golden=true")
