# PILO MVP Contract v0

이 문서는 현재 `temp-dev`를 살리기 위한 임시 단일 기준선이다.
기존 상세 문서를 대체하지 않는다. 다만 기능 PR을 이어가기 전에는 이 문서의
`Implemented`, `Mock/In-memory`, `Deferred`, `Rebaseline Required` 상태를 먼저 따른다.

## 목적

- 현재 `temp-dev`에서 실제로 호출해도 되는 API를 고정한다.
- mock, fixture, in-memory 구현을 실제 구현과 구분한다.
- DB 기준선이 갈라진 부분을 숨기지 않고 재정렬 대상으로 표시한다.
- 새 기능 PR 전에 API prefix, DB schema, public contract의 기준을 하나로 만든다.

## 상태 정의

| 상태 | 의미 |
|---|---|
| `Implemented` | 현재 app-server/realtime/frontend 코드에 실제 runtime 경로 또는 기능이 있다. |
| `Mock/In-memory` | 기능은 동작하지만 프로세스 메모리, fixture, local mock에 의존한다. 데이터 영속성을 기대하면 안 된다. |
| `Deferred` | 문서/schema/fixture 후보는 있으나 현재 runtime에서 호출하면 안 된다. |
| `Rebaseline Required` | 문서, DB, Prisma, controller 중 둘 이상이 충돌한다. 기능 PR 전에 정리해야 한다. |

## 임시 원칙

1. 이 문서에 없는 API는 MVP v0에서 public API로 보지 않는다.
2. `Implemented`라도 `Mock/In-memory`가 붙은 기능은 영속 데이터로 간주하지 않는다.
3. public DTO/schema가 있어도 해당 controller가 없으면 `Deferred`다.
4. DB-backed 구현은 Prisma schema와 실제 초기화 SQL이 모두 맞아야 한다.
5. 기능 PR은 API prefix와 DB rebaseline이 끝난 뒤 재개한다.

## 현재 Runtime Prefix

app-server uses the global `api` prefix. Every public HTTP route exposed by current runtime controllers is `/api/...`.

| 도메인 | 현재 prefix 상태 |
|---|---|
| Auth | `/api/auth/...` |
| Workspace | `/api/workspaces/...`, `/api/workspace-invites/...` |
| Canvas | `/api/workspaces/:workspaceId/canvas-boards`, `/api/canvas-boards/...`, `/api/canvas-shapes/...` |
| Task / Milestone | `/api/workspaces/:workspaceId/...`, `/api/tasks/...`, `/api/milestones/...` |
| GitHub Connection | `/api/workspaces/:workspaceId/github/connections`, `/api/github/app/callback` |
| Meeting / Voice | `/api/...` |
| Review | `/api/pull-requests/...`, `/api/code-review-rooms/...`, `/api/pull-request-analyses/...`, `/api/review-nodes/...` |
| Agent Run / Planning / Common | 대부분 controller 없음. health만 `/api/health` |

`/api` prefix unification is complete in this rebaseline.

## DB 기준선 상태

현재 DB 기준은 target SQL baseline과 current runtime DB-backed subset을 분리해서 읽는다.

| 기준 | 상태 |
|---|---|
| `docs/db/pilo_erd_schema.sql` | 70개 table을 정의하는 target SQL baseline/local bootstrap |
| `apps/app-server/prisma/schema.prisma` | 19개 table만 모델링 |
| Prisma에만 있음 | 없음. Prisma `@@map` table은 SQL baseline에 존재해야 함 |
| SQL에만 있음 | Auth session/OAuth, Workspace invite/preferences, Canvas, Meeting, Voice, Review, Agent run/action/trace, Planning, Common 다수 |

판정:

- `pilo_erd_schema.sql`은 broad target SQL baseline과 local bootstrap inventory로 취급한다.
- Current runtime DB-backed 기능은 `schema.prisma`와 실제 SQL을 맞춘 뒤에만 완료로 본다.
- SQL에 table이 있어도 Prisma/repository/controller가 없으면 Current Runtime API나 DB-backed 완료로 보지 않는다.
- `task_drafts`는 SQL bootstrap과 rebaseline migration에 추가되어 `Resolved`다.

## 도메인별 상태

### Auth

상태: `Implemented`, `Mock/In-memory`

현재 API:

- `GET /api/auth/providers`
- `GET /api/auth/google/start`
- `GET /api/auth/google/callback`
- `GET /api/auth/github/start`
- `GET /api/auth/github/callback`
- `GET /api/auth/me`
- `POST /api/auth/logout`

주의:

- Auth repository는 현재 in-memory 저장소다.
- SQL에는 `users`, `oauth_accounts`, `auth_sessions`가 있지만 Prisma 모델에는 없다.
- 다른 도메인이 영속 Auth user/session을 전제로 구현하면 안 된다.

### Workspace / Dashboard

상태: `Implemented`, `Mock/In-memory`, `Rebaseline Required`

현재 API:

- `GET /api/workspaces`
- `POST /api/workspaces`
- `GET /api/workspaces/:workspaceId`
- `PATCH /api/workspaces/:workspaceId`
- `GET /api/workspaces/:workspaceId/members`
- `POST /api/workspaces/:workspaceId/invites`
- `POST /api/workspace-invites/:inviteId/accept`
- `GET /api/workspaces/:workspaceId/dashboard-preferences`
- `PUT /api/workspaces/:workspaceId/dashboard-preferences`
- `GET /api/workspaces/:workspaceId/dashboard`

주의:

- Workspace repository는 현재 in-memory 저장소다.
- Task/GitHub 쪽 workspace member access는 Prisma DB를 본다.
- Dashboard aggregate는 다른 도메인의 실제 DB join이 아니라 fixture/read model fallback을 사용한다.
- Workspace와 Task가 보는 membership source를 통일해야 한다.
- `PATCH /api/workspaces/:workspaceId`와 dashboard preferences는 Current Runtime
  API지만 `docs/mvp-scope-v1.md` 기준 MVP success criteria와 primary CTA에서는
  제외된다.

### Canvas

상태: `Implemented`, `Mock/In-memory`

현재 API:

- `GET /api/workspaces/:workspaceId/canvas-boards`
- `POST /api/workspaces/:workspaceId/canvas-boards`
- `GET /api/canvas-boards/:boardId`
- `POST /api/canvas-boards/:boardId/shapes`
- `PATCH /api/canvas-shapes/:shapeId`
- `DELETE /api/canvas-shapes/:shapeId`
- `PUT /api/canvas-shapes/:shapeId/position`
- `POST /api/canvas-boards/:boardId/connections`
- `DELETE /api/canvas-connections/:connectionId`
- `PUT /api/canvas-boards/:boardId/view-settings`
- `PUT /api/canvas-boards/:boardId/filter-settings`

주의:

- Canvas repository는 현재 in-memory 저장소다.
- SQL에는 Canvas table이 있지만 Prisma 모델에는 없다.
- Canvas는 업무 원본 데이터를 소유하지 않고 shape/position/setting만 소유한다.

### Task / Milestone

상태: `Implemented`

현재 API:

- `GET /api/workspaces/:workspaceId/milestones`
- `POST /api/workspaces/:workspaceId/milestones`
- `PATCH /api/milestones/:milestoneId`
- `GET /api/workspaces/:workspaceId/tasks`
- `POST /api/workspaces/:workspaceId/tasks`
- `GET /api/tasks/:taskId`
- `PATCH /api/tasks/:taskId`
- `PATCH /api/tasks/:taskId/status`
- `DELETE /api/tasks/:taskId`
- `POST /api/tasks/:taskId/dependencies`
- `DELETE /api/tasks/:taskId/dependencies/:dependsOnTaskId`
- `POST /api/tasks/:taskId/comments`
- `GET /api/tasks/:taskId/comments`
- `GET /api/tasks/:taskId/activity-logs`
- `POST /api/tasks/:taskId/checklist-items`
- `PATCH /api/tasks/:taskId/checklist-items/:itemId`
- `DELETE /api/tasks/:taskId/checklist-items/:itemId`
- `POST /api/workspaces/:workspaceId/task-drafts`
- `POST /api/task-drafts/:draftId/approve`
- `POST /api/task-drafts/:draftId/reject`

주의:

- Task/Milestone/GitHub 일부는 Prisma DB를 사용한다.
- `task_drafts` table은 SQL bootstrap과 rebaseline migration에 포함되어 있다.

### GitHub Connection / Repository / Issue / PR

상태: `Implemented` for connection, `Deferred` for sync/read models, `Rebaseline Required` for Owner-only mutation enforcement

현재 API:

- `POST /api/workspaces/:workspaceId/github/connections`
- `GET /api/workspaces/:workspaceId/github/connections`
- `DELETE /api/workspaces/:workspaceId/github/connections/:connectionId`
- `GET /api/github/app/callback`

Deferred:

- repository sync
- repository list
- issue list/create/link
- pull request list/link
- pull request changed files
- webhook

주의:

- GitHub login OAuth는 Auth 소유다.
- GitHub App repository integration은 주형 GitHub 소유다.
- Current connection runtime은 Workspace membership guard를 사용한다. MVP Target은
  repository connect/change/revoke를 Owner-only로 둔다. freeze 전 주형 runtime
  authorization PR이 필요하다.

