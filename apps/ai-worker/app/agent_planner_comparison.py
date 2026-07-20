from __future__ import annotations

from collections.abc import Iterable

COMPARISON_FORMAT = "agent-llm-router-planner-comparison:v1"
_FUNNEL_STAGES = (
    "routerRouted",
    "domainExact",
    "toolExact",
    "requiredInputExact",
    "executionPolicyExact",
    "endToEndExact",
)
_PAIRED_METADATA_KEYS = (
    "meetingCatalogSha256",
    "model",
    "routerModel",
    "currentDate",
    "timezone",
    "repetitions",
    "retrievalTopK",
    "evaluationSeed",
)
_REVISION_BINDING_KEYS = (
    "sourceRevision",
    "suiteSha256",
    "toolCapabilityCatalogFileSha256",
    "registryInventorySha256",
    "registryCatalogSha256",
    "registryEligibleSnapshotSha256",
)


def build_two_stage_comparison(
    baseline_reports: Iterable[dict[str, object]],
    candidate_reports: Iterable[dict[str, object]],
) -> dict[str, object]:
    baseline = _reports_by_variant(baseline_reports)
    candidate = _reports_by_variant(candidate_reports)
    if not baseline or set(baseline) != set(candidate):
        raise ValueError("Baseline and candidate variants must match")

    variants: dict[str, object] = {}
    for variant in sorted(baseline):
        baseline_report = baseline[variant]
        candidate_report = candidate[variant]
        _validate_paired_inputs(baseline_report, candidate_report)
        baseline_summary = _report_summary(baseline_report)
        candidate_summary = _report_summary(candidate_report)
        variants[variant] = {
            "baseline": baseline_summary,
            "candidate": candidate_summary,
            "delta": _summary_delta(baseline_summary, candidate_summary),
        }

    baseline_aggregate = _aggregate(baseline.values())
    candidate_aggregate = _aggregate(candidate.values())
    return {
        "format": COMPARISON_FORMAT,
        "sameEvaluationInputs": True,
        "baselineRevision": _common_revision(baseline.values()),
        "candidateRevision": _common_revision(candidate.values()),
        "fixedInputs": _common_metadata(baseline.values(), _PAIRED_METADATA_KEYS),
        "baselineBinding": _common_metadata(baseline.values(), _REVISION_BINDING_KEYS),
        "candidateBinding": _common_metadata(candidate.values(), _REVISION_BINDING_KEYS),
        "variants": variants,
        "aggregate": {
            "baseline": baseline_aggregate,
            "candidate": candidate_aggregate,
            "delta": _summary_delta(baseline_aggregate, candidate_aggregate),
        },
    }


def _reports_by_variant(
    reports: Iterable[dict[str, object]],
) -> dict[str, dict[str, object]]:
    result: dict[str, dict[str, object]] = {}
    for report in reports:
        metadata = _object(report.get("metadata"), "Missing evaluation metadata")
        if metadata.get("llmRouting") is not True:
            raise ValueError("Evaluation report must use two-stage LLM routing")
        suite_version = metadata.get("suiteVersion")
        if not isinstance(suite_version, str) or ":" not in suite_version:
            raise ValueError("Invalid evaluation suite version")
        variant = suite_version.rsplit(":", 1)[-1]
        if variant in result:
            raise ValueError("Duplicate evaluation variant")
        result[variant] = report
    return result


def _validate_paired_inputs(baseline: dict[str, object], candidate: dict[str, object]) -> None:
    baseline_metadata = _object(baseline.get("metadata"), "Missing baseline metadata")
    candidate_metadata = _object(candidate.get("metadata"), "Missing candidate metadata")
    if any(
        baseline_metadata.get(key) is None
        or baseline_metadata.get(key) != candidate_metadata.get(key)
        for key in _PAIRED_METADATA_KEYS
    ):
        raise ValueError("Baseline and candidate must use the same fixed inputs")
    if baseline_metadata.get("suiteVersion") != candidate_metadata.get("suiteVersion"):
        raise ValueError("Baseline and candidate must use the same fixed inputs")
    if _attempt_signatures(baseline) != _attempt_signatures(candidate):
        raise ValueError("Baseline and candidate must use the same fixed inputs")


def _attempt_signatures(report: dict[str, object]) -> tuple[tuple[object, ...], ...]:
    results = report.get("results")
    if not isinstance(results, list):
        raise ValueError("Evaluation report is missing attempt results")
    signatures = []
    for result in results:
        item = _object(result, "Invalid evaluation attempt")
        signatures.append((item.get("id"), item.get("attempt"), item.get("kind")))
    return tuple(signatures)


