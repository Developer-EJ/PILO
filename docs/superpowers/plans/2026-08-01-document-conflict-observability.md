# Document Snapshot Conflict Observability Implementation Plan

> **For agentic workers:** Execute each task in order and keep the red-green-refactor evidence. Do not deploy or publish until local verification and review pass.

**Goal:** Capture an exact, privacy-bounded document snapshot `409 Conflict` in App Server CloudWatch logs and make App Server ECS deployments retain the required `awslogs` configuration.

**Architecture:** A small injectable observer builds the only permitted conflict event shape and emits it immediately before the existing stale-version exception. The App Server deployment workflow registers a new immutable-digest task definition derived from the running revision, replaces only the App Server container's image and log configuration, verifies the result, deploys a one-task canary, and restores the prior immutable image/count on failure.

**Tech Stack:** NestJS 11, TypeScript 6, Node.js test scripts, GitHub Actions, AWS CLI, `jq`, ECS/Fargate, CloudWatch Logs.

## Constraints

- Preserve the existing transaction, version guard, error message, and HTTP 409 response.
- Log only `event`, `status`, `documentId`, `expectedVersion`, and `currentVersion`.
- Never log workspace/user identity, title, content, Yjs state, attachments, request headers, credentials, or tokens.
- Logging failures must not affect the request result.
- Keep Terraform ownership of the CloudWatch log group; the workflow verifies but does not create it.
- Use an immutable registry digest for both forward deployment and rollback.
- Do not touch unrelated dirty E2E or migration files.
- Do not publish the branch or deploy AWS changes without explicit user authorization at that stage.

---

## Task 1: Lock the App Server conflict event contract

**Files:**

- Create: `apps/app-server/src/modules/drive/document-conflict-observer.ts`
- Create: `apps/app-server/scripts/drive/document-conflict-observer.test.mjs`
- Modify: `apps/app-server/package.json`

- [ ] Write a focused test that imports the built observer and asserts the event contains exactly five keys with numeric version/status values.
- [ ] Add privacy sentinels for user ID, workspace ID, title, content, Yjs state, attachment, authorization header, and token; assert none appears in serialized output.
- [ ] Assert one `warn` call is made with one-line JSON.
- [ ] Assert an exception thrown by the logger is swallowed.
- [ ] Add the test to the App Server `test` command.
- [ ] Run the focused test after build and confirm it fails because the observer module does not exist.
- [ ] Implement the typed event builder and injectable observer with a default Nest `Logger`.
- [ ] Re-run the focused test and confirm it passes.
- [ ] Commit Task 1 files with `test(app): define document conflict log contract`.

## Task 2: Emit the event at the stale-version guard

**Files:**

- Modify: `apps/app-server/src/modules/drive/document.service.ts`
- Modify: `apps/app-server/src/modules/drive/drive.module.ts`
- Modify: `apps/app-server/scripts/drive/document-editor.test.mjs`

- [ ] Extend the existing stale snapshot test with a fake observer.
- [ ] Assert a matching version emits no conflict event.
- [ ] Assert a mismatch emits exactly one event containing the document ID and the stale/current versions.
- [ ] Assert the rejected request still returns the existing 409 and error text.
- [ ] Add a throwing fake observer and assert the request still returns the same 409.
- [ ] Run the document editor test and confirm the new observer assertions fail.
- [ ] Inject the observer into `DocumentService` as an optional trailing dependency with a safe default so manual constructors remain compatible.
- [ ] Register the observer in `DriveModule`.
- [ ] Call the observer immediately before the existing conflict exception.
- [ ] Re-run the focused test, then App Server format, lint, build, and full test suite.
- [ ] Commit Task 2 files with `feat(app): log stale document snapshot conflicts`.

## Task 3: Lock the App Server deployment contract

**Files:**

- Create: `infra/tests/app-server-deployment.test.mjs`
- Modify: `.github/workflows/deploy-app-server.yml`
- Modify if required by the test runner: the relevant root/infra package script