### Progress

상태: `Deferred`

현재 Progress HTTP controller는 없다.

Deferred:

- `GET /api/workspaces/:workspaceId/progress/summary`
- `GET /api/workspaces/:workspaceId/progress/history`
- `POST /api/workspaces/:workspaceId/progress/snapshots`

주의:

- `progress_snapshots`는 SQL과 Prisma에 있지만 현재 public runtime API는 없다.
- Dashboard는 Progress fixture/read model fallback만 사용한다.

### Meeting / Report

상태: `Implemented`, `Mock/In-memory`

현재 API:

- `GET /api/meetings`
- `POST /api/workspaces/:workspaceId/meetings`
- `GET /api/workspaces/:workspaceId/meetings`
- `GET /api/meetings/:meetingId`
- `PATCH /api/meetings/:meetingId/status`
- `POST /api/meetings/:meetingId/participants`
- `GET /api/meetings/:meetingId/participants`
- `PATCH /api/meetings/:meetingId/participants/:participantId/leave`
- `POST /api/meetings/:meetingId/agendas`
- `GET /api/meetings/:meetingId/agendas`
- `PATCH /api/meetings/:meetingId/agendas/:agendaId/status`
- `PATCH /api/meetings/:meetingId/agendas/:agendaId/sort-order`
- `POST /api/meetings/:meetingId/memos`
- `GET /api/meetings/:meetingId/memos`
- `POST /api/meetings/:meetingId/transcript-segments`
- `GET /api/meetings/:meetingId/transcript-segments`
- `POST /api/meetings/:meetingId/report-generation`
- `POST /api/meetings/:meetingId/report`
- `GET /api/meeting-reports/:reportId`
- `GET /api/workspaces/:workspaceId/meeting-reports/recent`
- `GET /api/workspaces/:workspaceId/meeting-reports/canvas-entity-refs`
- `POST /api/meeting-reports/:reportId/decisions`
- `GET /api/meeting-reports/:reportId/decisions`
- `POST /api/meeting-reports/:reportId/risks`
- `GET /api/meeting-reports/:reportId/risks`
- `POST /api/meeting-reports/:reportId/next-agendas`
- `GET /api/meeting-reports/:reportId/next-agendas`
- `POST /api/meeting-reports/:reportId/action-items`
- `GET /api/meeting-reports/:reportId/action-items`
- `PATCH /api/meeting-action-items/:actionItemId/approve`
- `PATCH /api/meeting-action-items/:actionItemId/reject`
- `PATCH /api/meeting-action-items/:actionItemId/convert`
- `POST /api/meeting-action-items/:actionItemId/task-draft`

주의:

- Meeting repository는 현재 mock/in-memory다.
- Meeting의 Task draft adapter는 mock이다.
- SQL에는 Meeting/Report table이 있지만 Prisma 모델에는 없다.

### Voice

상태: `Implemented`, `Mock/In-memory`

현재 API:

- `GET /api/voice`
- `POST /api/workspaces/:workspaceId/meetings/:meetingId/voice-room`
- `GET /api/workspaces/:workspaceId/meetings/:meetingId/voice-room`
- `GET /api/voice-rooms/:voiceRoomId`
- `PATCH /api/voice-rooms/:voiceRoomId/status`
- `POST /api/voice-rooms/:voiceRoomId/sessions`
- `GET /api/voice-rooms/:voiceRoomId/sessions`
- `PATCH /api/voice-sessions/:voiceSessionId/leave`
- `PATCH /api/voice-sessions/:voiceSessionId/recording-status`

주의:

- Voice repository/provider는 mock이다.
- LiveKit/provider integration은 MVP v0에서 deferred다.

### Review / PR Analysis

상태: `Implemented`, `Mock/In-memory`

현재 API:

- `POST /api/pull-requests/:pullRequestId/review-room`
- `GET /api/code-review-rooms/:roomId`
- `POST /api/pull-requests/:pullRequestId/analysis`
- `GET /api/pull-requests/:pullRequestId/analysis`
- `GET /api/pull-requests/:pullRequestId/analysis-summary`
- `GET /api/pull-request-analyses/:analysisId/graph`
- `GET /api/pull-request-analyses/:analysisId/canvas`
- `PATCH /api/review-nodes/:nodeId/state`
- `POST /api/code-review-rooms/:roomId/comments`
- `POST /api/pull-request-analyses/:analysisId/checklist-items`

주의:

- Review repositories는 in-memory다.
- PR source는 현재 fixture/mock 경계다.
- SQL에는 Review table이 있지만 Prisma 모델에는 없다.
- Review contract의 current/deferred API 표는 현재 controller 기준으로 정리되어 있다.