def _report_summary(report: dict[str, object]) -> dict[str, float | int]:
    funnel = _object(report.get("routingFunnel"), "Missing routing funnel")
    stages = _object(funnel.get("stages"), "Missing routing funnel stages")
    summary: dict[str, float | int] = {
        "attempts": _nonnegative_int(report.get("totalAttempts"), "Invalid attempt count"),
        "toolSelectionAttempts": _nonnegative_int(
            funnel.get("toolSelectionAttempts"), "Invalid tool selection attempt count"
        ),
        "exactAttemptRate": _number(report.get("exactAttemptRate"), "Invalid exact rate"),
        "toolSelectionAccuracy": _number(
            report.get("toolSelectionAccuracy"), "Invalid tool selection accuracy"
        ),
        "requiredInputAccuracy": _number(
            report.get("requiredInputAccuracy"), "Invalid required input accuracy"
        ),
    }
    previous_count = int(summary["toolSelectionAttempts"])
    for stage_name in _FUNNEL_STAGES:
        stage = _object(stages.get(stage_name), f"Missing funnel stage: {stage_name}")
        count = _nonnegative_int(stage.get("count"), f"Invalid funnel count: {stage_name}")
        if count > previous_count:
            raise ValueError(f"Invalid non-cumulative funnel count: {stage_name}")
        overall_rate = _rate(stage.get("overallRate"), f"Invalid funnel rate: {stage_name}")
        conditional_rate = _rate(
            stage.get("conditionalRate"), f"Invalid conditional rate: {stage_name}"
        )
        expected_overall = _fraction(count, int(summary["toolSelectionAttempts"]))
        expected_conditional = _fraction(count, previous_count)
        if overall_rate != expected_overall or conditional_rate != expected_conditional:
            raise ValueError(f"Inconsistent funnel rate: {stage_name}")
        summary[f"{stage_name}Count"] = count
        summary[f"{stage_name}OverallRate"] = overall_rate
        summary[f"{stage_name}ConditionalRate"] = conditional_rate
        previous_count = count
    summary["conditionalToolAccuracy"] = summary["toolExactConditionalRate"]
    summary["endToEndExactRate"] = summary["endToEndExactOverallRate"]
    return summary


def _aggregate(reports: Iterable[dict[str, object]]) -> dict[str, float | int]:
    summaries = [_report_summary(report) for report in reports]
    attempts = sum(int(summary["attempts"]) for summary in summaries)
    tool_attempts = sum(int(summary["toolSelectionAttempts"]) for summary in summaries)
    result: dict[str, float | int] = {
        "attempts": attempts,
        "toolSelectionAttempts": tool_attempts,
    }
    previous_count = tool_attempts
    for stage_name in _FUNNEL_STAGES:
        count = sum(int(summary[f"{stage_name}Count"]) for summary in summaries)
        result[f"{stage_name}Count"] = count
        result[f"{stage_name}OverallRate"] = _fraction(count, tool_attempts)
        result[f"{stage_name}ConditionalRate"] = _fraction(count, previous_count)
        previous_count = count
    result["conditionalToolAccuracy"] = result["toolExactConditionalRate"]
    result["endToEndExactRate"] = result["endToEndExactOverallRate"]
    result["exactAttemptRate"] = result["endToEndExactOverallRate"]
    result["toolSelectionAccuracy"] = result["toolExactOverallRate"]
    result["requiredInputAccuracy"] = result["requiredInputExactOverallRate"]
    return result


def _summary_delta(
    baseline: dict[str, float | int], candidate: dict[str, float | int]
) -> dict[str, float]:
    metric_names = (
        "exactAttemptRate",
        "toolSelectionAccuracy",
        "requiredInputAccuracy",
        "domainExactOverallRate",
        "conditionalToolAccuracy",
        "endToEndExactRate",
    )
    return {
        name: round(float(candidate[name]) - float(baseline[name]), 4)
        for name in metric_names
        if name in baseline and name in candidate
    }


def _common_revision(reports: Iterable[dict[str, object]]) -> str:
    revisions = {
        _object(report.get("metadata"), "Missing evaluation metadata").get("sourceRevision")
        for report in reports
    }
    if len(revisions) != 1 or not isinstance(next(iter(revisions)), str):
        raise ValueError("Evaluation reports must share one source revision")
    return next(iter(revisions))


def _common_metadata(
    reports: Iterable[dict[str, object]], keys: tuple[str, ...]
) -> dict[str, object]:
    metadata_items = [
        _object(report.get("metadata"), "Missing evaluation metadata") for report in reports
    ]
    common: dict[str, object] = {}
    for key in keys:
        values = {metadata.get(key) for metadata in metadata_items}
        if len(values) != 1 or next(iter(values)) is None:
            raise ValueError(f"Evaluation reports must share metadata: {key}")
        common[key] = next(iter(values))
    return common


def _object(value: object, message: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ValueError(message)
    return value


def _number(value: object, message: str) -> float:
    if not isinstance(value, int | float) or isinstance(value, bool):
        raise ValueError(message)
    return float(value)


def _rate(value: object, message: str) -> float:
    number = _number(value, message)
    if not 0 <= number <= 1:
        raise ValueError(message)
    return number


def _nonnegative_int(value: object, message: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(message)
    return value


def _fraction(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 4) if denominator else 0.0
