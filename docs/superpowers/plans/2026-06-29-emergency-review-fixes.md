# Emergency Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the review gaps that still allow five independent agents to diverge on API routes, public DTOs, action payloads, and shared runtime wiring.

**Architecture:** Keep owner folders as the editable implementation surface, and make shared contracts strict enough that workers cannot invent incompatible shapes. OpenAPI remains the HTTP source of truth, backed by JSON Schema definitions and mirrored by TypeScript/Python consumer types.

**Tech Stack:** Node test runner, NestJS scaffold, OpenAPI 3.1 YAML, JSON Schema 2020-12, TypeScript, Python dataclasses.

---

### Task 1: Contract Guardrail Tests

**Files:**
- Modify: `tests/docs.test.mjs`
- Modify: `apps/app-server/tests/smoke.test.mjs`

- [ ] **Step 1: Write failing tests for strict machine-readable contracts**

Add tests that reject bare OpenAPI `type: object` response items, require the missing DTO definitions, require route names to match the canonical OpenAPI paths, and require consumer mirrors to keep agent action enums narrow.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/docs.test.mjs apps/app-server/tests/smoke.test.mjs`

Expected: FAIL because GitHub/planning responses are still bare objects, several schema definitions are missing, frontend/worker action types are still strings, and controller handlers do not exist.

### Task 2: Canonical Public API and Schema

**Files:**
- Modify: `docs/contracts/openapi/pilo-public-api.yaml`
- Modify: `docs/contracts/schemas/pilo-public-contracts.schema.json`
- Modify: `docs/contracts/task.md`
- Modify: `docs/contracts/canvas.md`
- Modify: `docs/agents/*.md`

- [ ] **Step 1: Replace all bare OpenAPI response objects with `$ref`s**

Use `GithubRepositorySummary` and `ProjectPlanDraftSummary` for the affected response arrays.

- [ ] **Step 2: Add missing schema definitions**

Add `GithubRepositorySummary`, `ProjectPlanDraftSummary`, `MeetingActionItem`, `ReviewNodeSummary`, canvas board/request models, and concrete agent action payload definitions. Make `AgentAction.payload` discriminate by `type` using `oneOf`.

- [ ] **Step 3: Reconcile route names**

Make docs and briefs use these canonical paths: `/workspaces/{workspaceId}/canvas/boards`, `/workspaces/{workspaceId}/tasks/summary`, `/workspaces/{workspaceId}/tasks/drafts`, `/workspaces/{workspaceId}/meetings/reports/summary`, `/workspaces/{workspaceId}/review/pr-analyses/summary`, `/workspaces/{workspaceId}/agent/actions`, and `/workspaces/{workspaceId}/planning/drafts`.

### Task 3: Fill Function-Only Scaffolds

**Files:**
- Modify: `apps/app-server/src/modules/*/*.controller.ts`
- Modify: `apps/app-server/src/modules/*/*.service.ts`
- Modify: `apps/app-server/src/common/contracts/public-contracts.ts`
- Modify: `apps/frontend/lib/api/pilo-api-contract.ts`
- Modify: `apps/frontend/lib/types/public-contracts.ts`
- Modify: `apps/ai-worker/app/common/schemas/public_contracts.py`

- [ ] **Step 1: Add controller handler stubs for every OpenAPI operation**

Each handler delegates to its service and keeps route decorators inside the owning module.

- [ ] **Step 2: Add strict consumer mirrors**

Frontend and AI worker mirrors must use the same agent action type/source/status unions as the app-server contract.

### Task 4: Shared Runtime Bottleneck Reduction

**Files:**
- Modify: `apps/realtime-server/src/app.module.ts`
- Create: `apps/realtime-server/src/canvas/canvas.module.ts`
- Create: `apps/realtime-server/src/canvas/canvas.gateway.ts`
- Create: `apps/realtime-server/src/meeting/meeting.module.ts`
- Create: `apps/realtime-server/src/meeting/meeting.gateway.ts`
- Create: `apps/realtime-server/src/voice/voice.module.ts`
- Create: `apps/realtime-server/src/voice/voice.gateway.ts`
- Create: `apps/ai-worker/app/runtime/*`

- [ ] **Step 1: Register domain realtime modules once**

Future websocket handlers should land in owner folders instead of the shared root gateway.

- [ ] **Step 2: Add AI worker runtime anchors**

Create registry/router/runner skeletons so future agent runtime work does not concentrate in `main.py`.

### Task 5: Verification and Git Visibility

**Files:**
- All changed files in the `emergency-juh` worktree

- [ ] **Step 1: Run focused verification**

Run: `node --test tests/docs.test.mjs apps/app-server/tests/smoke.test.mjs`

- [ ] **Step 2: Run package verification**

Run relevant package tests/build/lint where changed files live.

- [ ] **Step 3: Stage all branch contents**

Run: `git add -A` from `C:\Users\kjh\Desktop\PILO\.worktrees\emergency-juh` so scaffold files stop being invisible to other checkouts.
