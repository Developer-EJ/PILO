# Workspace Contract

## Owner

동현

## Scope

Workspace는 PILO의 프로젝트 작업 공간과 멤버 권한을 담당한다.

## Owned Tables

- `workspaces`
- `workspace_members`
- `workspace_invites`
- `dashboard_preferences`

## Current Runtime APIs

The Workspace controller is exposed through the app-server global prefix as `/api/workspaces...`.

| Method | Path | 목적 | Consumer |
|---|---|---|---|
| `GET` | `/api/workspaces` | 내가 속한 workspace 목록 | 전체 |
| `POST` | `/api/workspaces` | workspace 생성 | 동현 |
| `GET` | `/api/workspaces/:workspaceId` | workspace 상세 | 전체 |
| `PATCH` | `/api/workspaces/:workspaceId` | workspace 이름/설명/상태 수정 | 동현 |
| `GET` | `/api/workspaces/:workspaceId/members` | 멤버 목록 | 전체 |
| `POST` | `/api/workspaces/:workspaceId/invites` | 팀원 초대 생성 | 동현 |
| `POST` | `/api/workspace-invites/:inviteId/accept` | 초대 수락 | 동현 |
| `GET` | `/api/workspaces/:workspaceId/dashboard-preferences` | 내 dashboard 설정 조회 | 동현 |
| `PUT` | `/api/workspaces/:workspaceId/dashboard-preferences` | 내 dashboard 설정 저장 | 동현 |
| `GET` | `/api/workspaces/:workspaceId/dashboard` | Dashboard aggregate read model 조회 | 동현 |

## Read Models

### WorkspaceSummary

```json
{
  "id": "uuid",
  "name": "PILO",
  "description": "AI powered collaboration tool",
  "type": "side_project",
  "status": "active",
  "myRole": "owner",
  "memberCount": 5,
  "createdAt": "2026-06-27T12:00:00Z"
}
```

### WorkspaceMemberSummary

```json
{
  "memberId": "uuid",
  "userId": "uuid",
  "name": "홍길동",
  "email": "user@example.com",
  "avatarUrl": "https://example.com/avatar.png",
  "role": "member",
  "displayName": "Backend",
  "joinedAt": "2026-06-27T12:00:00Z"
}
```

### DashboardPreferences

```json
{
  "workspaceId": "uuid",
  "memberId": "uuid",
  "layout": {
    "density": "compact",
    "columns": ["tasks", "prs"]
  },
  "hiddenSections": ["agent"],
  "updatedAt": "2026-06-27T12:00:00Z"
}
```

- `layout`은 Dashboard UI가 소유하는 JSON object다. 서버는 내부 구조를 해석하지 않고 그대로 저장한다.
- `hiddenSections`는 string 배열이다. 서버는 값을 trim하고 중복을 제거한다.
- 설정은 `(workspaceId, memberId)` 단위로 저장하며, 다른 멤버의 설정과 섞이면 안 된다.

### CurrentWorkspaceMember

`currentMember`는 Workspace consumer에게 제공하는 멤버 기준 컨텍스트다.
OAuth provider, session token, Workspace에서 필요하지 않은 원본 profile 필드는
노출하지 않는다.

```json
{
  "workspaceId": "uuid",
  "memberId": "uuid",
  "userId": "uuid",
  "role": "owner",
  "displayName": "Workspace / Canvas"
}
```

필수 필드:

- `workspaceId`
- `memberId`
- `userId`
- `role`
- `displayName`

### WorkspaceDashboardReadModel

`GET /api/workspaces/:workspaceId/dashboard`는 dashboard aggregate read model을 반환한다.
Workspace는 aggregate 경계, member context, dashboard preferences만 소유한다.
Task, GitHub, PR, meeting, agent, canvas 항목은 각 owner domain이 제공하는
read model을 사용하거나 mock/local 개발 중 shared fixture를 사용한다.

```json
{
  "workspace": {
    "id": "uuid",
    "name": "PILO MVP",
    "description": "AI-powered project collaboration workspace",
    "type": "side_project",
    "status": "active",
    "myRole": "owner",
    "memberCount": 5,
    "createdAt": "2026-06-20T00:00:00.000Z"
  },
  "currentMember": {
    "workspaceId": "uuid",
    "memberId": "uuid",
    "userId": "uuid",
    "role": "owner",
    "displayName": "Workspace / Canvas"
  },
  "preferences": {
    "workspaceId": "uuid",
    "memberId": "uuid",
    "layout": {},
    "hiddenSections": [],
    "updatedAt": null
  },
  "members": [],
  "tasks": [],
  "progress": null,
  "githubIssues": [],
  "pullRequests": [],
  "meetingReports": [],
  "prAnalyses": [],
  "agentActions": [],
  "canvasEntities": [],
  "source": "fixture",
  "generatedAt": "2026-06-28T00:00:00.000Z"
}
```

필수 필드:

- `workspace`
- `currentMember`
- `preferences`
- `members`
- `tasks`
- `progress`
- `githubIssues`
- `pullRequests`
- `meetingReports`
- `prAnalyses`
- `agentActions`
- `canvasEntities`
- `source`
- `generatedAt`

Contract test 기준:

- `WorkspaceSummary`, `WorkspaceMemberSummary`, `DashboardPreferences`,
  `CurrentWorkspaceMember`, `WorkspaceDashboardReadModel`의 필수 필드는
  `docs/contracts/schemas/pilo-public-contracts.schema.json`과 일치해야 한다.
- `docs/contracts/fixtures/workspace-dashboard.fixture.json`의 dashboard section
  field name은 `WorkspaceDashboardReadModel`에서 사용하는 이름과 일치해야 한다.
- `source`는 server-side read model provenance이며 현재 값은 `fixture` 또는
  `empty`다.
- Consumer는 dashboard 렌더링만을 위해 다른 owner domain의 임시 DB table이나
  임시 API field를 만들지 않는다.

Dashboard `source` values are `fixture`, `empty`, or `mixed`.
`mixed` means at least one owner-domain section, such as Tasks or Progress, was
overlaid from runtime APIs while the remaining sections may still use the
fixture/empty fallback.

## Events

- `workspace.created`
- `workspace.updated`
- `workspace.member_invited`
- `workspace.member_joined`
- `workspace.member_role_changed`

## Boundaries

- 동현은 workspace와 membership 원본을 소유한다.
- 주형/진호/은재/세인은 `workspace_member_id`를 참조할 수 있지만, 멤버 role을 직접 수정하지 않는다.
- 다른 도메인은 권한 확인이 필요할 때 Workspace API 또는 auth guard의 `currentMember`를 사용한다.

## Mock Rule

Workspace API가 없을 때 consumer는 `workspaceId`, `memberId`, `role`이 포함된 fixture만 사용한다. 임시 `members` table을 만들지 않는다.

