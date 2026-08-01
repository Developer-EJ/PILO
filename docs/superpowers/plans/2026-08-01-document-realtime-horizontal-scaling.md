# Document Realtime Horizontal Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run two Realtime Server tasks against the same document without normal-operation checkpoint 409 conflicts, prove cross-node convergence and reconnect persistence, and retain before/after evidence suitable for an engineering resume.

**Architecture:** Each task keeps its own Hocuspocus server but joins document rooms through the official Hocuspocus Redis extension. Redis distributes Yjs updates and serializes store hooks. Inside that lock, the checkpoint service refreshes the App Server snapshot/version, merges peer state, skips an already-persisted duplicate, and saves only additional changes. PostgreSQL/App Server remains the durable source of truth, and the existing 409 merge-and-retry path remains as a defensive fallback. A feature flag supports a controlled A/B rollout and immediate rollback.

**Tech Stack:** Node.js 24, TypeScript, Hocuspocus 4.4, `@hocuspocus/extension-redis` 4.4, Yjs, Redis 7, PostgreSQL 16, Docker Compose, AWS ECS/Fargate, Terraform, Node test runner.

## Global Constraints

- Preserve the existing one-second checkpoint debounce and graceful shutdown flush.
- Do not claim hard-kill RPO 0; this change covers normal operation and graceful deploy/scale-in only.
- Never log access tokens, user IDs, document content, AWS account IDs, ARNs, or Redis credentials.
- `DOCUMENT_REDIS_SYNC_ENABLED=true` must fail startup when `REDIS_URL` is absent or invalid. Any other flag value means disabled.
- Use `REALTIME_INSTANCE_ID` when supplied and fall back to the container hostname otherwise.
- Keep the existing one-time 409 merge/retry path after Redis coordination is enabled.
- Keep the existing single-node concurrency E2E and its evidence files untouched.
- Do not scale the live dev service until the fixed image is deployed and the one-task health check passes.

---

## Task 1: Lock configuration behavior with failing tests

**Files:**

- Create: `apps/realtime-server/src/config/realtime-config.test.mjs`
- Modify: `apps/realtime-server/src/config/realtime-config.ts`
- Modify: `apps/realtime-server/scripts/test.mjs`

- [ ] Add tests that call `loadRealtimeServerConfig(env)` and assert these exact contracts:
  - absent flag produces `documentRedisSyncEnabled: false`;
  - exact string `true` produces `documentRedisSyncEnabled: true`;
  - enabled without `REDIS_URL` throws `DOCUMENT_REDIS_SYNC_ENABLED requires REDIS_URL`;
  - enabled with a non-`redis:`/`rediss:` URL throws `REDIS_URL must use redis: or rediss:`;
  - `REALTIME_INSTANCE_ID` is trimmed and used when present;
  - absent instance ID uses a non-empty hostname fallback.
- [ ] Import the new test from `apps/realtime-server/scripts/test.mjs`.
- [ ] Run `npm run build && node src/config/realtime-config.test.mjs` from `apps/realtime-server` and confirm the new test fails because the fields and validation do not exist.
- [ ] Extend `RealtimeServerConfig` with:

```ts
documentRedisSyncEnabled: boolean;
realtimeInstanceId: string;
```

- [ ] Implement strict flag parsing, URL protocol validation, and hostname fallback in `loadRealtimeServerConfig`.
- [ ] Re-run `npm run build && node src/config/realtime-config.test.mjs` and confirm it passes.
- [ ] Commit only Task 1 files with `test(realtime): define document redis sync config contract`.

## Task 2: Add structured document checkpoint telemetry

**Files:**

- Create: `apps/realtime-server/src/documents/document-observability.ts`
- Create: `apps/realtime-server/src/documents/document-observability.test.mjs`
- Modify: `apps/realtime-server/src/documents/document-checkpoint.service.ts`
- Modify: `apps/realtime-server/src/documents/document-checkpoint.service.test.mjs`
- Modify: `apps/realtime-server/src/documents/document-hocuspocus.service.ts`
- Modify: `apps/realtime-server/src/documents/document-hocuspocus.service.test.mjs`
- Modify: `apps/realtime-server/scripts/test.mjs`

- [ ] Add tests for a logger that emits one-line JSON containing `event`, `instanceId`, `workspaceId`, `documentId`, `expectedVersion`, `savedVersion`, `status`, and `durationMs`, while excluding `accessToken`, `userId`, and document content.
- [ ] Add checkpoint-service tests asserting the event sequence for:
  - first-attempt success: `document_checkpoint_started`, `document_checkpoint_succeeded`;
  - first 409: `document_checkpoint_conflict`, followed by a retry success;
  - non-409 failure or second 409: `document_checkpoint_failed`.
