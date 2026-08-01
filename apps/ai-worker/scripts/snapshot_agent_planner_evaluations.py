from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.agent_planner_comparison import (
    MULTITURN_SNAPSHOT_FORMAT,
    SNAPSHOT_FORMAT,
    build_agent_performance_snapshot,
    build_multiturn_context_snapshot,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build an absolute multi-turn Agent context performance snapshot."
    )
    parser.add_argument("--report", action="append", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--summary-output", type=Path)
    args = parser.parse_args()

    reports = [_load(path) for path in args.report]
    snapshot = (
        build_multiturn_context_snapshot(reports[0])
        if len(reports) == 1 and isinstance(reports[0].get("multiTurnContextEvaluation"), dict)
        else build_agent_performance_snapshot(reports)
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    if args.summary_output is not None:
        args.summary_output.parent.mkdir(parents=True, exist_ok=True)
        args.summary_output.write_text(
            render_snapshot_summary(snapshot) + "\n",
            encoding="utf-8",
        )
    return 0


def render_snapshot_summary(snapshot: dict[str, object]) -> str:
    snapshot_format = snapshot.get("format")
    if snapshot_format == SNAPSHOT_FORMAT:
        return _render_agent_workflow_summary(snapshot)
    if snapshot_format == MULTITURN_SNAPSHOT_FORMAT:
        return _render_multiturn_summary(snapshot)
    raise ValueError(f"Unsupported evaluation snapshot format: {snapshot_format}")


def _render_agent_workflow_summary(snapshot: dict[str, object]) -> str:
    aggregate = _object(snapshot.get("aggregate"), "Missing aggregate metrics")
    safety = _object(snapshot.get("safetyViolations"), "Missing safety metrics")
    attempts = _integer(aggregate.get("attempts"), "Invalid attempt count")
    passed_attempts = _integer(
        aggregate.get("passedAttempts"), "Invalid passed attempt count"
    )
    contract_passes = _integer(
        aggregate.get("executionContractPassAttempts"),
        "Invalid execution contract pass count",
    )
    return "\n".join(
        (
            "## Agent Workflow Evaluation",
            "",
            "| Metric | Result |",
            "| --- | ---: |",
            f"| Revision | `{_string(snapshot.get('sourceRevision'), 'Missing source revision')}` |",
            f"| Scenarios | {_integer(snapshot.get('uniqueScenarioCount'), 'Invalid scenario count')} |",
            f"| Attempts | {attempts} |",
            f"| Task success | {passed_attempts} / {attempts} ({_percent(snapshot.get('taskSuccessRate'))}) |",
            f"| Execution contract | {contract_passes} / {attempts} ({_percent(snapshot.get('executionContractPassRate'))}) |",
            f"| Tool selection accuracy | {_percent(aggregate.get('toolSelectionAccuracy'))} |",
            f"| Required-input accuracy | {_percent(aggregate.get('requiredInputAccuracy'))} |",
            f"| Safety violations | {_integer(safety.get('count'), 'Invalid safety violation count')} |",
            f"| Mean latency | {_number(snapshot.get('meanLatencyMs'), 'Invalid mean latency'):,.2f} ms |",
        )
    )


def _render_multiturn_summary(snapshot: dict[str, object]) -> str:
    metadata = _object(snapshot.get("metadata"), "Missing snapshot metadata")
    metrics = _object(snapshot.get("metrics"), "Missing multi-turn metrics")
    return "\n".join(
        (
            "## Korean Multi-turn Evaluation",
            "",
            "| Metric | Result |",
            "| --- | ---: |",
            f"| Revision | `{_string(metadata.get('sourceRevision'), 'Missing source revision')}` |",
            f"| Conversations | {_integer(snapshot.get('conversationCount'), 'Invalid conversation count')} |",
            f"| Task success | {_percent(metrics.get('koreanMultiTurnContextTaskSuccessRate'))} |",
            f"| Follow-up Tool selection | {_percent(metrics.get('followUpToolSelectionAccuracy'))} |",
            f"| Prior-context argument accuracy | {_percent(metrics.get('priorContextArgumentAccuracy'))} |",
            f"| Context resolution | {_percent(metrics.get('multiTurnContextResolutionRate'))} |",
            f"| Multi-turn Tool selection | {_percent(metrics.get('multiTurnToolSelectionAccuracy'))} |",
            f"| Partial | {_percent(metrics.get('partialRate'))} |",
            f"| Inconclusive | {_percent(metrics.get('inconclusiveRate'))} |",
        )
    )


def _object(value: object, message: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ValueError(message)
    return value


def _string(value: object, message: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(message)
    return value


def _integer(value: object, message: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(message)
    return value


def _number(value: object, message: str) -> float:
    if not isinstance(value, int | float) or isinstance(value, bool) or value < 0:
        raise ValueError(message)
    return float(value)


def _percent(value: object) -> str:
    rate = _number(value, "Invalid evaluation rate")
    if rate > 1:
        raise ValueError("Invalid evaluation rate")
    return f"{rate * 100:.2f}%"


def _load(path: Path) -> dict[str, object]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"Invalid evaluation report: {path}") from error
    if not isinstance(value, dict):
        raise SystemExit(f"Invalid evaluation report: {path}")
    return value


if __name__ == "__main__":
    raise SystemExit(main())
