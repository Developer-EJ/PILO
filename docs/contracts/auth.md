# Auth Contract

## Owner

동현

## Scope

Auth/Login/Signup은 PILO 진입 전 사용자 식별과 세션 관리를 담당한다.

- Google 로그인
- GitHub 로그인
- OAuth callback 처리
- 신규 User 생성
- 기존 User 프로필 동기화
- 로그인 세션 유지
- 로그아웃
- 보호 화면 접근 제어

GitHub 로그인은 사용자 인증 수단이며, GitHub Repository 연결 권한과 분리한다. Repository 선택, Issue/PR 조회, Webhook, GitHub App 설치는 주형의 GitHub contract에서 관리한다.

## Owned Models

- User
- OAuthAccount
- AuthSession

## Provided APIs

- `GET /auth/providers`
- `GET /auth/google/start`
- `GET /auth/google/callback`
- `GET /auth/github/start`
- `GET /auth/github/callback`
- `GET /auth/me`
- `POST /workspaces/:workspaceId/permissions/resolve`
- `POST /auth/logout`

`POST /workspaces/:workspaceId/permissions/resolve` is the shared permission contract for workspace-scoped writes and AI execution. Request body is `WorkspacePermissionResolveRequest`; response body is `WorkspacePermissionDecision`.

The public request body must not include `actorMemberId`. The app-server derives the actor from the authenticated current member context and passes that actor into `AuthPublicContract.resolveWorkspacePermission`.

## Read Models

### CurrentUser

```json
{
  "id": "user_123",
  "name": "홍길동",
  "email": "user@example.com",
  "avatarUrl": "https://example.com/avatar.png",
  "providers": ["google", "github"],
  "lastLoginAt": "2026-06-27T12:00:00Z"
}
```

### AuthSessionState

```json
{
  "authenticated": true,
  "user": {
    "id": "user_123",
    "name": "홍길동",
    "email": "user@example.com"
  }
}
```

## Consumed By

- 동현: Login, Signup, Workspace entry, Dashboard guard
- 주형: GitHub Repository 연동 시작 전 사용자 식별
- 진호: Meeting participant identity
- 은재: Review author/reviewer identity
- 세인: Agent request actor identity

## Events

- `auth.user_signed_in`
- `auth.user_signed_out`
- `auth.oauth_account_linked`

## Boundaries

- A는 사용자 로그인과 세션을 소유한다.
- 동현은 Repository 목록, Issue, PR, Webhook을 직접 조회하거나 저장하지 않는다.
- B는 GitHub Repository 연동을 소유하지만 로그인 세션, 회원가입, User 생성 로직을 직접 수정하지 않는다.
- GitHub OAuth scope는 로그인 기본 scope와 Repository 연동 scope를 분리한다.
