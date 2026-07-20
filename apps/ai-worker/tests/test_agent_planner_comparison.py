import pytest

from app.agent_planner_comparison import build_two_stage_comparison


def report(
    variant: str, *, domain_count: int, tool_count: int, exact_count: int
) -> dict[str, object]:
    exact = exact_count / 10
    tool = tool_count / 10
    return {
        "totalAttempts": 10,
        "passedAttempts": round(exact * 10),
        "exactAttemptRate": exact,
        "toolSelectionAccuracy": tool,
        "requiredInputAccuracy": 1.0,
        "routingFunnel": {
            "toolSelectionAttempts": 10,
            "stages": {
                "routerRouted": {"count": 10, "conditionalRate": 1.0, "overallRate": 1.0},
                "domainExact": {
                    "count": domain_count,
                    "conditionalRate": domain_count / 10,
                    "overallRate": domain_count / 10,
                },
                "toolExact": {
                    "count": tool_count,
                    "conditionalRate": round(tool_count / domain_count, 4),
                    "overallRate": tool,
                },
                "requiredInputExact": {
                    "count": exact_count,
                    "conditionalRate": round(exact_count / tool_count, 4),
                    "overallRate": exact,
                },
                "executionPolicyExact": {
                    "count": exact_count,
                    "conditionalRate": 1.0,
                    "overallRate": exact,
                },
                "endToEndExact": {
                    "count": exact_count,
                    "conditionalRate": 1.0,
                    "overallRate": exact,
                },
            },
        },
        "results": [
            {"id": f"{variant}:{index}", "attempt": 1, "kind": variant} for index in range(10)
        ],
        "metadata": {
            "suiteVersion": f"meeting-agent-regression:v1:{variant}",
            "meetingCatalogSha256": "a" * 64,
            "model": "planner-model",
            "routerModel": "router-model",
            "currentDate": "2026-07-20",
            "timezone": "Asia/Seoul",
            "repetitions": 1,
            "retrievalTopK": 8,
            "evaluationSeed": 17,
            "suiteSha256": "b" * 64,
            "toolCapabilityCatalogFileSha256": "c" * 64,
            "registryInventorySha256": "d" * 64,
            "registryCatalogSha256": "e" * 64,
            "registryEligibleSnapshotSha256": "f" * 64,
            "llmRouting": True,
            "compareShadowRetrieval": False,
            "sourceRevision": "baseline-revision",
        },
    }


def test_two_stage_comparison_pairs_inputs_and_reports_funnel_delta() -> None:
    baseline = [report("canonical", domain_count=9, tool_count=8, exact_count=8)]
    candidate = [report("canonical", domain_count=10, tool_count=9, exact_count=9)]
    candidate[0]["metadata"]["sourceRevision"] = "candidate-revision"

    result = build_two_stage_comparison(baseline, candidate)

    assert result["format"] == "agent-llm-router-planner-comparison:v1"
    assert result["sameEvaluationInputs"] is True
    assert result["fixedInputs"]["evaluationSeed"] == 17
    assert result["baselineBinding"]["registryInventorySha256"] == "d" * 64
    assert result["candidateBinding"]["sourceRevision"] == "candidate-revision"
    assert result["variants"]["canonical"]["delta"]["exactAttemptRate"] == 0.1
    assert result["variants"]["canonical"]["delta"]["domainExactOverallRate"] == 0.1
    assert result["variants"]["canonical"]["delta"]["conditionalToolAccuracy"] == 0.0111
    assert result["aggregate"]["baseline"]["endToEndExactRate"] == 0.8
    assert result["aggregate"]["candidate"]["endToEndExactRate"] == 0.9


def test_two_stage_comparison_rejects_different_fixture_inputs() -> None:
    baseline = report("canonical", domain_count=10, tool_count=10, exact_count=10)
    candidate = report("canonical", domain_count=10, tool_count=10, exact_count=10)
    candidate["metadata"]["meetingCatalogSha256"] = "b" * 64

    with pytest.raises(ValueError, match="same fixed inputs"):
        build_two_stage_comparison([baseline], [candidate])


def test_two_stage_comparison_rejects_non_llm_routing_report() -> None:
    baseline = report("canonical", domain_count=10, tool_count=10, exact_count=10)
    candidate = report("canonical", domain_count=10, tool_count=10, exact_count=10)
    baseline["metadata"]["llmRouting"] = False

    with pytest.raises(ValueError, match="two-stage LLM routing"):
        build_two_stage_comparison([baseline], [candidate])
