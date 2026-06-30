# 동현 Agent Brief: Auth / Workspace / Dashboard / Canvas

## Mission

동현은 사용자가 PILO에 들어와 로그인하고, workspace를 고르고, dashboard와 canvas에서 프로젝트 전체를 이해하는 경험을 만든다. Canvas는 업무 데이터를 소유하지 않고, 다른 도메인의 read model을 카드로 배치한다.

## Must Read

- `docs/contracts/auth.md`
- `docs/contracts/workspace.md`
- `docs/contracts/canvas.md`
- `docs/design.md`
- `docs/db/db-schema-by-owner.md`
- `docs/contracts/schemas/pilo-public-contracts.schema.json`

## Owned Data

- `users`
- `oauth_accounts`
- `auth_sessions`
- `workspaces`
- `workspace_members`
- `workspace_invites`
- `dashboard_preferences`
- `canvas_boards`
- `canvas_shapes`
- `canvas_connections`
- `canvas_node_positions`
- `canvas_view_settings`
- `canvas_filter_settings`

## Suggested Paths

- Frontend: `apps/frontend/app/(auth)`, `apps/frontend/app/(workspace)`, `apps/frontend/components/workspace`, `apps/frontend/components/canvas`
- App Server: `apps/app-server/src/modules/auth`, `apps/app-server/src/modules/workspace`, `apps/app-server/src/modules/canvas`
- Public adapters: `apps/app-server/src/modules/workspace/public`, `apps/app-server/src/modules/canvas/public`

## Implement First

1. Google/GitHub OAuth login entry and callback flow.
2. Current user API returning `CurrentUser`.
3. Workspace list, create, detail, member list.
4. Dashboard shell with fixture-backed cards.
5. Canvas board list and board detail with shapes/connections.
6. Canvas pan, zoom, drag, resize, filter state save.

## Current Runtime APIs

- `GET /api/auth/providers` returns configured auth providers.
- `GET /api/auth/me` returns `CurrentUser`.
- `POST /api/auth/logout` revokes current session.
- `GET /api/workspaces` returns `WorkspaceSummary[]`.
- `POST /api/workspaces` creates workspace.
- `GET /api/workspaces/:workspaceId` returns workspace detail.
- `PATCH /api/workspaces/:workspaceId` updates workspace metadata.
- `GET /api/workspaces/:workspaceId/members` returns `WorkspaceMemberSummary[]`.
- `POST /api/workspaces/:workspaceId/invites` creates invite.
- `POST /api/workspace-invites/:inviteId/accept` accepts invite.
- `GET /api/workspaces/:workspaceId/dashboard-preferences` returns dashboard preferences.
- `PUT /api/workspaces/:workspaceId/dashboard-preferences` saves dashboard preferences.
- `GET /api/workspaces/:workspaceId/dashboard` aggregates read models.
- Canvas shape/connection APIs are defined in `docs/contracts/canvas.md`.
- WorkspaceAccessPublicService is the current internal public boundary used by
  Agent/Task/GitHub flows to validate workspace membership. Agent currently
  passes x-member-id through this temporary boundary. Temporary mock member
  boundary. Not production auth.

## Deferred APIs

- None for the listed Auth/Workspace/Canvas runtime surface.
- Workspace metadata update and dashboard preferences are Current Runtime APIs,
  but they are Excluded from MVP success criteria and primary CTA scope.
- Freeform drawing/sticky/code/frame tldraw state is local-only UI state until a
  follow-up Canvas contract/runtime PR defines server persistence.
- Any new Dashboard source aggregation route or Canvas source-writing route must
  land through a contract PR first.

## Consumes From Others

- 주형: `TaskSummary`, `GithubIssueSummary`, `PullRequestSummary`, `ProgressSummary`.
- 진호: `MeetingReportSummary`, meeting decisions and risks.
- 은재: `PRAnalysisSummary`, review risk summary.
- 세인: `AgentAction`, recommended next actions, project plan summary.
- DevOps/Common: `SharedFileRef`.

## Mock Rule

다른 도메인이 없으면 `docs/contracts/fixtures/workspace-dashboard.fixture.json`으로 Dashboard와 Canvas를 먼저 구현한다. Canvas shape에는 `entityType`, `entityId`, `displayTitle`만 연결하고 원본 데이터 수정 UI는 넣지 않는다.

## Do Not Touch

- Task 생성, 상태 변경, GitHub Issue 생성.
- Meeting report 생성.
- PR diff 분석, review node 생성.
- Agent workflow 실행.
- GitHub repository 연결 권한.

## Done

- 로그인하지 않은 사용자는 보호된 화면에 접근할 수 없다.
- Workspace를 만들고 현재 workspace 상태를 유지한다.
- Dashboard가 모든 외부 read model 부재 상황에서도 깨지지 않는다.
- Canvas 위치, zoom, filter가 저장된다.
- Canvas가 다른 owner의 원본 데이터를 직접 변경하지 않는다.
