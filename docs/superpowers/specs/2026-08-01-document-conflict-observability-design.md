# Document Snapshot Conflict Observability Design

Date: 2026-08-01

Target environment: `pilo-dev-app-server` and `pilo-dev-realtime-server` on ECS

## Purpose

The two-node Realtime Server baseline produced transient document divergence and one App Server target 4XX response, but the deployed App Server task definition did not send container logs to CloudWatch. Because ALB access logging was also disabled, the AWS evidence cannot identify the response as the document snapshot version guard's `409 Conflict`.

This change records a bounded, content-free event at the exact version mismatch and repairs the App Server deployment path so every newly deployed task sends container output to the existing CloudWatch log group. The resulting evidence must show the stale expected version and the current persisted version without exposing document contents, user identity, credentials, or tokens.

## Scope

Included:

- one structured App Server warning when `saveDocumentSnapshot` rejects an outdated expected version;
- CloudWatch `awslogs` configuration on the deployed App Server task definition;
- immutable image deployment through a newly registered task definition;
- serialized, rollback-safe App Server deployments;
- automated contract tests for the event shape, privacy boundary, and deployment workflow;
- a controlled two-node dev baseline that captures an exact `409` event;
- immediate continuation from the baseline to the coordinated Realtime Server deployment;
- public evidence redaction for AWS account identifiers and internal document identifiers.

Excluded:

- logging every application `409` through a global exception filter;
- enabling ALB access logs;
- logging document title, content JSON, plain text, Yjs state, attachments, user ID, request headers, or tokens;
- production deployment;
- changing the snapshot conflict behavior itself;
- adding a new database table or audit-log record.

## Chosen Approach

Log the event in `DocumentService.saveDocumentSnapshot`, immediately before throwing the existing conflict error. This location has the authoritative `expectedVersion` and row-locked `currentVersion`, and it avoids expanding all application error logging.

The App Server workflow will capture the service's current task definition and running image digest, build the new image, generate a new task definition with the immutable image digest and required `awslogs` configuration, register it, and deploy it through a one-task canary. Deployments are serialized and a failed canary restores the prior immutable image and task count.

This is preferred over ALB access logging because ALB logs cannot show the two document versions. It is preferred over a global exception filter because the filter cannot recover the row-locked current version without coupling transport error handling to document internals and would broaden the privacy and volume risk.

## Event Contract

The warning is one JSON object:

```json
{
  "event": "document_snapshot_conflict",
  "status": 409,
  "documentId": "22de0bf0-eb30-4af7-8d14-012ea6d3405f",
  "expectedVersion": 3,
  "currentVersion": 4
}
```

Rules:

- `event` is always `document_snapshot_conflict`.
- `status` is always the number `409`.
- `documentId` is the internal UUID supplied to the existing save operation.
- `expectedVersion` is the validated client/server checkpoint version.
- `currentVersion` is read from the row locked by the save transaction.
- The event is emitted once for each rejected snapshot request.
- Logging failure must not change the existing HTTP response or transaction result.
- `workspaceId` is intentionally omitted because `documentId` is sufficient to locate the resource.
- `currentUserId`, document title, body fields, attachment IDs, headers, and error objects are never passed to the event builder.

CloudWatch is an internal operational system and retains the raw document UUID for direct incident lookup. Before an image is used in a resume, portfolio, or other external material, the document UUID and AWS account identifiers are masked. Expected and current version numbers remain visible.

## Application Design

A small document-conflict observer owns event construction and logging. Its input type contains only the five allowed values, making accidental serialization of the save request impossible. `DocumentService` calls the observer only in the existing version mismatch branch and then throws the unchanged `Document version is outdated` conflict.

The observer serializes the bounded event with `JSON.stringify` and writes exactly one JSON line to stderr. It intentionally bypasses Nest's default text formatter because that formatter adds a timestamp, process ID, level, and context around the message and prevents CloudWatch from treating `event` as a top-level JSON field. The observer catches sink failures so observability cannot turn a normal `409` into a different server error.

The observer is injectable with a safe default so existing manual service construction and tests remain compatible.

## ECS Logging and Deployment

Terraform already declares the App Server log group and an `awslogs` container configuration, but the deployed App Server task definition has drifted and the current workflow only forces a deployment of that old definition. The workflow therefore must register a corrected revision instead of reusing it.

For the `app-server` container, the next task definition must contain:

