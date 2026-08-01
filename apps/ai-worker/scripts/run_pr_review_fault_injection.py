from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

AI_WORKER_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = AI_WORKER_ROOT.parents[1]
sys.path.insert(0, str(AI_WORKER_ROOT))

from fault_injection.pr_review_recovery import (  # noqa: E402
    build_fault_injection_report,
    run_fault_injection_matrix,
)

DEFAULT_OUTPUT = REPO_ROOT / "docs" / "infra" / "evidence" / "pr-review-fault-injection.json"


def main() -> int:
    logging.basicConfig(level=logging.ERROR)
    parser = argparse.ArgumentParser(
        description="Run controlled PR Review worker interruption scenarios."
    )
    parser.add_argument("--repetitions", type=int, default=10)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    results = run_fault_injection_matrix(args.repetitions)
    report = build_fault_injection_report(
        results,
        generated_at=_generated_at(),
        git_commit=_git_commit(),
    )

    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report["summary"], ensure_ascii=False, sort_keys=True))
    print(f"evidence={output}")
    return 0


def _generated_at() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _git_commit() -> str:
    return subprocess.check_output(
        ["git", "rev-parse", "HEAD"],
        cwd=REPO_ROOT,
        text=True,
    ).strip()


if __name__ == "__main__":
    raise SystemExit(main())
