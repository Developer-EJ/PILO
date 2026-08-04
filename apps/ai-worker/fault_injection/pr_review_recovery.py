from __future__ import annotations

import json
from dataclasses import dataclass
from enum import Enum
from uuid import NAMESPACE_URL, uuid5

from app.job_dispatcher import JobDispatcher
from app.meeting_report_runtime import RuntimeSettings, SqsAiJobWorker
from app.pr_review_analysis_processor import (
    PR_REVIEW_ANALYSIS_JOB_TYPE,
    PR_REVIEW_ANALYSIS_SCHEMA_VERSION,
    PrReviewAnalysisFileResult,
    PrReviewAnalysisInput,
    PrReviewAnalysisProcessor,
    PrReviewAnalysisResult,
    PrReviewAnalysisStaleError,
    PrReviewChangedFileInput,
    PrReviewPullRequestInput,
)


class FaultBoundary(str, Enum):
    BEFORE_PROVIDER = "before_provider"
    AFTER_PROVIDER = "after_provider"
    AFTER_PERSIST = "after_persist"


class SimulatedWorkerCrash(BaseException):
    """Models abrupt process loss without entering application error handling."""


@dataclass(frozen=True)
class FaultInjectionCaseResult:
    boundary: FaultBoundary
    case_number: int
    job_id: str
    message_id: str
    injected_crashes: int
    delivery_attempts: int
    unique_message_ids: int
    terminal_status: str
    persisted_result_count: int
    non_terminal_job_count: int
    remaining_queue_messages: int
    provider_calls: int

    def to_dict(self) -> dict[str, object]:
        return {
            "boundary": self.boundary.value,
            "caseNumber": self.case_number,
            "jobId": self.job_id,
            "messageId": self.message_id,
            "injectedCrashes": self.injected_crashes,
            "deliveryAttempts": self.delivery_attempts,
            "uniqueMessageIds": self.unique_message_ids,
            "terminalStatus": self.terminal_status,
            "persistedResultCount": self.persisted_result_count,
            "nonTerminalJobCount": self.non_terminal_job_count,
            "remainingQueueMessages": self.remaining_queue_messages,
            "providerCalls": self.provider_calls,
        }


class _OneShotFault:
    def __init__(self, boundary: FaultBoundary) -> None:
        self.boundary = boundary
        self.injected_crashes = 0

    def inject(self, boundary: FaultBoundary) -> None:
        if self.boundary is not boundary or self.injected_crashes > 0:
            return
        self.injected_crashes += 1
        raise SimulatedWorkerCrash(f"simulated worker crash at {boundary.value}")


class _DurablePrReviewHandoff:
    def __init__(
        self,
        input_value: PrReviewAnalysisInput,
        fault: _OneShotFault,
    ) -> None:
        self.input_value = input_value
        self.fault = fault
        self.job_status = "QUEUED"
        self.session_status = "ANALYZING"
        self.persisted_results: list[PrReviewAnalysisResult] = []

    def get_input(self, job) -> PrReviewAnalysisInput:
        if self.session_status != "ANALYZING":
            raise PrReviewAnalysisStaleError("PR Review analysis session is no longer active")
        if self.job_status not in {"PUBLISHING", "QUEUED", "PROCESSING"}:
            raise PrReviewAnalysisStaleError("PR Review analysis job is no longer active")
        self.job_status = "PROCESSING"
        return self.input_value

    def submit_result(self, job, analysis: PrReviewAnalysisResult) -> None:
        self.fault.inject(FaultBoundary.AFTER_PROVIDER)
        if self.job_status == "SUCCEEDED" and self.session_status == "REVIEWING":
            return
        if self.session_status != "ANALYZING":
            raise PrReviewAnalysisStaleError("PR Review analysis session is no longer active")

        self.persisted_results.append(analysis)
        self.job_status = "SUCCEEDED"
        self.session_status = "REVIEWING"

    def submit_failure(self, job, code: str) -> None:
        if self.job_status == "SUCCEEDED" and self.session_status == "REVIEWING":
            return
        if self.job_status == "FAILED" or self.session_status == "FAILED":
            return
        self.job_status = "FAILED"
        self.session_status = "FAILED"


class _ControlledAnalysisClient:
    def __init__(
        self,
        result: PrReviewAnalysisResult,
        fault: _OneShotFault,
    ) -> None:
        self.result = result
        self.fault = fault
        self.provider_calls = 0

    def analyze(self, input_value: PrReviewAnalysisInput) -> PrReviewAnalysisResult:
        self.fault.inject(FaultBoundary.BEFORE_PROVIDER)
        self.provider_calls += 1
        return self.result


