import pytest

from app.runtime.contract_validation import (
    ContractValidationError,
    validate_agent_action,
    validate_agent_job_message,
)


def test_agent_job_message_validation_rejects_wrong_workflow_payload() -> None:
    payload = {
        "jobId": "11111111-1111-1111-1111-111111111111",
        "runId": "22222222-2222-2222-2222-222222222222",
        "workflowType": "meeting.report.generate",
        "workflowVersion": "v1",
        "workspaceId": "33333333-3333-3333-3333-333333333333",
        "actorMemberId": "44444444-4444-4444-4444-444444444444",
        "requestedAt": "2026-06-29T00:00:00Z",
        "input": {
            "repositoryId": "55555555-5555-5555-5555-555555555555",
            "pullRequestId": "66666666-6666-6666-6666-666666666666",
        },
    }

    with pytest.raises(ContractValidationError):
        validate_agent_job_message(payload)


def test_agent_action_validation_rejects_unknown_payload_fields() -> None:
    payload = {
        "id": "11111111-1111-1111-1111-111111111111",
        "workspaceId": "22222222-2222-2222-2222-222222222222",
        "type": "task.update.status",
        "source": "agent",
        "status": "pending",
        "payload": {
            "taskId": "33333333-3333-3333-3333-333333333333",
            "status": "done",
            "unexpected": "must be rejected",
        },
        "createdAt": "2026-06-29T00:00:00Z",
    }

    with pytest.raises(ContractValidationError):
        validate_agent_action(payload)
