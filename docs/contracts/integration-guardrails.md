# Integration Guardrails

This document closes integration risks that do not always appear as Git merge conflicts.

## Contract Integration Owner

Central contract files are serialized by a Contract Integration PR, not by ordinary Feature PRs.

Required owner-local evidence:

- OpenAPI changes start in `docs/contracts/openapi/domains/<domain>.paths.yaml`.
- JSON Schema changes start in `docs/contracts/schemas/domains/<domain>.schema.json`.
- DB SQL changes start in `docs/db/domains/<domain>.tables.sql`.
- Prisma changes start in `apps/app-server/prisma/domains/<domain>.prisma`.

The Contract Integration PR owner copies reviewed owner-local fragments into central files and reruns guardrail tests.

## CI Central File Guard

Feature PRs must fail CI if they edit central files directly.

Allowed central-file changes require both:

- PR type checked as `Contract Integration PR`.
- PR body lists the reviewed owner-local fragments or shards being serialized.

The CI script is `scripts/check-central-file-edits.mjs`.

## Runtime Validation

Public boundary payloads must be validated against `docs/contracts/schemas/pilo-public-contracts.schema.json` before being accepted or emitted.

Shared runtime entry points:

- app-server uses `ContractValidationModule`, `ContractValidationInterceptor`, and `ContractBodySchema` / `ContractQuerySchema` / `ContractResponseSchema`.
- app-server validators use Ajv 2020 with `ajv-formats` and `coerceTypes: true`.
- ai-worker uses `app/runtime/contract_validation.py` before consuming jobs, emitting results, or routing agent actions.
- Domain Feature PRs must not add endpoint-local validators for public payloads; add or update public schema names through contract integration first.

Required validation points:

- app-server HTTP request bodies.
- app-server HTTP response DTOs for public read models.
- app-server SQS `AgentJobMessage` enqueue payloads.
- ai-worker SQS `AgentJobMessage` consume payloads.
- ai-worker SQS `AgentResultMessage` emit payloads.
- app-server SQS `AgentResultMessage` consume payloads.
- `AgentAction.payload` before confirmation or execution.

Runtime validation failures use `ApiErrorResponse` for HTTP and `AgentResultError` for queue results.

## Error Format

HTTP failures use `ApiErrorResponse`.

Rules:

- `error.code` uses `ApiErrorCode`.
- Validation failures include `ValidationErrorDetail[]`.
- User-facing text goes in `error.message`.
- Correlation IDs go in `traceId`.
- Do not return raw exception names, secrets, tokens, stack traces, or upstream private messages.

## Pagination

List APIs that can grow beyond a dashboard-sized summary must accept `PaginationQuery` and return `PageInfo` with the item array.

Current paginated public list contracts:

- `GET /workspaces/:workspaceId/github/issues` returns `GithubIssueSummaryPage`.
- `GET /workspaces/:workspaceId/github/pull-requests` returns `PullRequestSummaryPage`.
- `GET /workspaces/:workspaceId/agent/actions` returns `AgentActionPage`.
- `GET /workspaces/:workspaceId/planning/drafts` returns `ProjectPlanDraftSummaryPage`.

Rules:

- Default `limit` is owner-defined but must be at most 100.
- `nextCursor = null` means no next page.
- Sort keys use `PaginationSort`; do not invent endpoint-local sort strings.
- Existing summary endpoints may remain non-paginated only when they are explicitly dashboard summaries.

## Authorization

Every workspace-scoped write or AI execution must resolve a `WorkspacePermissionDecision`.

Shared permission entry point:

- `POST /workspaces/:workspaceId/permissions/resolve`
- Request body: `WorkspacePermissionResolveRequest`
- Response body: `WorkspacePermissionDecision`
- app-server owner-local contract: `AuthPublicContract.resolveWorkspacePermission`

Rules:

- Use `WorkspacePermissionAction` for permission checks.
- Do not accept `actorMemberId` in public HTTP bodies. The app-server must derive the actor from the authenticated current member context and pass it to `AuthPublicContract.resolveWorkspacePermission`.
- `agent.confirm_action` is required before executing a confirmed AI action.
- Owners may add domain-internal checks, but public permission names are added through contract integration.
- Consumers must not infer permission from frontend state alone.

## Migration Order

DB work merges in this order:

1. Domain owner updates `docs/db/domains/<domain>.tables.sql` and `apps/app-server/prisma/domains/<domain>.prisma`.
2. Contract Integration PR serializes shards into `docs/db/pilo_erd_schema.sql` and `apps/app-server/prisma/schema.prisma`.
3. Migration Integration PR creates physical migrations under `apps/app-server/prisma/migrations`.
4. Feature PRs consume the merged migration baseline.

Migration names use `YYYYMMDDHHMM_owner-slug_domain_action`.

## Frontend Assembly

Feature PRs build domain-owned components and hooks only.

Top-level composition files such as `apps/frontend/app/page.tsx` are changed by a Frontend Integration PR after domain components exist.

The Frontend Integration PR may wire:

- dashboard composition
- canvas/dashboard cross-domain panels
- app route layout
- shared loading and error surfaces

It must not add new public DTO fields directly; contract changes still go through Contract Integration PRs.

## Merge Order

Recommended order for five parallel AI-agent workers:

1. Merge the contract baseline.
2. Merge domain Feature PRs that touch only owner-local fill points.
3. Merge Contract Integration PRs for reviewed contract/DB/schema fragments.
4. Merge Migration Integration PRs.
5. Merge Frontend Integration PRs.
6. Merge final smoke/e2e fixes.

If a Feature PR needs a central file, stop and split that work into the right integration PR before review.
