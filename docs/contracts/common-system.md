# Common System Contract

## Owner

DevOps/공통 Backend gatekeeper가 소유한다.

MVP 구현 전까지는 공통 테이블 구조 변경 PR에 DevOps 리뷰가 필요하다. 각 도메인은 공통 API를 호출할 수 있지만 `notifications`, `shared_files`, `audit_logs` table 구조를 직접 바꾸지 않는다.

## Scope

여러 도메인이 소비하는 알림, 공유 파일, 감사 로그를 담당한다.

## Owned Tables

- `notifications`
- `shared_files`
- `audit_logs`

## Current Runtime APIs

현재 `dev`에서 공통 시스템 쪽 실제 HTTP API로 확인되는 것은 health check다.

| Method | Path | 목적 |
|---|---|---|
| `GET` | `/api/health` | app-server health check |

## Deferred APIs

아래 API는 공통 시스템 계약 후보이지만 현재 `dev`에는 controller가 없다.
다른 도메인은 현재 runtime에서 호출하면 안 된다.

| Method | Path | 목적 |
|---|---|---|
| `GET` | `/api/workspaces/:workspaceId/notifications` | 내 알림 목록 |
| `PATCH` | `/api/notifications/:notificationId/read` | 알림 읽음 처리 |
| `PATCH` | `/api/workspaces/:workspaceId/notifications/read-all` | 내 알림 전체 읽음 |
| `POST` | `/api/workspaces/:workspaceId/shared-files` | 공유 파일 메타데이터 생성 |
| `GET` | `/api/workspaces/:workspaceId/shared-files` | 공유 파일 목록 |
| `POST` | `/api/audit-logs` | 중요 조작 기록 |

## DTOs

### NotificationCreateRequest

```json
{
  "userId": "uuid",
  "type": "task.status_changed",
  "title": "Task 상태가 변경되었습니다",
  "linkedEntityType": "task",
  "linkedEntityId": "uuid"
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

- 각 도메인은 알림/파일/로그 생성을 요청할 수 있지만, 공통 테이블 구조를 임의로 변경하지 않는다.
- `linkedEntityType/linkedEntityId`는 다형 참조라 owner contract에서 검증한다.
- 파일 업로드의 실제 storage 정책은 infra/secrets/deploy 문서와 맞춘다.
