# Common System Contract

## Owner

Common/System owns shared cross-domain infrastructure APIs and tables.

Owner: DevOps/Common Backend gatekeeper.

Other domains may call Current Runtime APIs listed here, but they must not
change `notifications`, `shared_files`, or `audit_logs` table structure without
a contract update and Common/System owner review.

## Scope

Common/System covers shared notification read state, shared file metadata, and
audit log target contracts.

Dashboard and owner-domain screens may read notification summaries, but the
source business state remains owned by the originating domain.

## Owned Tables

- `notifications`
- `shared_files`
- `audit_logs`

## Current Runtime APIs

Current runtime APIs implemented by Common/System code.

Notification endpoints use an in-memory MVP repository. They validate auth and
workspace membership, and they only mutate notification read state.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | app-server health check |
| `GET` | `/api/workspaces/:workspaceId/notifications` | my notifications in a workspace |
| `PATCH` | `/api/notifications/:notificationId/read` | mark my notification as read |
| `PATCH` | `/api/workspaces/:workspaceId/notifications/read-all` | mark all my workspace notifications as read |

## Deferred APIs

These APIs remain target contracts only. Do not call them from current runtime
screens until this document moves them to Current Runtime APIs.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/workspaces/:workspaceId/shared-files` | create shared file metadata |
| `GET` | `/api/workspaces/:workspaceId/shared-files` | list shared files |
| `POST` | `/api/audit-logs` | record important operation audit log |

## DTOs

### NotificationCreateRequest

Target DTO for future owner-domain notification creation. Current MVP runtime
does not expose a creation endpoint; it only exposes read APIs over the mock
repository.

```json
{
  "userId": "uuid",
  "type": "task_assigned",
  "title": "Task assigned",
  "body": "A workspace task was assigned to you.",
  "linkedEntityType": "task",
  "linkedEntityId": "uuid"
}
```

### NotificationResponse

```json
{
  "id": "notification-id",
  "workspaceId": "workspace-id",
  "recipientUserId": "user-id",
  "type": "agent_approval_required",
  "title": "Agent action needs approval",
  "body": "A generated task draft is waiting for your approval.",
  "readAt": null,
  "relatedObject": {
    "type": "agent_action",
    "id": "agent-action-id"
  },
  "createdAt": "2026-06-30T00:00:00.000Z"
}
```

### SharedFileRef

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "filename": "meeting-note.md",
  "fileType": "document",
  "url": "s3://bucket/key",
  "linkedEntityType": "meeting_report",
  "linkedEntityId": "uuid"
}
```

## Boundaries

- Notification can link to an owner-domain object, but it must not execute the
  owner-domain action.
- Notification list/read APIs are scoped to the authenticated user.
- Workspace membership is required before notification list/read APIs return
  data.
- `linkedEntityType` and `linkedEntityId` are polymorphic references validated
  by owner-domain contracts and tests, not by database foreign keys.
- Shared file storage implementation remains owned by infra/secrets/deploy
  contracts.
