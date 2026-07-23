# Workspace API

## 범위

Workspace API는 PILO 도메인 API가 공유하는 Workspace 경계와 Workspace 생성 및
조회 기능을 담당한다.

- 현재 사용자의 owner Workspace 생성
- 현재 사용자가 접근 가능한 Workspace 목록 조회
- Workspace 상세 조회와 접근 확인
- Workspace owner의 이름·아이콘 수정
- Workspace owner의 Workspace 삭제

Workspace 역할/멤버십과 email 초대 모델은
[workspace-membership-api.md](workspace-membership-api.md)를 따른다.

## 데이터 규칙

- 테이블: `workspaces`
- `workspace_id`는 path의 `workspaceId`에서 온다.
- OAuth login callback은 Workspace를 자동 생성하지 않는다.
- Workspace가 없는 로그인 사용자는 정상 인증 상태이며 Frontend onboarding에서
  Workspace 이름을 입력한 뒤 생성할 수 있다.
- 한 사용자는 여러 Workspace의 owner가 될 수 있다.
- Workspace 생성 시 `workspaces`와 `workspace_members(owner)`를 같은 transaction에서
  생성한다.
- Workspace 접근 가능 여부는 app-server의 공통 접근 확인 함수에서 판단한다.
- 기본 접근 기준은 `workspace_members`의 `owner` 또는 `member` membership이다.
- `workspaces.owner_user_id`는 기존 호환과 owner 표시용으로 유지한다.
- Frontend는 `GET /workspaces` 응답에서 선택한 `activeWorkspaceId`를 도메인 API path의
  `workspaceId`로 사용한다.
- 도메인 API는 request body의 `workspaceId`, `userId`를 신뢰하지 않는다.
- Workspace 접근 확인은 각 도메인에서 임시로 구현하지 않고 공통 layer를 사용한다.
- Workspace 이름·아이콘 수정과 삭제는 owner membership만 허용한다.
- Workspace 삭제 요청이 승인되면 `workspaces.deletion_status`를 `deleting`으로
  전환한다. 삭제 중인 Workspace는 목록에서 제외하고 공통 접근 확인과 새 쓰기를
  차단한다.
- Workspace 삭제는 DB의 Workspace FK cascade뿐 아니라 Drive object와 Meeting 녹음
  object를 durable cleanup job으로 정리한 뒤 최종 hard delete한다.
- 계정 탈퇴 시 Owner 본인 외의 member와 기존 삭제 blocker가 없는 owner Workspace는
  같은 deletion lifecycle을 자동으로 시작한다. blocker가 있는 Workspace가 하나라도
  있으면 계정 탈퇴와 모든 자동 삭제 요청을 함께 rollback한다.

## API 목록

| Method | Endpoint | 설명 |
| --- | --- | --- |
| `POST` | `/workspaces` | 현재 사용자의 owner Workspace 생성 |
| `GET` | `/workspaces` | 현재 사용자가 접근 가능한 Workspace 목록 조회 |
| `GET` | `/workspaces/{workspaceId}` | Workspace 상세 조회와 접근 확인 |
| `PATCH` | `/workspaces/{workspaceId}` | Owner의 Workspace 이름·아이콘 수정 |
| `DELETE` | `/workspaces/{workspaceId}` | Owner의 Workspace 삭제 |

## Workspace Payload

```json
{
  "id": "workspace_uuid",
  "name": "PILO-a1b2c3d4",
  "icon": "🚀",
  "ownerUserId": "user_uuid",
  "role": "owner",
  "isOwner": true,
  "createdAt": "2026-07-04T00:00:00.000Z",
  "updatedAt": "2026-07-04T00:00:00.000Z"
}
```

`isOwner`는 `role === 'owner'` 또는 `ownerUserId === currentUserId`로 계산한다.

## Workspace 생성

```http
POST /api/v1/workspaces
Content-Type: application/json
```

Request Body:

```json
{
  "name": "PILO Team",
  "icon": "🚀"
}
```

응답: `201 Created`

```json
{
  "success": true,
  "data": {
    "id": "workspace_uuid",
    "name": "PILO Team",
    "icon": "🚀",
    "ownerUserId": "user_uuid",
    "role": "owner",
    "isOwner": true,
    "createdAt": "2026-07-11T00:00:00.000Z",
    "updatedAt": "2026-07-11T00:00:00.000Z"
  }
}
```

서버 규칙:

- bearer session의 현재 user를 owner로 사용한다. `ownerUserId`는 request body로 받지
  않는다.
- `name`은 문자열이어야 하며 trim한 결과가 1자 이상 100자 이하여야 한다.
- trim한 Workspace 이름을 저장한다.
- `icon`은 optional이다. 전달하면 trim한 결과가 1자 이상 32자 이하여야 한다.
- `icon`을 생략하거나 `null`로 전달하면 `null`로 저장한다. Frontend는 Workspace
  이름의 첫 글자를 기본 icon으로 표시한다.