- [ ] Write a source-contract test for serialized deploys with `cancel-in-progress: false`.
- [ ] Assert the workflow captures the previous task definition, desired count, and running App Server image digest.
- [ ] Assert it verifies the expected CloudWatch log group and never calls `create-log-group`.
- [ ] Assert the generated task definition uses the build output digest and contains `awslogs` group, region, and stream prefix for the App Server container.
- [ ] Assert it registers and verifies a new task definition before updating the ECS service.
- [ ] Assert it deploys one task first, waits for stability, verifies the target count/health, and then restores the intended count.
- [ ] Assert the failure path reconstructs a rollback definition with the prior digest and restores the prior desired count.
- [ ] Run the focused test and confirm it fails against the current force-deployment-only workflow.
- [ ] Commit the failing contract test with `test(ci): define app server logged deployment contract`.

## Task 4: Implement rollback-safe logged App Server deployment

**Files:**

- Modify: `.github/workflows/deploy-app-server.yml`
- Modify: `infra/tests/app-server-deployment.test.mjs` only if implementation reveals a contract-test defect

- [ ] Add workflow concurrency serialization.
- [ ] Capture the service JSON, prior task definition, desired count, running task, and container image digest before building.
- [ ] Resolve the log group from optional `ECS_APP_SERVER_LOG_GROUP`, falling back to `/ecs/<service-prefix>/app-server`, and verify it exists.
- [ ] Build/push the App Server image and use `steps.build.outputs.digest`.
- [ ] Produce a sanitized next task definition by replacing only the App Server container image and log configuration and deleting ECS response-only fields.
- [ ] Verify the generated JSON with `jq`, register it, and deploy it at desired count one.
- [ ] Wait for service stability and confirm one running task uses the registered definition.
- [ ] Restore the pre-deploy desired count after the canary passes.
- [ ] On any failure after canary deployment begins, register a rollback definition using the prior immutable digest and restore the previous desired count.
- [ ] Keep optional GitHub sync worker deployment separate and only start it after the App Server canary succeeds; do not reuse the App Server task definition for it.
- [ ] Re-run the deployment contract test.
- [ ] Run `actionlint` and `shellcheck` against embedded workflow scripts using the established local container technique.
- [ ] Commit Task 4 files with `fix(ci): preserve app server cloudwatch logging`.

## Task 5: Full verification and review

**Files:** Review all files introduced by Tasks 1-4.

- [ ] Run App Server `npm run format:check`, `npm run lint`, `npm run build`, and `npm test`.
- [ ] Run the infra workflow contract tests.
- [ ] Run `actionlint` and shell checks.
- [ ] Run `git diff --check` and inspect `git status --short`, excluding known unrelated dirty files.
- [ ] Review the event schema for forbidden fields and verify logger failure isolation.
- [ ] Review the workflow for mutable tags, missing rollback state, destructive count changes, task-definition drift, and accidental worker coupling.
- [ ] Obtain an independent code review and address all Important/Critical findings.
- [ ] Commit any review fixes separately.

## Task 6: Controlled dev evidence rollout

**Files:**

- Update: `docs/superpowers/evidence/document-two-node-scaling/aws-baseline.md`
- Create sanitized screenshots under `docs/superpowers/evidence/document-two-node-scaling/` only after inspecting them for account identifiers.

- [ ] Push the reviewed branch only after explicit user authorization.
- [ ] Deploy the App Server workflow and verify one healthy task plus a CloudWatch log stream.
- [ ] Scale the current Redis-disabled Realtime Server revision to two tasks and confirm two healthy targets.
- [ ] Run the controlled five-session edit scenario and capture an exact `document_snapshot_conflict` event in a bounded CloudWatch time window.
- [ ] Keep the environment moving forward; do not restore the old Realtime revision to a one-task steady state.
- [ ] Deploy the coordinated Realtime revision through its one-task canary, verify Redis readiness, and scale it to two tasks.
- [ ] Run three fixed rounds of five sessions and 1,500 edits per round.
- [ ] Confirm zero conflict events in each bounded window, exact convergence, persisted preservation, and reconnect preservation.
- [ ] Sanitize screenshots by masking AWS account identifiers and the raw document UUID before external use.
- [ ] Update the evidence report with the exact measured counts and evidence limitations.
