# PR Review Fault-Injection Verification Plan

> **Goal:** Produce reproducible evidence that the PR Review async pipeline recovers from worker interruption at three delivery boundaries without losing jobs, duplicating persisted results, or leaving non-terminal jobs behind.

## Scope

This plan validates the existing DB-backed Job, SQS delivery, AI Worker, and idempotent result handoff design. It does not claim that an external AI request itself is exactly-once. A crash after the provider responds can cause another provider call after redelivery; the invariant is that the durable job and persisted analysis result converge exactly once.

The primary evidence is a deterministic integration test using the production `SqsAiJobWorker`, `JobDispatcher`, and `PrReviewAnalysisProcessor` with in-memory substitutes only at external boundaries (SQS, App Server handoff, and AI provider). A smaller AWS dev verification will later exercise one representative job per boundary after the current App Server health issue is resolved.

## Invariants

- Every injected interruption leaves the SQS message undeleted on the first receive.
- The same message and Job ID are delivered again with a higher receive count.
- Every Job reaches a terminal `SUCCEEDED` state after fault injection is disabled for redelivery.
- Exactly one durable analysis result exists per Job.
- No Job remains in `QUEUED` or `PROCESSING`.
- Provider call counts are recorded, not forced to one; calls may repeat after the provider boundary.
- The queue is empty after successful acknowledgement.

## Test Matrix

| Boundary | Injection point | Expected first attempt | Expected recovery |
| --- | --- | --- | --- |
| `before_provider` | After input handoff, immediately before AI provider call | Message remains; no provider result | Redelivery runs provider and persists once |
| `after_provider` | After provider response, immediately before result handoff | Message remains; first provider response is lost | Redelivery may call provider again; persists once |
| `after_persist` | After idempotent result persistence, immediately before SQS delete | Result exists; message remains | Redelivery converges on the existing result and acknowledges |

Each boundary runs against 10 unique Job IDs, yielding 30 separately reported pytest cases.

## Tasks

### 1. Add a failing recovery-matrix test

**Files:**
- Create: `apps/ai-worker/tests/test_pr_review_fault_injection.py`

Build fakes that preserve SQS redelivery state and durable Job/result state. Parameterize the three boundaries and ten case numbers. Assert final state, receive count, persisted result count, queue drain, and provider call count.

Run the test before adding the injection seam and confirm that it fails for the missing capability.

### 2. Add a controlled external-boundary harness

**Files:**
- Create: `apps/ai-worker/fault_injection/__init__.py`
- Create: `apps/ai-worker/fault_injection/pr_review_recovery.py`

Use the production worker, dispatcher, and processor unchanged. Inject a one-shot `BaseException` subclass through controlled substitutes at the existing external boundaries: the provider client before its call, the result handoff after the provider response, and SQS immediately before delete. Preserve durable handoff state and SQS redelivery state across worker instances so the second receive exercises the normal recovery path.

### 3. Export machine-readable evidence

**Files:**
- Create: `apps/ai-worker/scripts/run_pr_review_fault_injection.py`
- Create: `docs/infra/evidence/pr-review-fault-injection.json`

Reuse the same harness to execute all 30 cases and write aggregate plus per-case evidence. Include test timestamp, commit, boundary, Job ID, receives, provider calls, persisted result count, terminal status, and queue depth.

### 4. Document claim boundaries and reproduction

**Files:**
- Modify: `docs/infra/pr-review-operations.md`

Document the command, the controlled-integration result, and the distinction between persisted-result idempotency and external provider exactly-once behavior. Keep AWS interruption results in a separate section and do not mark them complete until observed.

### 5. Verify

Run focused recovery tests, existing PR Review tests, formatting/lint checks, and the evidence exporter. Compare the generated aggregate with the intended `30/30 terminal, 0 lost, 0 duplicate persisted results, 0 non-terminal` claim.

After the App Server is healthy, run three representative AWS dev cases and attach CloudWatch/SQS/DB observations without inflating them into 30 production interruptions.
