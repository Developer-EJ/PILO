import pytest

from fault_injection.pr_review_recovery import (
    FaultBoundary,
    build_fault_injection_report,
    run_fault_injection_case,
    run_fault_injection_matrix,
)

CASES = [
    pytest.param(boundary, case_number, id=f"{boundary.value}-job-{case_number:02d}")
    for boundary in FaultBoundary
    for case_number in range(1, 11)
]


@pytest.mark.parametrize(("boundary", "case_number"), CASES)
def test_pr_review_job_recovers_after_one_worker_interruption(
    boundary: FaultBoundary,
    case_number: int,
) -> None:
    result = run_fault_injection_case(boundary, case_number)

    assert result.boundary == boundary
    assert result.case_number == case_number
    assert result.injected_crashes == 1
    assert result.delivery_attempts == 2
    assert result.unique_message_ids == 1
    assert result.terminal_status == "SUCCEEDED"
    assert result.persisted_result_count == 1
    assert result.non_terminal_job_count == 0
    assert result.remaining_queue_messages == 0

    expected_provider_calls = 2 if boundary is FaultBoundary.AFTER_PROVIDER else 1
    assert result.provider_calls == expected_provider_calls


def test_fault_injection_report_summarizes_all_thirty_jobs() -> None:
    report = build_fault_injection_report(
        run_fault_injection_matrix(),
        generated_at="2026-07-31T00:00:00Z",
        git_commit="0123456789abcdef",
    )

    assert report["schemaVersion"] == "pr-review-fault-injection:v1"
    assert report["executionMode"] == "controlled_integration"
    assert report["generatedAt"] == "2026-07-31T00:00:00Z"
    assert report["gitCommit"] == "0123456789abcdef"
    assert report["summary"] == {
        "totalJobs": 30,
        "terminalSucceeded": 30,
        "lostJobs": 0,
        "duplicatePersistedResults": 0,
        "nonTerminalJobs": 0,
        "remainingQueueMessages": 0,
        "injectedCrashes": 30,
        "deliveryAttempts": 60,
        "providerCalls": 40,
    }
    assert report["boundaries"]["before_provider"]["providerCalls"] == 10
    assert report["boundaries"]["after_provider"]["providerCalls"] == 20
    assert report["boundaries"]["after_persist"]["providerCalls"] == 10
    assert len(report["cases"]) == 30