- the built image by registry digest, not `latest`;
- `logDriver = awslogs`;
- the existing dev App Server log group;
- `awslogs-region = ap-northeast-2`;
- `awslogs-stream-prefix = app-server`.

The workflow must verify that the expected CloudWatch log group exists before deployment. It must not silently create a Terraform-owned resource. It also verifies the registered definition before updating the ECS service.

The GitHub sync worker uses the same App Server image and is therefore updated after the App Server canary succeeds. It receives its own immutable-digest task definition, one-task verification, desired-count restoration, and prior-digest rollback. The App Server task definition is never reused for the worker.

## Rollout Sequence

1. Deploy the App Server observability revision as a one-task canary and verify health and CloudWatch log delivery.
2. Set the current Realtime Server revision to two tasks with document Redis synchronization still disabled.
3. Confirm two healthy Realtime targets and distribute five authenticated sessions across both tasks.
4. Execute the controlled edit load and capture at least one exact `document_snapshot_conflict` event.
5. Do not restore the old Realtime revision to a one-task steady state.
6. Immediately deploy the coordinated Realtime Server revision through its one-task canary, verify Redis synchronization readiness, and scale it to two tasks.
7. Repeat the identical load and confirm zero normal-path conflict events, convergence, persisted edit preservation, and reconnect preservation.

The temporary one-task stage in step 6 is a deployment canary, not a rollback to the old one-node architecture. No active user traffic is expected during this controlled dev rollout.

## Failure and Rollback

- Missing CloudWatch log group: fail before updating ECS and apply/reconcile Terraform separately.
- App Server canary fails health or log delivery: restore the previous immutable App Server image and previous desired count.
- Exact baseline `409` is not observed: retain two tasks only while inspecting routing and test distribution; do not label the run as conflict evidence.
- Coordinated Realtime canary fails: roll back according to the Realtime workflow's safe rollback path. The baseline task count is not a reason to leave an unverified two-node, Redis-disabled service running indefinitely.
- Evidence capture fails after a successful conflict: query the same bounded time window again; do not rerun destructive or unrelated traffic.

## Verification

### Automated application checks

- The event builder returns exactly the five allowed fields and numeric versions.
- Serialized output contains none of the supplied privacy sentinels for user ID, title, content, Yjs state, attachment ID, authorization header, or token.
- A matching version emits no conflict event.
- A mismatch emits exactly one warning and preserves the existing `409` error.
- A logger exception still preserves the existing `409` error.
- The production sink emits exactly one parseable JSON object without a Nest text prefix.
- App Server format, lint, build, and full test suite pass.

### Automated workflow checks

- The App Server workflow is serialized with `cancel-in-progress: false`.
- It captures the prior task definition, desired count, and running image digest.
- It verifies the CloudWatch log group.
- It registers an immutable-digest task definition containing the required `awslogs` options.
- It deploys one task before returning to the intended count.
- CloudWatch delivery is verified by reading events after canary start from the exact stream derived from the running canary task ID. It does not rely on the eventually consistent `DescribeLogStreams.lastEventTimestamp` field or merely any stream with the App Server prefix.
- A failed canary uses the prior immutable image and restores the prior count.
- The optional GitHub sync worker independently preserves and restores its task definition, digest, and desired count.
- `actionlint` and embedded shell checks pass.

### Dev evidence checks

The baseline evidence is valid only when all of the following are visible or retained in machine-readable records:

- two healthy Realtime ECS tasks;
- five authenticated sessions routed across both task instances;
- an App Server CloudWatch event with `event=document_snapshot_conflict`, `status=409`, and differing expected/current versions;
- a bounded timestamp window linking the controlled test to the event.

The fixed evidence additionally requires:

- two healthy Realtime tasks reporting Redis document synchronization ready;
- five sessions and 1,500 unique edits per round;
- zero App Server `document_snapshot_conflict` events in the bounded test window;
- exact live convergence, persisted snapshot preservation, and reconnect preservation;
- three successful rounds before using the final resume metric.

## Claim Boundary

The AWS baseline can be described as an actual two-task dev deployment that produced an exact stale-version `409`. The fixed result can claim zero observed snapshot conflicts only for the stated two-task, five-session, 1,500-edit-per-round test and its three executions. It must not claim unlimited autoscaling safety, hard-crash zero loss, or a production incident unless those conditions were separately measured.
