# User API

## 범위

User API는 PILO API 호출의 현재 로그인 사용자 정보를 제공한다.

- 현재 사용자 profile 조회
- 현재 사용자의 PILO profile override 수정
- 계정 탈퇴
- 도메인 API가 사용할 `currentUserId` 기준 제공

로그인 OAuth 시작/콜백, session 발급/갱신, GitHub Review 제출용 사용자 GitHub
App user OAuth 연결은 이 문서의 범위가 아니다. 사용자 GitHub App user OAuth 연결 상태는
GitHub Integration API의 `/me/github`를 사용한다.

## 데이터 규칙

- 테이블: `users`, `user_settings`
- 현재 사용자는 `Authorization: Bearer <pilo_access_token>`에서 온다.
- `userId`는 request body나 query로 받지 않는다.
- API 응답에는 `github_access_token_encrypted`, provider access token, session secret을 노출하지 않는다.
- `github_user_id`, `google_user_id` 같은 provider 내부 식별자는 기본 profile 응답에 포함하지 않는다.
- `users.name`, `users.email`, `users.avatar_url`은 로그인 provider 동기화 결과를 유지한다.
- 사용자가 지정한 표시 이름, 직무, 소개, avatar URL과 표시 방식은 `user_settings`에 저장한다.
- 표시 이름이 없으면 `users.name`, 이메일 local-part, `PILO 사용자` 순서로 fallback한다.
- 이메일과 provider 원본 avatar URL은 User API에서 직접 수정하지 않는다.
- 응답의 `avatarUrl`은 `custom`, `provider`, `initials` 표시 방식에 따라 계산한
  최종 표시 URL이다. `initials`면 `null`을 반환한다.
- `active_workspace_id`, `last_seen_at`은 Home 멤버 presence 표시용으로만 사용한다.
- presence 갱신은 현재 bearer session user 본인의 `users` row만 수정한다.
- 탈퇴한 사용자는 `users` row를 audit tombstone으로 유지하고 `deleted_at`을 기록한다.
- 탈퇴한 사용자의 session은 모두 revoke하며 이후 보호 API 접근을 허용하지 않는다.

## API 목록

| Method | Endpoint | 설명 |
| --- | --- | --- |
| `GET` | `/me` | 현재 로그인 사용자 profile 조회 |
| `PATCH` | `/me/profile` | 현재 사용자의 PILO profile override 수정 |
| `POST` | `/me/presence` | 현재 사용자의 활성 Workspace presence 갱신 |
| `DELETE` | `/me` | 현재 계정 탈퇴와 개인정보 익명화 |

## 현재 사용자 조회

```http
GET /api/v1/me
```

응답:

```json
{
  "success": true,
  "data": {
    "id": "user_uuid",
    "name": "Eunjae",
    "displayName": "은재",
    "jobTitle": "Frontend Developer",
    "bio": "PILO 프로젝트를 개발하고 있습니다.",
    "email": "eunjae@example.com",
    "avatarUrl": "https://cdn.example.com/custom-avatar.png",
    "providerAvatarUrl": "https://example.com/avatar.png",
    "customAvatarUrl": "https://cdn.example.com/custom-avatar.png",
    "avatarMode": "custom",
    "avatarColor": "#6366F1",
    "loginProviders": ["google"],
    "createdAt": "2026-07-04T00:00:00.000Z",
    "updatedAt": "2026-07-04T00:00:00.000Z"
  }
}
```

서버 규칙:

- access token이 없거나 유효하지 않으면 `401 UNAUTHORIZED`를 반환한다.
- token의 subject에 해당하는 `users.id`를 조회한다.
- 사용자가 존재하지 않으면 `401 UNAUTHORIZED`를 반환한다.
- `users.deleted_at IS NOT NULL`이면 `401 UNAUTHORIZED`를 반환한다.
- `name`은 provider 동기화 원본 이름이며 `displayName`은 사용자 override가 있으면
  override, 없으면 fallback 이름을 반환한다.
- `loginProviders`는 provider 식별자 존재 여부에서 파생하며 provider 내부 id는
  노출하지 않는다.
- 응답에는 token, encrypted token, provider raw profile을 포함하지 않는다.

## 현재 사용자 Presence 갱신

```http
POST /api/v1/me/presence
```

Request Body:

```json
{
  "activeWorkspaceId": "workspace_uuid"
}
```

