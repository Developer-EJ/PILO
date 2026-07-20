from pathlib import Path

WORKFLOW_PATH = Path(__file__).parents[3] / ".github" / "workflows" / "evaluate-agent-planner.yml"
EVALUATOR_SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "evaluate_agent_planner.py"
COMPARISON_SCRIPT_PATH = (
    Path(__file__).parents[1] / "scripts" / "compare_agent_planner_evaluations.py"
)


def test_evaluation_workflow_accepts_unmerged_candidate_descending_from_dev_baseline() -> None:
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    assert "baseline_ref:" not in workflow
    assert "candidate_ref:" not in workflow
    assert workflow.count("ref: ${{ inputs.baseline_sha }}") == 1
    assert workflow.count("ref: ${{ inputs.candidate_sha }}") == 1
    assert "must be distinct" in workflow
    assert '[[ "$sha" =~ ^[0-9a-f]{40}$ ]]' in workflow
    assert "merge-base --is-ancestor" in workflow
    assert "refs/remotes/origin/main" not in workflow
    assert "refs/remotes/origin/dev" in workflow
    assert '"$BASELINE_SHA" "$CANDIDATE_SHA"' in workflow
    assert "candidate SHA does not descend from baseline SHA" in workflow
    assert workflow.count("needs.prepare.outputs.baseline_sha") == 2
    assert workflow.count("needs.prepare.outputs.candidate_sha") == 2
    assert "fail-fast: false" in workflow
    assert "always() && needs.prepare.result == 'success'" in workflow
    assert workflow.count("if: always()") >= 2


def test_multi_tool_variant_uses_sequential_workflow_evaluator() -> None:
    script = EVALUATOR_SCRIPT_PATH.read_text(encoding="utf-8")

    assert 'args.meeting_variant == "multi_tool"' in script
    assert "evaluate_workflow_suite(" in script
    assert "build_workflow_evaluation_report(" in script
    assert '"evaluatorSha256": _evaluator_sha256()' in script
    assert 'Path("app/agent_workflow_evaluation.py")' in script
    assert 'Path("app/agent_planner_comparison.py")' in script


def test_comparison_command_fails_without_improvement_evidence() -> None:
    script = COMPARISON_SCRIPT_PATH.read_text(encoding="utf-8")

    assert 'comparison["improvementEvidence"]["passed"] is True' in script
