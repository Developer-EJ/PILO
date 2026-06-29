## Summary

- 

## Owner

- 담당자: 
- 도메인: 
- Issue: Closes #

## PR Type

- [ ] Feature PR - does not directly edit central files.
- [ ] Contract Integration PR - serializes reviewed owner-local fragments/shards into central files.

If central files changed, this must be a Contract Integration PR. Do not merge central-file changes as a normal feature PR.

## Contract Impact

- Public contract 변경: Yes/No
- 변경한 contract 문서:
- 변경한 schema:
- Consumers:
- Breaking change: Yes/No
- Deprecated field / migration plan:

## Central File Restriction

- [ ] This feature PR does not directly edit central files.
- [ ] If central files changed, this PR is a contract integration PR and lists the reviewed owner-local fragments/shards below.
- Owner-local fragments/shards:

Central files include `docs/contracts/openapi/pilo-public-api.yaml`, `docs/contracts/schemas/pilo-public-contracts.schema.json`, `apps/app-server/src/common/contracts/public-contracts.ts`, `apps/frontend/lib/types/public-contracts.ts`, `apps/ai-worker/app/common/schemas/public_contracts.py`, `docs/db/pilo_erd_schema.sql`, `apps/app-server/prisma/schema.prisma`, `apps/app-server/prisma/migrations/**`, `docs/contracts/fixtures/workspace-dashboard.fixture.json`, and `apps/frontend/app/page.tsx`.

## Integration Guardrails

- Contract Integration owner:
- Migration Integration owner:
- Frontend Integration owner:
- Merge order impact: None / Contract Integration / Migration Integration / Frontend Integration

## Runtime Validation

- HTTP request/response validation added or already covered: Yes/No
- SQS `AgentJobMessage` / `AgentResultMessage` validation added or already covered: Yes/No/Not applicable
- `AgentAction.payload` validation added or already covered: Yes/No/Not applicable

## Error / Pagination / Authorization

- HTTP errors use `ApiErrorResponse`: Yes/No/Not applicable
- Growing list APIs use `PaginationQuery` and `PageInfo`: Yes/No/Not applicable
- Workspace writes or AI execution resolve `WorkspacePermissionDecision`: Yes/No/Not applicable

## Cross-Domain Access

- 다른 도메인 DB/service/repository 직접 수정 여부: Yes/No
- 외부 도메인 접근 방식:
  - API:
  - Read model:
  - Event:
  - Agent action:

## Mock / Stub

- mock/stub/fixture 사용: Yes/No
- mock 위치:
- 실제 연동 후속 Issue:

## DB / Migration

- DB 변경: Yes/No
- 변경 테이블:
- Migration 이름:
- Rollback 가능 여부:

Domain shard updated before central migration/schema files: Yes/No/Not applicable

## Validation

- [ ] 관련 contract 문서를 확인했다.
- [ ] 필요한 경우 `docs/contracts/schemas`를 수정했다.
- [ ] Feature PRs changed owner-local fragments/shards instead of central files.
- [ ] Central file edits, if any, are in a Contract Integration PR and list owner-local evidence.
- [ ] Runtime validation, error format, pagination, authorization, migration order, frontend assembly, and merge order were checked against `docs/contracts/integration-guardrails.md`.
- [ ] 자기 도메인 밖 변경 사유를 설명했다.
- [ ] mock 사용 시 후속 Issue를 만들었다.
- [ ] CI를 통과했다.