- [ ] Add Hocuspocus-service authentication coverage for `document_room_authenticated` without logging token or user identity.
- [ ] Run the focused tests and confirm they fail before implementation.
- [ ] Implement a dependency-injected `DocumentEventLogger` with default `console.log(JSON.stringify(event))` output.
- [ ] Inject `instanceId` and the logger into checkpoint and Hocuspocus service factories; time each checkpoint with a monotonic duration and record version transitions.
- [ ] Keep 409 behavior unchanged: fetch latest, apply update with `skipStoreHooks`, retry exactly once.
- [ ] Run all focused tests and `npm test`; confirm passing.
- [ ] Commit Task 2 files with `feat(realtime): add document checkpoint observability`.

## Task 3: Write the two-node A/B E2E before adding Redis coordination

**Files:**

- Create: `apps/realtime-server/scripts/document-two-node-scaling.e2e.mjs`
- Modify: `apps/realtime-server/package.json`
- Modify: `apps/realtime-server/package-lock.json`
- Reuse: `docker-compose.e2e.yml`
- Reuse: `db/migrations/000_e2e_pgcrypto_schema_compat.sql`

- [ ] Add `test:document-two-node:e2e` to run the new script.
- [ ] Make the runner start two Realtime Server child processes on distinct ports with instance IDs `realtime-a` and `realtime-b`, sharing App Server, PostgreSQL, and Redis.
- [ ] Route five Hocuspocus clients deterministically in a 3:2 split to the same document room.
- [ ] For each round, have every client append 300 unique edit IDs to one Y.Array; expected cardinality is exactly 1,500 with no duplicates.
- [ ] Capture App Server snapshot responses through the existing proxy technique and retain checkpoint event JSON from both child processes.
- [ ] Support two explicit modes:
  - `--mode=baseline`: Redis document sync disabled; require both instance IDs to checkpoint and require at least one normal-operation 409;
  - `--mode=fixed`: Redis document sync enabled; require zero normal-operation 409s, exact five-client live convergence, exact persisted cardinality, and exact fresh-reconnect cardinality.
- [ ] In fixed mode, gracefully terminate the task owning at least one client, reconnect that client to the survivor, append another unique marker, and require persisted/reconnected preservation.
- [ ] Run baseline mode and retain the real conflict event. This is expected to pass as a reproduction test.
- [ ] Run fixed mode before installing/configuring the extension and confirm it fails due to missing coordination or unsupported configuration. This is the feature-level RED test.
- [ ] Commit the new runner and script wiring with `test(realtime): reproduce two-node checkpoint conflict`.

## Task 4: Integrate the official Hocuspocus Redis extension

**Files:**

- Modify: `apps/realtime-server/package.json`
- Modify: `apps/realtime-server/package-lock.json`
- Create: `apps/realtime-server/src/documents/document-redis-sync.ts`
- Create: `apps/realtime-server/src/documents/document-redis-sync.test.mjs`
- Modify: `apps/realtime-server/src/documents/document-hocuspocus.service.ts`
- Modify: `apps/realtime-server/src/documents/document-hocuspocus.service.test.mjs`
- Modify: `apps/realtime-server/src/server.ts`
- Modify: `apps/realtime-server/scripts/test.mjs`

- [ ] Add exact-compatible dependency `@hocuspocus/extension-redis@^4.4.0`.
- [ ] Add factory tests asserting:
  - disabled mode returns no extension and reports `disabled`;
  - enabled mode creates one Redis extension from the validated URL;
  - startup emits `document_redis_sync_ready` with instance ID and no credentials;
  - shutdown destroys/closes Redis resources exactly once.
- [ ] Add a Hocuspocus service test that inspects the constructor configuration and proves the returned extension is included in `extensions`.
- [ ] Run the focused tests and confirm they fail before implementation.
- [ ] Implement `createDocumentRedisSync` around the official extension, deriving connection options from `new URL(redisUrl)` including TLS for `rediss:`.
- [ ] Pass `extensions: documentRedisSync.extensions` to Hocuspocus only when enabled.
- [ ] Construct document Redis sync in `server.ts` before Hocuspocus; close it during shutdown after Hocuspocus flushes and before process exit.
- [ ] Re-run focused tests, `npm run lint`, and `npm test`.
- [ ] Commit Task 4 files with `feat(realtime): coordinate document rooms through redis`.

## Task 5: Expose rollout state in health and configure ECS

**Files:**

- Create: `apps/realtime-server/src/server-health.test.mjs`
- Modify: `apps/realtime-server/src/server.ts`
- Modify: `apps/realtime-server/scripts/test.mjs`
- Modify: `infra/envs/dev/main.tf`

- [ ] Add a health-contract test asserting `/health` document sync data contains:

```json
{
  "instanceId": "realtime-a",
  "redisSync": { "enabled": true, "status": "ready" }
}
```

- [ ] Run the focused test and confirm it fails before health output is changed.
- [ ] Extend the health payload without removing existing fields.
- [ ] Set ECS task environment `DOCUMENT_REDIS_SYNC_ENABLED = "true"`; use the ECS/Fargate-provided `HOSTNAME` fallback rather than a static Terraform instance ID.
- [ ] Run `terraform fmt -check -recursive infra` and `terraform validate` in `infra/envs/dev` with initialized providers; if provider initialization is absent, run `terraform init -backend=false` before validate.
- [ ] Run `npm test` and confirm all existing health/source contracts still pass.
- [ ] Commit Task 5 files with `feat(infra): enable document redis coordination in dev`.

