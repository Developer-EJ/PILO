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

## Provided APIs

| Method | Path | 목적 | Consumer |
|---|---|---|---|
| `GET` | `/workspaces` | 내가 속한 workspace 목록 | 전체 |
| `POST` | `/workspaces` | workspace 생성 | 동현 |
| `GET` | `/workspaces/:workspaceId` | workspace 상세 | 전체 |
| `PATCH` | `/workspaces/:workspaceId` | workspace 이름/설명/상태 수정 | 동현 |
| `GET` | `/workspaces/:workspaceId/members` | 멤버 목록 | 전체 |
| `POST` | `/workspaces/:workspaceId/invites` | 팀원 초대 생성 | 동현 |
| `POST` | `/workspace-invites/:inviteId/accept` | 초대 수락 | 동현 |
| `GET` | `/workspaces/:workspaceId/dashboard-preferences` | 내 dashboard 설정 조회 | 동현 |
| `PUT` | `/workspaces/:workspaceId/dashboard-preferences` | 내 dashboard 설정 저장 | 동현 |

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

