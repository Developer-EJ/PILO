# PILO Collaboration Rules v1

이 문서는 5명이 각자 AI agent를 사용해 PILO를 구현할 때 따라야 하는 협업 규칙이다.
목표는 충돌을 완전히 없애는 것이 아니라, 충돌이 생겨도 작은 PR 안에서 발견되고
되돌릴 수 있게 만드는 것이다.

## 적용 범위

이 문서는 앞으로 새로 만드는 모든 작업 브랜치와 PR에 적용한다.
기존 문서는 참고 자료로 남기되, 협업 운영 판단은 이 문서를 우선한다.

함께 읽어야 하는 문서:

- `docs/README.md` - 현재 문서 source of truth와 archive 정책.
- `docs/convention.md` - Issue, branch, PR, commit 기본 운영 규칙.
- `docs/mvp-scope-v1.md` - MVP 포함/제외 범위.
- `docs/domain-boundary-v1.md` - 도메인 소유권과 cross-domain 규칙.
- `docs/api-contract-v1.md` - MVP API 계약.
- `docs/db/mvp-db-schema-v1.md` - MVP 목표 DB 구조.
- `docs/agents/README.md` - 각 agent가 시작 전에 읽어야 하는 brief index.
- `docs/mvp-contract-v0.md` - 현재 dev 구현 상태표.
- `docs/contracts/*` - 도메인별 API/DTO/read model 계약.
- `docs/db/*` - DB schema 후보와 migration.

## Agent Start Checklist

각 agent는 기능 구현 전에 아래를 지킨다.

1. 최신 `dev`에서 자기 도메인 브랜치를 만든다.
2. `agent.md`, `docs/README.md`, 이 문서, `docs/agents/README.md`, 본인 도메인 brief를 읽는다.
3. 작업 지시에 수정 가능 파일과 금지 파일을 명시한다.
4. 본인 도메인 밖 데이터는 owner API, public read model, Agent action, fixture/mock 중 하나로만 접근한다.
5. 문서에 없는 API, DTO field, DB field를 임의로 만들지 않는다.
6. contract 변경과 구현 변경을 한 PR에 섞지 않는다.
7. DB 구조 변경은 `docs/db/mvp-db-schema-v1.md`, Prisma, SQL, migration, test를 함께 맞춘다.

## Relation To convention.md

`docs/convention.md`는 Issue, branch, PR, commit의 기본 운영 규칙이다.
이 문서는 AI agent와 5개 도메인 병렬 구현에서 생기는 추가 제약을 정의한다.

역할 분리:

| 항목 | 기준 문서 |
|---|---|
| Issue 크기, Issue 계층, branch naming, commit message | `docs/convention.md` |
| PR type, 도메인 소유권, shared file 제한, stacked PR 제한, contract/DB 변경 절차 | `docs/collaboration-v1.md` |

두 문서가 겹쳐 보이면 아래 원칙을 따른다.

1. branch 이름과 commit message는 `docs/convention.md`를 따른다.
2. PR type은 branch type이나 commit type이 아니라 PR 분류 label/title/body에 쓰는 운영 분류다.
3. 여러 Issue를 한 PR에 묶는 것은 같은 PR type, 같은 owner domain, 같은 contract boundary 안에서만 허용한다.
4. shared file, contract, DB, cross-domain 변경은 이 문서의 더 엄격한 규칙을 따른다.
5. PR 크기는 `docs/convention.md`의 약 400줄 기준을 목표로 하고, 600줄을 넘으면 분리를 검토한다.

## 절대 원칙

1. 한 PR은 한 종류의 변경만 한다.
2. Contract 변경과 구현 변경은 같은 PR에 넣지 않는다.
3. 다른 도메인의 DB table, service, repository를 직접 수정하지 않는다.
4. 다른 도메인 데이터 변경은 owner API 또는 Agent Action으로만 요청한다.
5. 다른 도메인 데이터 조회는 owner read model 또는 public API만 사용한다.
6. provider가 아직 없으면 fixture/mock으로 멈추고 integration issue를 남긴다.
7. shared 파일 변경은 기능 구현 PR과 분리한다.
8. AI agent 작업 지시에는 수정 가능 파일과 금지 파일을 반드시 포함한다.
9. `dev`는 매일 통합 가능한 상태를 유지한다.
10. 문서에 없는 API, DB field, DTO field를 agent가 임의로 만들지 않는다.

## PR Type

모든 PR은 아래 타입 중 하나여야 한다.