## Task 6: Prove the fixed behavior locally three times

**Files:**

- Modify if required by observed failures: `apps/realtime-server/scripts/document-two-node-scaling.e2e.mjs`
- Create: `docs/superpowers/evidence/document-two-node-before.json`
- Create: `docs/superpowers/evidence/document-two-node-after.json`

- [ ] Start the existing Docker E2E dependencies and verify PostgreSQL, Redis, and LocalStack health.
- [ ] Build App Server and Realtime Server from the current branch.
- [ ] Run baseline mode once with coordination disabled and save sanitized metrics/events to `document-two-node-before.json`.
- [ ] Run fixed mode three independent rounds with fresh documents. Require all of the following across 4,500 edits:
  - five sessions connected across two instance IDs;
  - live convergence 1,500/1,500 per round;
  - normal-operation checkpoint 409 count 0;
  - persisted unique edit IDs 1,500/1,500 per round;
  - fresh reconnect unique edit IDs 1,500/1,500 per round;
  - graceful task termination followed by survivor reconnect and marker preservation.
- [ ] Save aggregate sanitized metrics/events to `document-two-node-after.json`.
- [ ] Run baseline mode again to prove the feature flag still provides a controlled A/B reproduction and rollback path.
- [ ] Commit only stable test/evidence artifacts with `test(realtime): verify two-node document convergence`.

## Task 7: Generate screenshot-ready before/after evidence

**Files:**

- Create: `docs/superpowers/evidence/document-two-node-report.html`
- Create: `docs/superpowers/evidence/before-redis-conflict.png`
- Create: `docs/superpowers/evidence/after-redis-sync.png`

- [ ] Generate a local HTML report strictly from the captured JSON files. Show test parameters, instance IDs, checkpoint outcomes, conflict count, convergence, persistence, and graceful handoff.
- [ ] Redact/omit all AWS identifiers, URLs containing credentials, tokens, user identity, and document content.
- [ ] Render and inspect the report in the browser.
- [ ] Capture the “before” panel showing two task IDs and at least one real HTTP 409 event.
- [ ] Capture the “after” panel showing two task IDs, 4,500 edits, normal 409 count 0, persistence 100%, and graceful handoff pass.
- [ ] Visually verify that every number is traceable to the stored JSON evidence and that no secret or account identifier appears.
- [ ] Commit the report and screenshots with `docs: add two-node document scaling evidence`.

## Task 8: Final local verification and review

**Files:**

- Review all changed files in the branch.

- [ ] Run `npm run format:check`, `npm run lint`, and `npm test` in `apps/realtime-server`.
- [ ] Run the existing `npm run test:document-concurrency:e2e` single-node suite.
- [ ] Run the two-node baseline once and fixed mode three times from a clean service restart.
- [ ] Run Terraform format/validate checks.
- [ ] Inspect `git diff --check` and `git status --short`; distinguish the user's pre-existing dirty files from this feature's changes.
- [ ] Review failure handling: missing Redis fails closed only when enabled, shutdown cannot hang indefinitely, and second 409 remains visible rather than silently swallowed.
- [ ] Record exact command outputs and aggregate counts in the evidence report; do not state “0 conflicts” unless all runs completed successfully.

## Task 9: Controlled dev ECS rollout and real two-task validation

**Files:**

- No additional source changes unless the deployment exposes a defect.
- Update evidence JSON/HTML/screenshots only with sanitized production-like results.

- [ ] Build and publish the reviewed Realtime Server image through the repository's existing deployment workflow.
- [ ] Deploy the new task definition with desired count still at 1.
- [ ] Verify one healthy target, `/health` reports Redis sync `ready`, and CloudWatch contains `document_redis_sync_ready` without credentials.
- [ ] Save the current task definition revision and rollback command.
- [ ] Change `pilo-dev-realtime-server` desired count from 1 to 2 and wait for two healthy targets.
- [ ] Verify requests/connections reach two distinct instance IDs using health/log correlation.
- [ ] Run the same five-session, 1,500-edit scenario against the dev ALB, then reconnect all clients and compare exact edit IDs.
- [ ] Verify CloudWatch shows zero `document_checkpoint_conflict` events during the test window and successful checkpoints from the coordinated room owner.
- [ ] Gracefully stop one task or perform a controlled scale-in, reconnect affected clients to the survivor, append a marker, and verify it persists.
- [ ] Capture sanitized CloudWatch/ECS evidence without account IDs, ARNs, tokens, emails, or document contents.
- [ ] If any acceptance check fails, first restore desired count to 1, then roll back the task definition or disable the feature flag; do not leave two uncoordinated tasks running.
- [ ] Only after all checks pass, describe the outcome as: “Realtime Server를 2대로 확장하고 Redis 기반 문서 저장 조율을 적용해 5개 동시 세션·4,500회 편집에서 정상 저장 충돌 0건과 재접속 보존율 100%를 검증.”