### Agent Runtime

상태: `Implemented` for registry only, `Deferred` for run/action runtime

Implemented:

- Agent registry service/repository
- `agents`, `agent_workflows` Prisma models

Deferred:

- `POST /api/workspaces/:workspaceId/agent-runs`
- `GET /api/agent-runs/:runId`
- agent run/action confirmation runtime
- SQS result persistence into `agent_runs`, `agent_actions`, `agent_traces`

주의:

- SQL에는 Agent run/action/trace table이 있지만 Prisma 모델에는 없다.
- Agent contract는 현재 실제 runtime보다 앞서 있다.

### Planning

상태: `Deferred`

현재 Planning HTTP controller/module은 없다.

Deferred:

- `POST /api/workspaces/:workspaceId/project-plan-drafts`
- `GET /api/project-plan-drafts/:draftId`
- `POST /api/project-plan-drafts/:draftId/recommend-tech-stack`
- `POST /api/project-plan-drafts/:draftId/breakdown-features`
- `POST /api/project-plan-drafts/:draftId/assign-roles`
- `POST /api/project-plan-drafts/:draftId/approve`

주의:

- SQL에는 Planning table이 있지만 Prisma 모델과 runtime 구현은 없다.

### Common System

상태: `Implemented` for health only, `Deferred` for common data APIs

현재 API:

- `GET /api/health`

Deferred:

- notifications
- shared files
- audit logs

주의:

- Minimal Notification은 `docs/mvp-scope-v1.md`의 제품 Target이지만 current
  runtime에는 controller가 없다. owner가 DevOps/공통 Backend gatekeeper인 상태라
  release blocker로 보지 않으며, MVP Must로 다시 올리려면 owner 지정과 Common
  runtime PR이 먼저 필요하다.

## Rebaseline 작업 목록

### R1. API Prefix 결정

결정해야 할 것:

- 전체 public API를 `/api/...`로 통일할지
- Auth/Workspace/Canvas/GitHub/Review의 기존 non-API path를 유지할지

추천:

- MVP v0에서는 app-server HTTP API를 `/api/...`로 통일한다.
- 단, OAuth provider callback URL 변경 영향이 있으므로 Auth callback은 별도 migration note를 둔다.

### R2. DB Source of Truth 결정

결정해야 할 것:

- Prisma schema를 전체 SQL 기준으로 승격할지
- in-memory/mock 도메인을 언제 DB-backed로 바꿀지
- SQL 전체 70개 table을 Prisma에 모두 반영할지

추천:

- MVP v0에서는 "Prisma-backed table만 실제 영속 table"로 선언한다.
- mock/in-memory 도메인의 SQL table은 target schema 후보로 남기고 구현 완료로 보지 않는다.
- Prisma `@@map` table이 SQL baseline에 존재하는지 테스트로 고정한다.

### R3. Workspace Membership 통일

결정해야 할 것:

- Auth/Workspace를 DB-backed로 먼저 바꿀지
- Task/GitHub가 사용할 seed membership을 별도 MVP fixture DB로 고정할지

추천:

- Task/GitHub가 이미 Prisma DB를 쓰므로 Workspace member read boundary도 DB 기준으로 맞춘다.
- Workspace HTTP repository를 in-memory에서 Prisma-backed로 옮기는 작업을 우선순위 높게 둔다.

### R4. Contract 문서 정리

상태: `Done` for current/deferred 분리.

정리된 항목:

- `docs/contracts/task.md`: Task draft API를 Current Runtime APIs로 이동
- `docs/contracts/review.md`: 실제 구현된 graph/comment/checklist API를 Current Runtime APIs로 이동
- `docs/contracts/agent-actions.md`: Agent Run API를 Deferred APIs로 명확히 표시
- `docs/contracts/planning.md`: HTTP API 전체를 Deferred APIs로 표시
- `docs/contracts/README.md`: Current Runtime / Deferred / MVP Target 용어 정의

### R5. CI/테스트 보강

추가해야 할 검증:

- controller route inventory와 contract current API 일치 테스트
- Prisma table 목록과 DB init SQL table 목록 차이 테스트
- mock/in-memory 도메인이 public contract에서 implemented DB로 오인되지 않게 하는 테스트
- frontend default mode가 mock일 때와 api일 때의 호출 경로 테스트

## 기능 PR 재개 조건

아래 조건을 만족할 때까지 새 기능 PR은 보류한다.

- API prefix 결정 완료
- DB baseline과 Prisma mapped table 검증 통과
- Workspace membership source 통일 방향 결정
- CI가 route/DB drift를 최소 1개 이상 잡도록 보강