class _RedeliveringSqsClient:
    def __init__(
        self,
        body: str,
        message_id: str,
        fault: _OneShotFault,
    ) -> None:
        self.body = body
        self.message_id = message_id
        self.fault = fault
        self.deleted = False
        self.delivery_attempts = 0
        self.received_message_ids: list[str] = []

    def receive_message(self, **kwargs) -> dict[str, object]:
        if self.deleted:
            return {"Messages": []}

        self.delivery_attempts += 1
        self.received_message_ids.append(self.message_id)
        return {
            "Messages": [
                {
                    "Body": self.body,
                    "ReceiptHandle": f"receipt-{self.delivery_attempts}",
                    "MessageId": self.message_id,
                    "Attributes": {
                        "ApproximateReceiveCount": str(self.delivery_attempts),
                    },
                }
            ]
        }

    def change_message_visibility(self, **kwargs) -> None:
        return None

    def delete_message(self, **kwargs) -> None:
        self.fault.inject(FaultBoundary.AFTER_PERSIST)
        self.deleted = True


def run_fault_injection_case(
    boundary: FaultBoundary,
    case_number: int,
) -> FaultInjectionCaseResult:
    if case_number < 1:
        raise ValueError("case_number must be positive")

    job_id = _case_uuid(boundary, case_number, "job")
    review_session_id = _case_uuid(boundary, case_number, "session")
    workspace_id = _case_uuid(boundary, case_number, "workspace")
    message_id = _case_uuid(boundary, case_number, "message")
    payload = {
        "jobType": PR_REVIEW_ANALYSIS_JOB_TYPE,
        "schemaVersion": PR_REVIEW_ANALYSIS_SCHEMA_VERSION,
        "jobId": job_id,
        "reviewSessionId": review_session_id,
        "workspaceId": workspace_id,
        "headSha": f"fault-injection-{case_number:02d}",
    }

    fault = _OneShotFault(boundary)
    handoff = _DurablePrReviewHandoff(_analysis_input(payload), fault)
    analysis_client = _ControlledAnalysisClient(_analysis_result(), fault)
    processor = PrReviewAnalysisProcessor(handoff, analysis_client)
    dispatcher = JobDispatcher(pr_review_analysis_processor=processor)
    sqs_client = _RedeliveringSqsClient(json.dumps(payload), message_id, fault)

    for _ in range(3):
        if sqs_client.deleted:
            break
        worker = SqsAiJobWorker(_runtime_settings(), dispatcher, sqs_client)
        try:
            worker.run_once()
        except SimulatedWorkerCrash:
            continue

    terminal_status = handoff.job_status
    non_terminal_job_count = int(terminal_status not in {"SUCCEEDED", "FAILED"})
    return FaultInjectionCaseResult(
        boundary=boundary,
        case_number=case_number,
        job_id=job_id,
        message_id=message_id,
        injected_crashes=fault.injected_crashes,
        delivery_attempts=sqs_client.delivery_attempts,
        unique_message_ids=len(set(sqs_client.received_message_ids)),
        terminal_status=terminal_status,
        persisted_result_count=len(handoff.persisted_results),
        non_terminal_job_count=non_terminal_job_count,
        remaining_queue_messages=int(not sqs_client.deleted),
        provider_calls=analysis_client.provider_calls,
    )


def run_fault_injection_matrix(repetitions: int = 10) -> list[FaultInjectionCaseResult]:
    if repetitions < 1:
        raise ValueError("repetitions must be positive")
    return [
        run_fault_injection_case(boundary, case_number)
        for boundary in FaultBoundary
        for case_number in range(1, repetitions + 1)
    ]


def build_fault_injection_report(
    results: list[FaultInjectionCaseResult],
    *,
    generated_at: str,
    git_commit: str,
) -> dict[str, object]:
    return {
        "schemaVersion": "pr-review-fault-injection:v1",
        "executionMode": "controlled_integration",
        "generatedAt": generated_at,
        "gitCommit": git_commit,
        "summary": _summarize_results(results),
        "boundaries": {
            boundary.value: _summarize_results(
                [result for result in results if result.boundary is boundary]
            )
            for boundary in FaultBoundary
        },
        "cases": [result.to_dict() for result in results],
        "claimBoundary": {
            "persistedResultDelivery": "exactly_once_effect",
            "externalProviderCalls": "at_least_once",
            "realAwsInterruptionsIncluded": False,
        },
    }


