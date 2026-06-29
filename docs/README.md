# PILO Docs Entry Point

이 문서는 PILO에서 구현을 시작할 때 읽어야 하는 문서의 단일 입구다.
AI agent, 사람 개발자, 리뷰어는 이 문서의 권위 순서를 먼저 따른다.

## Authoritative Docs

아래 문서가 현재 `dev`를 다시 살리기 위한 기준 문서다.

| 순서 | 문서 | 목적 |
| --- | --- | --- |
| 1 | `docs/mvp-scope-v1.md` | MVP 포함/제외 기능 범위 |
| 2 | `docs/domain-boundary-v1.md` | 도메인 소유권, source of truth, cross-domain 규칙 |
| 3 | `docs/api-contract-v1.md` | MVP 목표 API 계약 |
| 4 | `docs/db/mvp-db-schema-v1.md` | MVP 목표 DB 구조 |
| 5 | `docs/collaboration-v1.md` | 5인 + AI agent 협업 규칙 |
| 6 | `docs/convention.md` | Issue, branch, PR, commit 규칙 |
| 7 | `docs/mvp-contract-v0.md` | 현재 `dev` 구현 상태표 |

## Supporting Docs

아래 문서는 구현 보조 문서다. 기준 문서와 충돌하면 기준 문서를 우선한다.

| 문서 | 역할 |
| --- | --- |
| `agent.md` | agent 작업 시작 요약 |
| `docs/agents/README.md` | 담당자별 구현 지시서 입구 |
| `docs/contracts/README.md` | 기존 상세 contract 색인 |
| `docs/contracts/*` | 상세 API/DTO/read model 계약. v1 기준으로 rebaseline 필요 |
| `docs/contracts/schemas/pilo-public-contracts.schema.json` | machine-readable public contract |
| `docs/contracts/fixtures` | provider 미구현 시 mock fixture |
| `docs/design.md` | UI 디자인 기준 |
| `docs/dev-local-setup.md` | local 개발 환경 |
| `docs/infra/ci.md` | CI 기준 |

## Archive Policy

`docs/archive/**` 아래 문서는 역사적 참고 자료다.

규칙:

1. `docs/archive/**` 문서로 기능을 구현하지 않는다.
2. AI agent 작업 지시에는 archive 문서를 기준 문서로 넣지 않는다.
3. archive 문서를 근거로 새 기능을 만들려면 먼저 `spec` 또는 `contract` PR로 기준 문서에 반영한다.
4. archive 문서는 삭제하지 않고 결정 배경을 확인할 때만 읽는다.

## Current Decisions

- RAG/embedding은 MVP에서 제외한다.
- Basic Voice/STT는 MVP에 포함한다. 범위는 회의 transcript 생성과 ReportDraft 입력까지다.
- 호출어, 음성 명령, 고급 화자 분리, 장기 raw audio 보관은 제외한다.
- Canvas는 release blocker가 아니다. 구현하더라도 Basic Canvas만 대상으로 한다.
- GitHub Issue/PR 상태는 Task 상태를 자동 변경하지 않는다.
- Agent는 제안하고, 사용자가 승인하고, owner domain API가 실행한다.

## Agent Start Checklist

각 agent는 구현 시작 전에 아래 문서를 순서대로 읽는다.

1. `agent.md`
2. `docs/README.md`
3. `docs/mvp-scope-v1.md`
4. `docs/domain-boundary-v1.md`
5. `docs/api-contract-v1.md`
6. `docs/db/mvp-db-schema-v1.md`
7. `docs/collaboration-v1.md`
8. `docs/agents/README.md`
9. 본인 도메인 brief
10. 본인 도메인이 제공하거나 소비하는 `docs/contracts/*`

작업 지시에는 수정 가능 파일과 금지 파일을 먼저 적는다.
`docs/archive/**`는 구현 기준이 아니다.

## Rebaseline Status

기능 PR을 재개하기 전 기준선 상태는 아래와 같다.

| 순서 | 항목 | 상태 |
| --- | --- | --- |
| 1 | 문서 source of truth 정리 | done |
| 2 | DB baseline / `task_drafts` rebaseline | done |
| 3 | Prisma mapped table이 SQL에 존재하는지 검증 | done |
| 4 | `docs/contracts/*`를 v1 기준으로 상세 정렬 | next |
| 5 | route inventory drift test 추가 | next |

기능 구현 PR은 최신 기준 문서를 읽은 뒤 domain 단위로 시작한다.
