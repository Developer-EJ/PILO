# Emergency Contract Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a main-based `emergency-juh` branch that freezes DB ownership, API contracts, and domain folder boundaries before feature work continues.

**Architecture:** Keep `docs/db/pilo_erd_schema.sql` as the DB source of truth, add an OpenAPI contract for cross-domain HTTP paths, and scaffold domain-owned folders so later branches add behavior inside existing modules instead of editing shared bootstrap files. The app-server imports every domain module once, preventing each developer from fighting over `AppModule`.

**Tech Stack:** NestJS app-server, Next.js frontend, NestJS realtime-server, FastAPI ai-worker, Node test runner, SQL schema docs, JSON Schema, OpenAPI YAML.

---

### Task 1: Lock Contract Surface With Tests

**Files:**

- Modify: `tests/docs.test.mjs`
- Modify: `apps/app-server/tests/smoke.test.mjs`

- [ ] **Step 1: Add failing docs tests**

Add assertions that `docs/contracts/openapi/pilo-public-api.yaml` exists, is linked from contract docs, and declares owner-owned paths for auth/workspace/canvas/task/github/progress/meeting/review/agent/planning/common-system.

- [ ] **Step 2: Add failing app-server structure tests**

Add assertions that every app-server domain has a module, controller, service, repository, DTO contract, and public contract file, and that `src/app.module.ts` imports every domain module.

- [ ] **Step 3: Run tests to verify RED**

Run: `node --test tests/*.test.mjs`

Expected: FAIL because the OpenAPI contract file is missing.

Run: `npm test` from `apps/app-server`

Expected: FAIL because the domain scaffold files are missing.

### Task 2: Add API Contract Documentation

**Files:**

- Create: `docs/contracts/openapi/README.md`
- Create: `docs/contracts/openapi/pilo-public-api.yaml`
- Modify: `docs/contracts/README.md`
- Modify: `docs/contracts/contract-change-rules.md`

- [ ] **Step 1: Create OpenAPI contract files**

Define the first public API path owner for every domain. All request/response schema names must match `docs/contracts/schemas/pilo-public-contracts.schema.json`.

- [ ] **Step 2: Link OpenAPI from contract rules**

Add the OpenAPI file to the documented reading order and machine-readable contract change flow.

- [ ] **Step 3: Run docs tests to verify GREEN**

Run: `node --test tests/*.test.mjs`

Expected: PASS.

### Task 3: Add App-Server Domain Skeleton

**Files:**

- Create: `apps/app-server/src/common/contracts/public-contracts.ts`
- Create: `apps/app-server/src/common/database/database.module.ts`
- Create: `apps/app-server/src/common/database/database.port.ts`
- Create domain scaffold files under `apps/app-server/src/modules/{auth,workspace,canvas,task,github,progress,meeting,report,review,agent,planning,common-system}/`
- Modify: `apps/app-server/src/app.module.ts`

- [ ] **Step 1: Create common public DTO types**

Export TypeScript interfaces that mirror the public read models used in the JSON Schema.

- [ ] **Step 2: Create domain module skeletons**

Each domain owns one module/controller/service/repository/DTO/public contract set. Service methods stay unimplemented by throwing `NotImplementedError`, so workers only fill their domain implementation.

- [ ] **Step 3: Import all modules in AppModule**

Register every domain module once in `AppModule` so later branches do not edit app bootstrap only to attach a domain.

- [ ] **Step 4: Run app-server tests and build**

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

### Task 4: Add Frontend, Realtime, and AI Worker Folder Anchors

**Files:**

- Create: `apps/frontend/lib/types/public-contracts.ts`
- Create: `apps/frontend/lib/api/pilo-api-contract.ts`
- Create README anchors under `apps/frontend/components/*` and `apps/frontend/hooks/*`
- Create realtime namespace anchors under `apps/realtime-server/src/{meeting,voice,canvas,common}`
- Create AI workflow anchors under `apps/ai-worker/app/{common,workflows}`

- [ ] **Step 1: Add frontend shared type/API contract anchors**

Keep generated or hand-written app-facing types in `lib/types`, and API client signatures in `lib/api`.

- [ ] **Step 2: Add realtime and AI workflow anchors**

Reserve documented folders without implementing runtime behavior.

- [ ] **Step 3: Run app smoke tests**

Run `npm test` in frontend and realtime-server, and `pytest` in ai-worker.

Expected: PASS.

### Task 5: Final Verification

**Files:**

- Inspect all changed files with `git diff --stat`

- [ ] **Step 1: Run all available tests**

Run docs tests, app-server tests/build, frontend tests, realtime tests, and ai-worker tests.

- [ ] **Step 2: Confirm branch status**

Run: `git status --short --branch`

Expected: clean except intended changes on `emergency-juh`.
