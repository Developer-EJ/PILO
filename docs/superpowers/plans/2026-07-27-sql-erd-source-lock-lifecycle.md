# SQLtoERD Source Lock Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SQL source lock을 실제 편집 의도와 미저장 source 작업에 연결하고, source lease 충돌이 canvas autosave를 중단하지 않게 한다.

**Architecture:** Pure state helpers가 lock 유지 조건과 source 저장 오류 분류를 결정한다. React hook은 controller lifecycle을 직렬화하고, panel은 editor focus·dirty/pending/preview 상태를 helper에 전달한다. App Server/API 계약은 변경하지 않는다.

**Tech Stack:** React 19, TypeScript, CodeMirror 6, Node.js assertion regression scripts

## Global Constraints

- Base branch는 `dev`이고 Issue #1785 범위만 수정한다.
- API endpoint/request/response/status와 DB schema를 변경하지 않는다.
- Remote source snapshot과 pending layout operation rebase는 후속 작업으로 남긴다.
- Source lock TTL 30초와 renew 간격 10초는 유지한다.

---

### Task 1: Source lock intent와 직렬화된 lease controller

**Files:**
- Modify: `apps/frontend/src/features/sql-erd/realtime/source-lock-state.ts`
- Modify: `apps/frontend/src/features/sql-erd/realtime/source-lock-controller.ts`
- Modify: `apps/frontend/src/features/sql-erd/realtime/use-sql-erd-source-lock.ts`
- Test: `apps/frontend/scripts/sql-erd-realtime.test.mjs`

**Interfaces:**
- Produces: `shouldHoldSqlErdSourceLock(input): boolean`
- Produces: controller `recover(): Promise<void>`
- Produces: hook result `recover(): Promise<void>`

- [x] **Step 1: Write failing intent and transition tests**

Add literal cases proving panel-open-only is not an input, while editor engagement, dirty draft, pending save, preview, and apply each hold the lock. Add a deferred release client proving a new acquire is not called until the previous release resolves. Add a recover case proving release then acquire ordering.

- [x] **Step 2: Run the regression script and verify failure**

Run: `node scripts/sql-erd-realtime.test.mjs`

Expected: FAIL because `shouldHoldSqlErdSourceLock` and `recover` do not exist and stop/start is not serialized.

- [x] **Step 3: Implement minimal state and controller changes**

Add this input contract:

```ts
export type SqlErdSourceLockIntent = {
  enabled: boolean;
  hasDirtyDraft: boolean;
  hasPendingSave: boolean;
  isEditorEngaged: boolean;
  isMutationApplying: boolean;
  isMutationPreviewOpen: boolean;
};
```

Return `enabled && (isEditorEngaged || hasDirtyDraft || hasPendingSave || isMutationPreviewOpen || isMutationApplying)`. Serialize controller operations with a promise queue and serialize hook cleanup/start across controller instances. Ignore stale controller state callbacks after cleanup.

- [x] **Step 4: Run the regression script and verify pass**

Run: `node scripts/sql-erd-realtime.test.mjs`

Expected: PASS.

- [x] **Step 5: Commit**

```text
fix: Source lock 상태 전이를 편집 의도에 연결 (#1785)
```

### Task 2: Panel integration and source-specific conflict recovery

**Files:**
- Create: `apps/frontend/src/features/sql-erd/utils/source-autosave-error.ts`
- Modify: `apps/frontend/src/features/sql-erd/components/sql-erd-panel.tsx`
- Test: `apps/frontend/scripts/sql-erd-realtime.test.mjs`
- Test: `apps/frontend/scripts/sql-erd/test.mjs`

**Interfaces:**
- Produces: `classifySqlErdSourceAutosaveError({ code, path, status })`
- Consumes: `shouldHoldSqlErdSourceLock` and `sourceLock.recover()` from Task 1.

- [x] **Step 1: Write failing error-boundary tests**

Compile and execute the classifier. Assert `/source-snapshots` + 409 returns `{ kind: "source_conflict" }`, while a session/layout 409 returns `{ kind: "layout_block", reason: "conflict" }`, mismatch returns `write_protocol_mismatch`, and 503 returns `retry`.

- [x] **Step 2: Run targeted scripts and verify failure**

Run: `node scripts/sql-erd-realtime.test.mjs`

Expected: FAIL because the classifier does not exist.

- [x] **Step 3: Connect editor intent and autosave recovery**

Add `onEditIntentChange` to `SqlSourceEditor`, mark intent on pointer/focus, clear it when focus leaves the editor boundary, and focus CodeMirror after the lease becomes editable. Compute hook `active` through `shouldHoldSqlErdSourceLock` rather than `isSourceOpen`.

In the source publish catch block, classify the error before the generic layout block. For `source_conflict`, keep the pending snapshot, set source retry state, call `sourceLock.recover()`, and do not call `setLayoutAutosaveBlockReason`.

- [x] **Step 4: Run targeted scripts and typecheck**

Run: `node scripts/sql-erd-realtime.test.mjs`

Run: `node scripts/sql-erd/test.mjs`

Run: `npm run lint`

Expected: all PASS.

- [x] **Step 5: Commit**

```text
fix: Source 저장 충돌을 canvas autosave와 분리 (#1785)
```

### Task 3: Contract-adjacent documentation and final validation

**Files:**
- Modify: `docs/api/sqltoerd-api.md`
- Modify: `docs/infra/sqltoerd-operations-v1-cutover.md`

**Interfaces:**
- Consumes: the implemented frontend lock lifecycle. No public API contract changes.

- [x] **Step 1: Update lifecycle wording**

Document that opening/navigating Source is read-only and does not acquire a lock, editor intent acquires it, dirty/pending work delays release, and source lease conflict recovery does not pause layout operations.

- [x] **Step 2: Run final focused validation**

Run: `node scripts/sql-erd-realtime.test.mjs`

Run: `node scripts/sql-erd/test.mjs`

Run: `npm run lint`

Expected: all PASS.

- [x] **Step 3: Inspect the diff and commit**

Confirm only Issue #1785 files are present and no API/DB/common-area changes exist.

```text
docs: Source lock 운영 계약을 편집 상태에 맞춤 (#1785)
```
