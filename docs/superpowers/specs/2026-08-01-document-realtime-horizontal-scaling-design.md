# Document Realtime Horizontal Scaling Design

Date: 2026-08-01

Base revision: `c406d0a5`

Target environment: local Docker verification followed by the `pilo-dev-realtime-server` ECS service

## Purpose

The current document checkpoint design is safe when one Realtime Server process owns every connection for a document. Scaling the ECS service from one task to two can split one document's clients across two independent Hocuspocus/Yjs rooms. Each process can then load the same App Server document version and attempt a checkpoint, producing a normal-path `409 Conflict`. The two client groups also do not receive each other's Yjs updates or awareness state through the current Socket.IO Redis adapter because native documents use a separate Hocuspocus transport.

This change makes native document collaboration correct with two healthy Realtime Server tasks during normal operation, deployments, and graceful scale-in. It also produces before-and-after operational evidence suitable for troubleshooting documentation.

## Scope

Included:

- deterministic local two-node reproduction with five document sessions split `3:2`;
- structured, secret-free logs that identify the Realtime instance and checkpoint outcome;
- Hocuspocus Redis Extension integration for cross-instance Yjs update and awareness propagation;
- Redis-coordinated suppression of duplicate stores for the same document;
- the existing latest-snapshot merge and single retry as a fallback for exceptional `409` responses;
- one-second checkpoint batching and immediate pending-store flush during graceful shutdown;
- three rounds of five sessions with 300 unique edits per session;
- graceful termination of one node followed by reconnect to the surviving node;
- a local HTML evidence view and screenshots generated from real test events;
- an observability-only dev deployment used to capture the pre-fix conflict;
- final dev deployment with two healthy ECS tasks and Redis document synchronization enabled.

Excluded:

- zero-loss guarantees for force-killed processes or infrastructure failure;
- durable Yjs update queues or replay after a hard crash;
- CPU-oriented document sharding;
- more than two Realtime Server tasks;
- production-environment changes;
- database schema changes.

## Chosen Approach

Use `@hocuspocus/extension-redis` at the same `4.4.x` version as the installed Hocuspocus server. The extension is enabled only when `DOCUMENT_REDIS_SYNC_ENABLED=true` and requires `REDIS_URL`. Every process receives a unique `REALTIME_INSTANCE_ID`, falling back to the container hostname when the variable is absent.

This is preferred over a custom Redis mutex and update protocol because the official extension already coordinates Hocuspocus document updates, awareness, and store execution. It is preferred over document-affinity routing because the current WebSocket upgrade URL does not expose the document identifier to the ALB.

The extension does not replace PostgreSQL persistence. App Server document snapshots remain the durable source of truth. The existing version guard and merge/retry path remain enabled as defense in depth.

## Runtime Architecture

```text
Browser A/B/C ── WebSocket ── Realtime Task 1 ─┐
                                                ├── Redis
Browser D/E   ── WebSocket ── Realtime Task 2 ─┘

Redis-coordinated Hocuspocus document
                  │
                  ├── Yjs updates and awareness propagated to both tasks
                  └── one effective store execution for a document checkpoint
                                      │
                                      ▼
                              App Server snapshot API
                                      │
                                      ▼
                                  PostgreSQL
```

### Edit flow

1. A browser update arrives at either Realtime task.
2. The local Hocuspocus document applies the Yjs update.
3. The Redis Extension propagates it to the other task.
4. The other task applies it and broadcasts it to its locally connected browsers.
5. All five clients converge on the same set of unique edit IDs before persistence is evaluated.

### Checkpoint flow

1. Hocuspocus batches dirty document changes for one second.
2. Redis coordination prevents both instances from executing the same document store concurrently.
3. The effective store calls the existing App Server snapshot API with its current expected version.
4. A successful save advances the in-process room version.
5. If an exceptional `409` occurs, the Realtime Server logs the conflict, fetches the latest snapshot, applies it to the Yjs document, and retries exactly once.

### Graceful shutdown flow

1. ECS sends the process termination signal during deployment or scale-in.
2. The task stops accepting useful document work and closes active document connections.
3. Hocuspocus flushes pending stores before Redis/document resources are destroyed.
4. Browsers reconnect through the ALB and may land on the surviving task.
5. The surviving task serves the Redis-synchronized room or loads the latest PostgreSQL snapshot.

Hard process termination before flush is outside this design's loss guarantee.

## Configuration

New environment variables:

- `DOCUMENT_REDIS_SYNC_ENABLED`: exact string `true` enables document Redis synchronization; any other value disables it.
- `REALTIME_INSTANCE_ID`: unique, non-secret identifier included in health and structured logs. ECS uses the container hostname when it is not explicitly set.

Rules:

- When document Redis synchronization is enabled, a missing or invalid `REDIS_URL` is a startup error.
- Single-node local development remains available with the feature disabled.
- Dev ECS final state uses `DOCUMENT_REDIS_SYNC_ENABLED=true` and desired count `2`.
- The pre-fix evidence deployment uses the same observable binary with synchronization disabled and desired count `2` for a short, controlled test window.