- 같은 이름의 Workspace 생성은 허용한다. Workspace identity는 `id`로 구분한다.
- `workspaces`에 `owner_user_id = currentUserId`인 row를 생성한다.
- 같은 transaction에서 `workspace_members`에 현재 user의 `owner` membership을
  생성한다.
- Workspace 또는 owner membership 생성 중 하나라도 실패하면 전체 transaction을
  rollback한다.
- 생성된 Workspace payload의 `role`은 `owner`, `isOwner`는 `true`다.

## Workspace 목록 조회

```http
GET /api/v1/workspaces
```

응답:

```json
{
  "success": true,
  "data": [
    {
      "id": "workspace_uuid",
      "name": "PILO-a1b2c3d4",
      "icon": "🚀",
      "ownerUserId": "user_uuid",
      "role": "owner",
      "isOwner": true,
      "createdAt": "2026-07-04T00:00:00.000Z",
      "updatedAt": "2026-07-04T00:00:00.000Z"
    }
  ]
}
```

서버 규칙:

- 현재 사용자가 접근 가능한 Workspace만 반환한다.
- 현재 사용자가 `workspace_members`에서 `owner` 또는 `member`인 Workspace를 반환한다.
- 정렬은 `createdAt ASC`를 기본값으로 한다.
- 접근 가능한 Workspace가 없는 사용자는 정상적으로 빈 배열을 받을 수 있다.
- Frontend는 빈 배열을 onboarding 필요 상태로 처리한다.

## Workspace 상세 조회

```http
GET /api/v1/workspaces/{workspaceId}
```

응답:

```json
{
  "success": true,
  "data": {
    "id": "workspace_uuid",
    "name": "PILO-a1b2c3d4",
    "icon": "🚀",
    "ownerUserId": "user_uuid",
    "role": "owner",
    "isOwner": true,
    "createdAt": "2026-07-04T00:00:00.000Z",
    "updatedAt": "2026-07-04T00:00:00.000Z"
  }
}
```

서버 규칙:

- `workspaceId`가 존재하지 않으면 `404 NOT_FOUND`를 반환한다.
- 현재 사용자가 접근할 수 없는 Workspace면 `403 FORBIDDEN`을 반환한다.
- 이 endpoint는 프론트와 도메인 API가 Workspace 접근 가능 여부를 확인하는 기준으로 사용할 수 있다.

## Workspace 수정

```http
PATCH /api/v1/workspaces/{workspaceId}
Content-Type: application/json
```

Request Body:

```json
{
  "name": "PILO Core Team",
  "icon": "🚀"
}
```

`name`, `icon`은 optional이며 지원 필드가 하나 이상 있어야 한다.
`icon: null`은 저장된 아이콘을 비운다.

응답:

```json
{
  "success": true,
  "data": {
    "id": "workspace_uuid",
    "name": "PILO Core Team",
    "icon": "🚀",
    "ownerUserId": "user_uuid",
    "role": "owner",
    "isOwner": true,
    "createdAt": "2026-07-04T00:00:00.000Z",
    "updatedAt": "2026-07-13T00:00:00.000Z"
  }
}
```

서버 규칙:

- 현재 사용자가 해당 Workspace owner가 아니면 `403 FORBIDDEN`을 반환한다.
- `name`은 trim 후 1자 이상 100자 이하여야 한다.
- `icon`은 `null` 또는 trim 후 1자 이상 32자 이하여야 한다.
- 성공 시 갱신된 Workspace payload를 반환한다.

## Workspace 삭제

```http
DELETE /api/v1/workspaces/{workspaceId}
Content-Type: application/json
```

Request Body:

```json
{
  "confirmationName": "PILO Team"
}
```

응답: `202 Accepted`

```json
{
  "success": true,
  "data": {
    "deletionRequested": true,
    "workspaceId": "workspace_uuid",
    "status": "deleting"
  }
}
```

서버 규칙:

- 현재 사용자가 해당 Workspace owner가 아니면 `403 FORBIDDEN`을 반환한다.
- `confirmationName`이 현재 Workspace 이름과 정확히 일치하지 않으면
  `400 BAD_REQUEST`를 반환한다.
- Owner 본인 외의 member가 한 명이라도 남아 있으면 `409 CONFLICT`를 반환한다.
  Frontend는 삭제 확인창에 멤버를 먼저 제거하라는 경고를 표시한다.
- active GitHub App installation, 진행 중인 Meeting, `queued` 또는 `running` GitHub
  sync run이 있으면 `409 CONFLICT`를 반환하고 Workspace를 삭제하지 않는다.
- 삭제 요청 transaction은 Workspace row를 잠그고 blocker를 다시 확인한 다음
  `workspace_deletion_jobs`와 `workspace_deletion_targets`에 cleanup 대상을 저장하고
  Workspace를 `deleting`으로 전환한다.