| Type | 목적 | 허용 변경 | 금지 |
|---|---|---|---|
| `spec` | 제품 기능 명세 확정 | `docs/mvp-scope-v1.md`, `docs/domain-boundary-v1.md`, `docs/api-contract-v1.md`, decision docs | 코드, DB, API 구현 |
| `contract` | API/DTO/read model/DB 계약 변경 | `docs/contracts/*`, schema, DB contract docs | 실제 기능 구현 |
| `domain` | 한 도메인의 구현 | owner 도메인 코드, owner 테스트 | shared contract 변경, 다른 도메인 repository 수정 |
| `integration` | 이미 merge된 도메인 간 연결 | API client, adapter, integration test | 새 contract 정의, 새 DB 구조 |
| `infra` | CI, 배포, local env | `.github`, `infra`, Docker, env example | 제품 기능 구현 |
| `docs` | 설명/운영 문서 보강 | README, guide, troubleshooting | contract 의미 변경 |

PR 제목은 아래 형식을 사용한다.

```text
[type][owner/domain] 작업 요약
```

예:

```text
[contract][task] TaskDraft current API 계약 정리
[domain][meeting] Meeting action item mock repository 구현
[integration][meeting-task] Action item to task draft 연결
```

주의:

- 여기서 `[type]`은 PR type이다. `feat`, `fix`, `docs` 같은 commit/branch type을 대체하지 않는다.
- branch 이름은 `docs/convention.md`의 `<type>/<이슈번호>-<짧은-설명>` 형식을 유지한다.
- 예: branch는 `feat/42-meeting-action-item`, PR 제목은 `[domain][meeting] Meeting action item 구현`이 될 수 있다.

## Domain Ownership

| Owner | Domain | Primary Responsibility |
|---|---|---|
| 동현 | Auth / Workspace / Canvas | 로그인, workspace, member context, dashboard shell, canvas board |
| 주형 | Task / GitHub / Progress | task, milestone, GitHub App connection, issue/PR source, progress |
| 진호 | Meeting / Voice / Report | meeting, voice session, transcript, text notes, report, action item |
| 은재 | Review / PR Analysis | review room, PR analysis, changed files, review graph, checklist |
| 세인 | Agent Runtime / Planning | agent registry/run/action/trace, planning draft, workflow coordination |

## Owned Paths

아래 경로는 기본 소유권이다. 실제 파일 구조가 아직 섞여 있어도 새 작업은 이 기준으로
정리한다.

| Owner | App Server | Frontend | Realtime | AI Worker | Contract |
|---|---|---|---|---|---|
| 동현 | `apps/app-server/src/modules/auth`, `workspace`, `canvas` | `apps/frontend/app/login`, `workspaces`, `components/auth`, `components/workspace`, `lib/auth`, `lib/workspace` | `apps/realtime-server/src/canvas*` | 없음 | `auth.md`, `workspace.md`, `canvas.md` |
| 주형 | `apps/app-server/src/modules/juhyung` | `task`, `github`, `progress` 관련 새 경로 | 없음 | task adapter만 | `task.md`, `github.md`, `progress.md` |
| 진호 | `apps/app-server/src/modules/meeting`, `voice` | `meeting`, `voice`, `report` 관련 새 경로 | `apps/realtime-server/src/voice` | `workflows/meeting` | `meeting.md`, `voice.md` |
| 은재 | `apps/app-server/src/modules/review` | `apps/frontend/app/(workspace)/reviews`, review 관련 새 경로 | 없음 | `workflows/review` | `review.md` |
| 세인 | `apps/app-server/src/modules/agent`, planning 관련 새 경로 | `agent`, `planning` 관련 새 경로 | 공통 event 필요 시 | `runtime`, `workflows/agent`, `workflows/planning` | `agent-actions.md`, `planning.md` |

## Shared Files

아래 파일은 기능 구현 PR에서 직접 수정하지 않는다.
수정이 필요하면 `spec`, `contract`, `infra` PR로 분리한다.

```text
docs/contracts/*
docs/contracts/schemas/*
docs/contracts/fixtures/*
docs/db/*
apps/app-server/prisma/schema.prisma
apps/*/package.json
apps/*/package-lock.json
apps/ai-worker/requirements*.txt
.github/*
docker-compose.dev.yml
infra/*
```

예외:

- 테스트 fixture의 작은 오타 수정은 `contract` PR로 처리한다.
- owner 도메인 DB 변경은 `contract` PR에서 먼저 합의한 뒤 `domain` PR에서 구현한다.
- dependency 추가는 `infra` 또는 해당 `domain` PR에서 가능하지만 PR 본문에 이유를 적는다.

## Stacked PR Policy

Stacked PR은 기본적으로 제한한다.

허용:

- 같은 owner, 같은 domain 안에서 최대 2단 stack.
- 하위 PR이 `dev`에 merge되어도 상위 PR이 독립적으로 rebase 가능한 경우.

금지:

- 다른 사람 도메인 위에 stack.
- `contract` PR 위에 구현 PR stack.
- `docs/db`, Prisma, schema 변경 PR 위에 domain PR stack.
- shared 파일을 수정하는 PR 위에 기능 PR stack.
- integration PR을 domain PR 위에 stack.

권장 흐름:

1. `spec` 또는 `contract` PR을 먼저 단독 merge한다.
2. 각 domain PR은 최신 `dev`에서 시작한다.
3. domain PR들이 merge된 뒤 별도 `integration` PR을 만든다.

## Contract Change Flow

Contract 변경은 반드시 구현보다 먼저 한다.

1. 필요한 API/DTO/read model/DB field를 확인한다.
2. `contract` PR을 만든다.
3. 영향을 받는 owner를 reviewer로 지정한다.
4. `Implemented`, `Mock/In-memory`, `Deferred`, `Breaking` 상태를 명시한다.
5. contract PR이 `dev`에 merge된 뒤 구현 PR을 시작한다.

Contract PR에는 아래 항목이 있어야 한다.

```md
## Contract Change
- 변경 contract:
- 변경 내용:
- Status: Implemented / Mock/In-memory / Deferred

## Impact
- Owner:
- Consumers:
- Breaking: Yes/No

## Migration
- 기존 field/API 유지 여부:
- deprecated 기간:
- 후속 PR:

## Validation
- schema test:
- fixture test:
- affected domain test:
```

## DB Change Flow

DB 변경은 가장 위험한 shared 변경이다.

규칙:

1. DB 변경은 `contract` PR에서 먼저 합의한다.
2. `docs/db/pilo_erd_schema.sql`은 target SQL baseline/local bootstrap인지,
   `schema.prisma`는 current runtime DB-backed subset인지 PR에 명시한다.
3. MVP v0 기간에는 Prisma-backed table만 현재 app-server DB-backed runtime
   table로 간주한다.
4. mock/in-memory 도메인의 SQL table은 target SQL baseline 후보이며 구현
   완료로 보지 않는다.
5. 다른 owner table에 FK를 추가하려면 양쪽 owner approval이 필요하다.
6. 다형 참조는 DB FK 대신 service validation과 contract test로 보호한다.

DB PR 본문에는 아래 항목이 있어야 한다.

```md
## DB Change
- Tables added:
- Tables changed:
- Prisma changed: Yes/No
- SQL changed: Yes/No
- Migration added: Yes/No

## Owner Approval
- Table owner:
- Affected domains:

## Runtime Impact
- Existing local DB reset needed: Yes/No
- Backfill needed: Yes/No
```

## Mock And Fixture Policy

Mock은 허용하지만 실제 구현처럼 보이면 안 된다.

허용:

- provider domain이 아직 없을 때 UI와 domain logic을 진행하기 위한 fixture.
- integration 전까지 같은 함수 시그니처를 가진 mock adapter.
- local demo 전용 deterministic mock.

금지:

- mock 데이터를 실제 DB table 대체물로 문서화.
- consumer 도메인이 owner 몰래 임시 table을 생성.
- mock response에 contract에 없는 field 추가.
- mock mode만 통과하는 테스트를 실제 구현 완료로 표시.

Mock 사용 PR에는 반드시 후속 issue를 남긴다.

```md
## Mock / Stub
- Mock used: Yes
- Reason:
- Real provider owner:
- Follow-up integration issue:
```

## Cross-Domain Access

다른 도메인과 연결할 때는 아래 방식만 허용한다.

| 목적 | 허용 방식 | 금지 |
|---|---|---|
| 데이터 조회 | owner read model, public API, fixture | owner DB 직접 join |
| 데이터 생성/수정 | owner write API, Agent Action | owner repository/service import |
| long-running 작업 | Agent Run / workflow contract | consumer가 임의 status table 생성 |
| UI 표시 | public summary DTO | domain entity type 직접 공유 |
| 미구현 provider | fixture/mock adapter | 임시 DB schema 추가 |

예:

- Meeting이 Task를 만들고 싶으면 Task API 또는 TaskCreateDraft action을 사용한다.
- Review가 PR 정보를 보려면 GitHub `PullRequestSummary`를 사용한다.
- Canvas는 Task 원본 데이터를 저장하지 않고 `entityType`, `entityId`, `displayTitle`만 저장한다.

## AI Agent Work Order Template