## Observability

Structured JSON log events contain no bearer tokens, document contents, Redis credentials, or user PII.

Required events:

- `document_room_authenticated`: `instanceId`, `workspaceId`, `documentId`;
- `document_checkpoint_started`: `instanceId`, `workspaceId`, `documentId`, `expectedVersion`;
- `document_checkpoint_succeeded`: the same identifiers plus `savedVersion` and `retry=false|true`;
- `document_checkpoint_conflict`: the same identifiers plus stale `expectedVersion`;
- `document_checkpoint_failed`: identifiers, safe error category, and HTTP status when available;
- `document_redis_sync_ready`: `instanceId` and enabled state.

The health response adds:

```json
{
  "instanceId": "task-or-local-id",
  "sync": {
    "documents": {
      "redis": {
        "enabled": true,
        "status": "connected"
      }
    }
  }
}
```

Health must not report ready when synchronization is enabled but Redis initialization failed.

## Failure Handling

- Redis unavailable at startup with synchronization enabled: fail startup so ECS does not register an unsafe task.
- Redis error after startup: log a safe error and make document synchronization health non-ready. Normal reconnection and ECS replacement handle recovery; the service must not silently claim healthy multi-node document synchronization.
- App Server `409`: fetch latest, merge, retry once.
- Second `409` or non-409 save failure: log and propagate the checkpoint failure; do not report a successful store.
- Graceful shutdown: wait for pending document stores before closing Redis connections and exiting.
- Evidence mode disabled: no diagnostic HTML server is exposed by the deployed Realtime service. The local test runner generates the evidence artifact.

## Verification Design

### Automated baseline

Start two Realtime processes on distinct ports and with distinct instance IDs while document Redis synchronization is disabled. Connect five providers to one document, split `3:2`, and issue 300 unique edits from each provider. Use per-node forwarding proxies to record the source instance, expected version, and App Server response.

The baseline is valid only when:

- clients are confirmed on both instances;
- both instances attempt to store the same document generation;
- at least one normal-path `409` is captured; and
- the raw event log is retained for the evidence page.

### Automated fixed path

Repeat the identical load with document Redis synchronization enabled.

Required assertions per round:

- exactly five sessions, split `3:2`;
- exactly 1,500 unique server-received edit IDs;
- all five connected documents converge to the exact 1,500-ID set;
- normal-path checkpoint `409` count is zero;
- the persisted snapshot contains exactly 1,500 unique IDs;
- a fresh reconnect contains exactly 1,500 unique IDs;
- no duplicate or unexpected IDs exist.

Run three rounds for 4,500 total edits.

### Graceful scale-in path

With both nodes synchronized, place pending edits on sessions connected to both nodes, gracefully terminate one node, reconnect its sessions to the surviving node, and assert exact edit preservation and continued checkpoint success.

### Regression verification

- Realtime Server build, format check, lint, and full existing test suite;
- App Server build and relevant document tests;
- Docker-backed two-node E2E;
- direct PostgreSQL version and snapshot-row verification.

## Evidence Artifacts

The test runner writes a machine-readable JSON result and a local HTML report. The HTML report renders actual captured events rather than hard-coded outcomes.

Required screenshots:

- `before-redis-conflict.png`: two instance IDs, `3:2` session distribution, matching stale expected versions, and the actual `409` event;
- `after-redis-sync.png`: two instance IDs, cross-node 1,500/1,500 convergence, normal `409` count zero, persisted 1,500/1,500, and reconnect 1,500/1,500.

Screenshots must exclude AWS account IDs, ARNs, tokens, credentials, user emails, and document content.

## Dev Rollout and Rollback

1. Deploy the observable binary with `DOCUMENT_REDIS_SYNC_ENABLED=false` and desired count `1`.
2. Temporarily set desired count to `2`.
3. Confirm two healthy targets, run the controlled test document session, capture CloudWatch conflict evidence, and return desired count to `1`.
4. Enable `DOCUMENT_REDIS_SYNC_ENABLED=true` in the task definition and deploy with desired count `1`.
5. Confirm Redis document synchronization health.
6. Set desired count to `2`, wait for two healthy targets, and repeat the same manual scenario.
7. Capture the post-fix evidence and run graceful scale-in/reconnect verification.
8. Leave dev at desired count `2` only after automated and manual checks pass.

Rollback order:

1. Reduce desired count to `1` before disabling document Redis synchronization.
2. Roll back the task definition or set `DOCUMENT_REDIS_SYNC_ENABLED=false`.
3. Confirm one healthy task and document checkpoint success.

## Resume Claim Boundary

After all required checks pass, the defensible claim is limited to two Realtime instances under normal operation and graceful scale-in. It must not claim zero-loss hard-crash recovery or CPU-linear autoscaling.

The result statement must use measured before-and-after conflict counts and the exact number of preserved server-received edits.
