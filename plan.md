# Emergency Integration Plan

## Goal

Broken stacked PRs are consolidated into the current `emergencyjinho` branch with
the smallest practical conflict surface.

The integration must satisfy two constraints:

- The final branch must build, lint, test, and run without integration errors.
- Duplicate database definitions, public contracts, and overlapping service
  boundaries must be minimized.

## Merge Order

1. Merge `feature/auth-flow-wip`.
2. Merge Juhyung branches in stack order:
   - `feat/22-juhyung-task-draft-flow`
   - `feat/23-juhyung-github-connection`
3. Merge Eunjae branches in stack order:
   - `feat/123-review-graph-ui`
   - `feat/124-review-analysis-workflow`
   - `feat/143-agent-result-changed-files`
   - `feat/144-agent-result-graph-node`
   - `feat/145-agent-result-review-artifacts`
4. Merge Sein branches in stack order:
   - `feat/128-agent-workflow-registry`
   - `docs/150-planning-detail-contract`
5. Merge Jinho branch:
   - `feat/254-meeting-report-summary-adapter`

## Conflict Policy

- Prefer the branch-local implementation when it owns a domain feature.
- Preserve already-integrated shared modules when later branches contain older
  copies of the same app wiring.
- Keep public module boundaries explicit; cross-domain callers should use public
  adapter services instead of internal services.
- Keep one source of truth for public contract schemas and fixtures.
- Make database indexes and migration-adjacent changes idempotent when possible.

## Contract And DB Decisions

- Keep the integrated app server module list as the union of active domains:
  Auth, Workspace, Canvas, Juhyung, Meeting, Review, Voice, and Agent.
- Export public workspace access through `WorkspaceAccessPublicService` and keep
  Juhyung task assignment checks behind that public boundary.
- Keep Review result providers together so analysis, changed files, graph nodes,
  artifacts, and result messages share one module contract.
- Merge Sein planning contract additions into the existing public schema instead
  of replacing common shared definitions.
- Keep GitHub connection uniqueness idempotent with
  `CREATE UNIQUE INDEX IF NOT EXISTS`.

## Verification Gate

Run these checks after the full merge:

- `node --test tests/docs.test.mjs`
- `npm --prefix apps/app-server test`
- `npm --prefix apps/app-server run build`
- `npm --prefix apps/app-server run lint`
- `npm --prefix apps/app-server run format:check`
- `npm --prefix apps/frontend test`
- `npm --prefix apps/frontend run build`
- `npm --prefix apps/frontend run lint`
- `npm --prefix apps/frontend run format:check`
- `npm --prefix apps/realtime-server test`
- `npm --prefix apps/realtime-server run build`
- `npm --prefix apps/realtime-server run lint`
- `npm --prefix apps/realtime-server run format:check`
- `PYTHONPATH=apps/ai-worker python3 -m pytest apps/ai-worker/tests/test_review_workflow.py`

## Completed Result

- All planned branches were merged into `emergencyjinho`.
- Contract fixtures and schemas pass the document contract test suite.
- App server, frontend, realtime server, and targeted AI review workflow checks
  pass.
- The final branch is pushed to `origin/emergencyjinho`.