def _summarize_results(results: list[FaultInjectionCaseResult]) -> dict[str, int]:
    terminal_succeeded = sum(result.terminal_status == "SUCCEEDED" for result in results)
    return {
        "totalJobs": len(results),
        "terminalSucceeded": terminal_succeeded,
        "lostJobs": len(results) - terminal_succeeded,
        "duplicatePersistedResults": sum(
            max(0, result.persisted_result_count - 1) for result in results
        ),
        "nonTerminalJobs": sum(result.non_terminal_job_count for result in results),
        "remainingQueueMessages": sum(result.remaining_queue_messages for result in results),
        "injectedCrashes": sum(result.injected_crashes for result in results),
        "deliveryAttempts": sum(result.delivery_attempts for result in results),
        "providerCalls": sum(result.provider_calls for result in results),
    }


def _case_uuid(boundary: FaultBoundary, case_number: int, kind: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"pilo:{boundary.value}:{case_number}:{kind}"))


def _analysis_input(payload: dict[str, str]) -> PrReviewAnalysisInput:
    from app.pr_review_analysis_processor import PrReviewAnalysisJob

    job = PrReviewAnalysisJob(
        job_id=payload["jobId"],
        review_session_id=payload["reviewSessionId"],
        workspace_id=payload["workspaceId"],
        head_sha=payload["headSha"],
    )
    return PrReviewAnalysisInput(
        job=job,
        pull_request=PrReviewPullRequestInput(
            pr_number=101,
            title="Fault-injection verification",
            body="Verify recovery across asynchronous delivery boundaries.",
            state="open",
            draft=False,
            mergeable=True,
            author_login="pilo-test",
            head_branch="test/pr-review-recovery",
            base_branch="dev",
            base_sha="base-sha",
            changed_files_count=1,
            additions=10,
            deletions=2,
            commits_count=1,
        ),
        files=(
            PrReviewChangedFileInput(
                file_path="apps/ai-worker/app/pr_review_analysis_processor.py",
                previous_file_path=None,
                file_name="pr_review_analysis_processor.py",
                file_status="modified",
                additions=10,
                deletions=2,
                is_binary=False,
                is_large_diff=False,
                patch="+controlled fault-injection verification",
            ),
        ),
    )


def _analysis_result() -> PrReviewAnalysisResult:
    return PrReviewAnalysisResult(
        pr_purpose="Verify recoverable asynchronous PR Review analysis.",
        change_summary=("Exercise one controlled worker interruption.",),
        recommended_review_order="Review the worker delivery boundary first.",
        caution_points=("External provider calls are at-least-once.",),
        flow_title="PR Review recovery verification",
        flow_description="Redeliver the same SQS job after worker interruption.",
        files=(
            PrReviewAnalysisFileResult(
                file_path="apps/ai-worker/app/pr_review_analysis_processor.py",
                file_role="PR Review analysis processor",
                risk_level="medium",
                change_reason="Validate recovery behavior.",
                change_summary="Controlled interruption and redelivery.",
                review_points=("Confirm exactly one persisted result.",),
            ),
        ),
    )


def _runtime_settings() -> RuntimeSettings:
    return RuntimeSettings(
        aws_region="ap-northeast-2",
        sqs_queue_url="https://sqs.example.com/pr-review-fault-injection",
        sqs_endpoint=None,
        database_url="postgresql://pilo:pilo@localhost:5432/pilo",
        database_ssl=False,
        recordings_bucket="unused",
        openai_api_key="unused",
        openai_stt_model="unused",
        openai_meeting_report_model="unused",
        openai_meeting_transcript_embedding_model="unused",
        openai_agent_planner_model="unused",
        openai_agent_planner_timeout_seconds=60,
        openai_agent_router_model="unused",
        openai_agent_router_timeout_seconds=60,
        agent_execution_handoff_base_url="http://localhost:4000",
        agent_execution_handoff_token="unused",
        agent_execution_handoff_timeout_seconds=10,
        agent_stale_execution_sweep_interval_seconds=60,
        wait_time_seconds=1,
        visibility_timeout_seconds=30,
        canvas_embedding_jobs_per_tick=1,
        meeting_transcript_embedding_jobs_per_tick=1,
    )