- cleanup 대상은 `drive_items.object_key`가 있는 모든 Drive 파일과
  `meeting_recordings.audio_file_key`가 남아 있는 모든 Meeting 녹음이다. target type
  기반 handler 구조를 사용하므로 이후 다른 외부 object 종류를 추가할 수 있다.
- 아직 유효한 Drive presigned upload URL이 있으면 해당 `drive_uploads.expires_at`
  이후에 object 삭제를 시도한다. 만료 뒤 삭제하여 삭제 완료 후 지연 업로드로
  orphan object가 다시 생기는 것을 막는다.
- S3 `DeleteObject`는 object가 이미 없어도 성공으로 취급하는 idempotent 작업이다.
  실패한 target은 claim timeout과 capped backoff를 사용해 성공할 때까지 재시도한다.
- 모든 cleanup target이 `completed`가 된 뒤에만 `workspaces` row를 최종 hard
  delete한다. 이때 Workspace FK의 `ON DELETE CASCADE`에 따라 membership,
  invitation과 domain row를 함께 삭제한다.
- DB delete guard는 cleanup worker가 transaction-local finalize flag를 설정한
  경우에만 `workspaces` hard delete를 허용하므로 다른 코드 경로가 lifecycle을
  우회할 수 없다.
- `deleting` Workspace는 `GET /workspaces`에서 반환하지 않는다. 상세 조회와 도메인
  API 접근은 `409 CONFLICT`로 차단하며 DB write fence가 동시 요청과 background
  writer의 새 Workspace 쓰기도 거부한다.
- 같은 이름 확인값으로 삭제 요청을 다시 보내면 Workspace row가 남아 있는 동안
  동일한 `202 Accepted` 응답을 반환한다. 최종 hard delete 뒤에는 `404 NOT_FOUND`다.
- `users.active_workspace_id`와 `user_settings.default_workspace_id`는
  최종 hard delete 시 `ON DELETE SET NULL`로 비워진다.
- GitHub provider의 repository, issue, pull request, ProjectV2 원본은 삭제하지 않는다.
  기존 active GitHub installation blocker가 먼저 연결 해제를 요구한다.
- object key, bucket, storage credential은 API 응답, Activity Log metadata, 일반
  application log에 기록하지 않는다. object key는 private cleanup table에서만
  worker 입력으로 사용한다.
- `202 Accepted` 뒤 Frontend는 AuthSession의 Workspace 목록을 새로고침한다. 다른
  접근 가능 Workspace가 있으면 그 Workspace로 이동하고, 없으면 Workspace 생성
  onboarding으로 이동한다.

### Realtime/Redis 경계

- 삭제 상태 전환 뒤 app-server의 공통 Workspace 접근 확인이 신규 HTTP/API
  접근을 차단한다.
- realtime-server의 Board, Chat, Canvas, Document, PDF collaboration, Meeting,
  sqltoerd, GitHub source, Workspace presence join도 membership과 함께
  `deletion_status = active`를 확인해 신규 입장을 차단한다.
- active Meeting blocker는 진행 중인 Meeting/녹음 lifecycle과 삭제가 겹치지 않게
  한다.
- 현재 realtime-server의 Workspace room과 screen-share Redis key는 TTL 또는 기존
  session 종료 lifecycle에 의존한다. Workspace 전체를 대상으로 하는 durable
  revocation event와 key index가 없으므로 이번 API transaction에서 pattern scan
  삭제하지 않는다.
- 이미 입장한 socket의 즉시 퇴장과 Workspace별 Redis key 제거를 보장하려면 Infra/Realtime
  계약에 `workspace.deleting` event와 indexed cleanup consumer를 추가해야 한다.
  S3/DB 최종 삭제의 완료 조건에는 Redis ephemeral state를 포함하지 않는다.

## 도메인 API 사용 규칙

모든 `/workspaces/{workspaceId}/...` 도메인 API는 요청 처리 전에 공통
Workspace 접근 확인을 수행한다.

도메인 record를 조회할 때는 id만으로 조회하지 않고 path의 `workspaceId`와 함께
검증한다.

예:

```sql
WHERE id = :resourceId
  AND workspace_id = :workspaceId
```

## Validation

| 규칙 | 조건 |
| --- | --- |
| ownerUserId | request body로 받지 않음 |
| name | trim 후 1자 이상 100자 이하 |
| icon | optional, `null` 또는 trim 후 1자 이상 32자 이하 |
| 접근 확인 | 모든 Workspace path API에서 필수 |
| 수정·삭제 | owner membership 필수 |
| 삭제 확인 | `confirmationName`이 현재 Workspace 이름과 일치 |

## MVP 제외

- Workspace 소유권 이전
- admin role
- read-only role 판정