모든 agent 작업 지시는 아래 형식을 사용한다.
이 템플릿 없이 agent에게 구현을 맡기지 않는다.

```md
## Task

## PR Type
spec / contract / domain / integration / infra / docs

## Owner Domain

## Goal

## Allowed Files
-

## Forbidden Files
-

## Contract Used
-

## DB Policy
- DB change: Yes/No
- Allowed tables:
- Forbidden tables:

## Mock Policy
- Mock allowed: Yes/No
- Fixture path:
- Follow-up integration issue:

## Integration Boundary
- Provider owner:
- Consumer owner:
- API/read model/action:

## Done Criteria
-

## Do Not
- Do not edit other domain repositories/services.
- Do not add fields outside the contract.
- Do not change shared files without a separate PR.
```

## Review Checklist

Reviewer는 아래 순서로 본다.

1. PR type이 맞는가?
2. owner domain 밖 파일을 수정했는가?
3. shared 파일을 기능 구현 PR에서 수정했는가?
4. contract 변경이 구현과 섞였는가?
5. mock 사용 여부와 후속 issue가 명시됐는가?
6. 다른 도메인 DB/service/repository를 직접 접근했는가?
7. public DTO가 contract schema와 맞는가?
8. DB 변경이 Prisma/SQL/migration 기준과 맞는가?
9. 테스트가 owner boundary를 검증하는가?
10. integration이 필요한데 domain PR에 끼워 넣었는가?

## Merge Rules

기본 흐름:

1. `spec`
2. `contract`
3. `domain`
4. `integration`
5. `infra` 또는 release hardening

운영 규칙:

- PR은 작게 만든다. `docs/convention.md`의 약 400줄 기준을 목표로 하고, 600줄을 넘으면 분리를 검토한다.
- 하루 이상 오래 열린 PR은 rebase보다 쪼개기를 먼저 검토한다.
- `dev` merge 전에는 해당 앱 test를 최소 1개 이상 실행한다.
- conflict 해결만 하는 PR은 만들지 않는다. conflict가 잦으면 PR scope가 잘못된 것이다.
- integration PR은 관련 domain PR이 모두 merge된 뒤 만든다.

## Required Validation

PR type별 최소 검증:

| Type | Required validation |
|---|---|
| `spec` | 문서 링크와 open decision 확인 |
| `contract` | schema/fixture/docs test, affected owner review |
| `domain` | owner app test, boundary test |
| `integration` | consumer/provider 통합 test 또는 smoke test |
| `infra` | affected CI/local command 검증 |
| `docs` | 링크/경로 확인 |

현재 권장 명령:

```powershell
node --test tests\docs.test.mjs
npm.cmd test
```

앱별로 실행할 때:

```powershell
cd apps/app-server
npm.cmd test

cd apps/frontend
npm.cmd test

cd apps/realtime-server
npm.cmd test
```

## Stop Conditions

아래 상황이면 구현을 멈추고 먼저 질문 또는 contract PR을 만든다.

- 필요한 field가 contract에 없다.
- 두 owner가 같은 데이터를 write하려 한다.
- 다른 owner table에 FK가 필요하다.
- API prefix가 애매하다.
- mock으로는 UX나 workflow 검증이 불가능하다.
- agent가 shared 파일을 수정하자고 제안한다.
- DB schema와 Prisma schema가 다르다.
- 기존 contract의 Current/Deferred 상태가 실제 controller와 다르다.

## CI Enforcement Plan

이 문서는 사람이 읽는 규칙이고, 아래 항목은 CI로 강제해야 한다.

1. PR type label 또는 제목 prefix 검사.
2. shared 파일 변경 시 PR type 검사.
3. controller route inventory와 contract Current API 비교.
4. Prisma table 목록과 DB SQL table 목록 drift 보고.
5. contract fixture가 public schema와 일치하는지 검사.
6. mock/in-memory module이 contract에서 Implemented DB로 표시되지 않았는지 검사.
7. package dependency 변경 시 PR 본문에 이유가 있는지 검사.

## First Rebaseline Tasks

기능 PR 재개 전 우선 처리한다.

1. `docs/mvp-scope-v1.md`, `docs/domain-boundary-v1.md`, `docs/api-contract-v1.md` 기준으로 상세 contract 정렬.
2. API prefix를 `/api` 기준으로 통일할 migration 계획 작성.
3. DB baseline과 Prisma mapped table 검증 유지.
4. Workspace membership source 통일 방향 결정.
5. `task.md`, `review.md`, `agent-actions.md`, `planning.md`의 Current/Deferred 상태 정리.
6. route/DB drift를 잡는 테스트 추가.