`activeWorkspaceId`는 `null`도 허용한다. `null`이면 현재 사용자의 활성 Workspace를 비운다.

응답:

```json
{
  "success": true,
  "data": {
    "activeWorkspaceId": "workspace_uuid",
    "lastSeenAt": "2026-07-09T06:00:00.000Z"
  }
}
```

서버 규칙:

- access token이 없거나 유효하지 않으면 `401 UNAUTHORIZED`를 반환한다.
- `activeWorkspaceId`가 문자열이면 UUID 형식이어야 하며, 현재 사용자가 해당 Workspace의 owner 또는 member여야 한다.
- 현재 사용자가 해당 Workspace member가 아니면 `403 FORBIDDEN`을 반환한다.
- body가 없거나 `activeWorkspaceId`가 생략되면 `400 BAD_REQUEST`를 반환한다.
- 성공 시 `users.active_workspace_id`와 `users.last_seen_at`을 갱신한다.
- 브라우저 종료/탭 종료 이벤트에서는 Frontend가 현재 사용자의 기본 owner Workspace id로 이 endpoint를 `keepalive` 요청한다.

## 현재 사용자 Profile 수정

```http
PATCH /api/v1/me/profile
Content-Type: application/json
```

Request Body:

```json
{
  "displayName": "은재",
  "jobTitle": "Frontend Developer",
  "bio": "PILO 프로젝트를 개발하고 있습니다.",
  "avatarMode": "custom",
  "customAvatarUrl": "https://cdn.example.com/custom-avatar.png",
  "avatarColor": "#6366F1"
}
```

모든 필드는 optional이며 지원 필드가 하나 이상 있어야 한다.
`displayName`, `jobTitle`, `bio`, `customAvatarUrl`에 `null`을 전달하면 해당
override를 비운다.

Validation:

| Field | 규칙 |
| --- | --- |
| `displayName` | `null` 또는 trim 후 1~100자 |
| `jobTitle` | `null` 또는 trim 후 1~100자 |
| `bio` | `null` 또는 trim 후 1~500자 |
| `avatarMode` | `provider`, `custom`, `initials` |
| `customAvatarUrl` | `null` 또는 1~2048자의 HTTPS URL |
| `avatarColor` | `#RRGGBB` |

서버 규칙:

- body가 없거나 지원 필드가 하나도 없으면 `400 BAD_REQUEST`를 반환한다.
- 이메일, provider 이름, provider avatar URL은 이 endpoint에서 받지 않는다.
- `avatarMode=custom`인 최종 상태에는 유효한 `customAvatarUrl`이 있어야 한다.
- 사용자 지정 URL은 `user_settings.custom_avatar_url`에 저장하며 OAuth 로그인으로
  갱신되는 `users.avatar_url`은 수정하지 않는다.
- validation 후 `user_settings`를 현재 사용자 기준으로 upsert한다.
- 성공 시 `GET /me`와 같은 전체 payload를 반환한다.

## 현재 계정 탈퇴

```http
DELETE /api/v1/me
Content-Type: application/json
```

Request Body:

```json
{
  "confirmationText": "계정 탈퇴"
}
```

응답:

```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

서버 규칙:

- `confirmationText`가 정확히 `계정 탈퇴`가 아니면 `400 BAD_REQUEST`를 반환한다.
- 현재 사용자가 member로 참여 중인 Workspace는 계정 탈퇴 transaction에서 자동으로
  나간다.
- 현재 사용자가 owner인 Workspace는 모두 잠근 뒤 기존 Workspace 삭제 blocker를
  검사한다.
  - Owner 본인 외의 member가 남아 있음
  - active GitHub App installation이 있음
  - 진행 중인 Meeting 또는 녹음이 있음
  - `queued` 또는 `running` GitHub sync run이 있음
- owner Workspace에 blocker가 하나라도 있으면 계정 탈퇴와 Workspace 삭제 요청을
  모두 rollback하고 `409 CONFLICT`를 반환한다. 응답의 `error.details`에는
  `blockedWorkspaces` 배열로 `workspaceId`, `name`, 다른 member 수 `memberCount`,
  `reasons`를 포함한다. `reasons` 허용값은 `MEMBERS_REMAIN`,
  `GITHUB_INSTALLATION_ACTIVE`, `MEETING_ACTIVE`, `SYNC_ACTIVE`다.
- 다른 member와 blocker가 없는 owner Workspace는 같은 transaction에서 기존
  Workspace 비동기 삭제 lifecycle을 자동으로 시작한다. 이미 `deleting` 상태인
  Workspace는 기존 삭제 job을 그대로 사용한다.
- 현재 사용자의 모든 `user_sessions`를 revoke한다.
- 현재 사용자의 active GitHub OAuth connection은 token을 revoke/clear하고
  `revoked_at`을 기록한다. GitHub provider raw error나 token은 노출하지 않는다.
- 현재 사용자의 Google Calendar OAuth state를 삭제하고, event sync를
  `disconnected`로 전환하며, 미완료 sync outbox를 provider 호출 불가 상태로
  종료한 뒤 `google_calendar_connections` row를 삭제한다. 이 과정에서 encrypted
  access/refresh token을 로그나 API에 노출하지 않는다.
- 현재 사용자의 Workspace member membership과 개인 Settings row를 삭제한다.
- `users` row는 domain audit FK를 보존하기 위해 물리 삭제하지 않는다.
- `users.name`은 `탈퇴한 사용자`, email/avatar/provider identity는 `null`,
  `active_workspace_id`는 `null`, `deleted_at`은 현재 시각으로 갱신한다.
- 위 DB 변경은 하나의 transaction에서 처리한다. provider revoke 같은 외부 작업이
  필요하면 실패/재시도 정책을 별도로 적용하고 secret을 로그에 남기지 않는다.
- Google Calendar provider 호출과 계정 탈퇴는 같은 사용자 lifecycle lock으로
  직렬화한다. 탈퇴 transaction이 commit된 뒤에는 이미 claim된 sync outbox나 OAuth
  callback도 provider를 호출하거나 connection credential을 다시 만들 수 없다.
- `PATCH /me/profile`과 `PATCH /me/settings`는 active `users` row를 transaction
  안에서 잠근 뒤 `user_settings`를 upsert한다. 이미 AuthGuard를 통과한 요청도 탈퇴
  commit 뒤에는 Settings row를 다시 만들 수 없다.
- transaction 안에서 삭제한 모든 member membership의 `workspace_id`를 수집하고,
  Workspace별 `workspace_membership_revocation_outbox` intent를 함께 적재한다. commit
  뒤 publisher가 각 intent를 `workspace:membership-revocations` channel의 exact V1
  `membership.revoked` event로 전달한다.
- membership revocation Redis 연결 또는 publish 실패는 안전하게 기록하고 outbox가
  재시도하지만, 이미 commit된 계정 탈퇴를 rollback하거나 성공 응답을 바꾸지 않는다.
  Transaction 실패 시에는 delivery intent와 event를 발행하지 않는다.
- Realtime Server는 event를 받은 모든 Chat tab을 즉시 퇴출한다. Event가 유실되어도
  다음 Chat fan-out 직전 batch membership recheck에서 탈퇴 사용자의 수신을 차단한다.
- 성공 응답 뒤 Frontend는 local access token과 선택 Workspace를 삭제하고 로그인
  화면으로 이동한다.
- 자동 삭제가 요청된 owner Workspace는 계정 탈퇴 성공 뒤 background worker가
  cleanup을 완료하고 최종 hard delete한다. `users` row는 tombstone으로 남기 때문에
  삭제 worker가 완료되기 전에 개인정보가 익명화되어도 FK와 audit identity는
  유지된다.
- 익명화 이후 같은 provider로 로그인하면 과거 계정을 복구하지 않고 새 사용자로
  가입한다.

## 도메인 API 사용 규칙

도메인 API는 현재 사용자가 필요할 때 request body의 `userId`를 신뢰하지 않는다.
항상 인증 layer에서 얻은 `currentUserId`를 사용한다.

예:

| 도메인 | 사용 필드 |
| --- | --- |
| PR Review | `created_by_user_id`, `reviewed_by_user_id`, `submitted_by_user_id` |
| Meeting | `meeting_participants.user_id`, `ended_by_id` |
| Calendar | `calendar_events.created_by` |
| Canvas | `canvas_user_states.user_id` |
| GitHub Integration | `github_oauth_connections` (`purpose=app_user`) GitHub App user OAuth 연결 상태 |

## MVP 제외

- 사용자 검색
- team member 초대
- provider raw profile 조회
- session 발급/갱신 API
- 계정 복구
- 로그인 provider 추가·제거
- 이메일 직접 변경
- 파일 업로드 기반 avatar 변경
