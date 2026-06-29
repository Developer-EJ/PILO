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
- `POST /auth/logout`

## API Response Policy

### `GET /auth/providers`

OAuth provider 목록과 session 저장 정책을 반환한다. secret 값은 절대 포함하지 않는다.

```json
{
  "providers": [
    {
      "id": "google",
      "label": "Google",
      "startPath": "/auth/google/start",
      "callbackPath": "/auth/google/callback",
      "callbackUrl": "https://api.pilo.dev/auth/google/callback",
      "scopes": ["openid", "email", "profile"],
      "configured": true,
      "missingEnv": [],
      "loginOnly": true
    }
  ],
  "session": {
    "cookieName": "pilo_session",
    "configured": true,
    "source": "env"
  }
}
```

### OAuth start/callback

- `GET /auth/{provider}/start?next=/canvas`
  - 성공: provider authorization URL로 `302` redirect
  - provider 설정 누락: `/login?auth=error&provider={provider}&error=oauth_provider_not_configured`로 `302` redirect
- `GET /auth/{provider}/callback`
  - 성공: `Set-Cookie: pilo_session=...; HttpOnly; SameSite=Lax`를 내려보내고 `/login?auth=success&provider={provider}&next={safePath}`로 `302` redirect
  - 실패: `/login?auth=error&provider={provider}&error={errorCode}`로 `302` redirect
  - callback은 JSON body를 반환하지 않는다.

OAuth callback 실패 `errorCode`는 아래 값 중 하나를 사용한다.

- provider passthrough: `access_denied` 등 OAuth provider가 query `error`로 보낸 값
- `oauth_provider_not_configured`
- `missing_oauth_callback_params`
- `oauth_state_missing`
- `oauth_state_provider_mismatch`
- `oauth_state_nonce_mismatch`
- `oauth_state_expired`
- `oauth_token_exchange_failed`
- `oauth_token_missing_access_token`
- `oauth_profile_fetch_failed`
- `oauth_profile_missing_id`
- `oauth_callback_failed`

### `GET /auth/me`

- 인증 성공: `200`과 `CurrentUser` JSON을 반환한다.
- 인증 실패: `401`과 Nest 기본 error body를 반환한다.
- cookie 없음, 만료 session, revoked session, 삭제된 user session은 모두 `401`이다.

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### `POST /auth/logout`

- session cookie가 있으면 해당 `AuthSession.revokedAt`을 기록한다.
- session cookie가 없거나 이미 revoke된 session이어도 안전하게 성공 처리한다.
- 성공 응답은 `204 No Content`이며 JSON body를 반환하지 않는다.
- 항상 만료 cookie를 `Set-Cookie`로 반환해 브라우저의 `pilo_session`을 삭제한다.

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

- `id`는 UUID 문자열이다.
- `avatarUrl`은 없으면 `null`이다.
- `lastLoginAt`은 없으면 `null`이며, 있으면 ISO 8601 date-time 문자열이다.
- `providers`는 로그인/연동된 인증 provider이며 현재 `google`, `github`만 허용한다.

### AuthSessionState

```json
{
  "authenticated": true,
  "user": {
    "id": "user_123",
    "name": "홍길동",
    "email": "user@example.com",
    "avatarUrl": "https://example.com/avatar.png",
    "providers": ["google"],
    "lastLoginAt": "2026-06-27T12:00:00Z"
  }
}
```

로그아웃/비인증 상태는 아래처럼 표현한다. Frontend auth client가 `/auth/me`의 `401`을 이 형태로 변환해 사용한다.

```json
{
  "authenticated": false,
  "user": null
}
```

## Contract Change PR 기준

Auth public contract 변경 PR에는 아래 내용을 반드시 남긴다.

- 변경한 contract: `CurrentUser`, `AuthSessionState`, Auth endpoint response/error policy 중 무엇인지 명시
- Impact: 소비자 `Workspace`, `Dashboard`, `Canvas`, `GitHub`, `Meeting`, `Review`, `Agent` 영향 여부
- Breaking Change: 필드 삭제/의미 변경 여부와 migration plan
- Validation: `docs/contracts/auth.md`, `docs/contracts/schemas/pilo-public-contracts.schema.json`, 관련 smoke/integration test 통과 여부

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

- 동현은 사용자 로그인과 세션을 소유한다.
- 동현은 Repository 목록, Issue, PR, Webhook을 직접 조회하거나 저장하지 않는다.
- 주형은 GitHub Repository 연동을 소유하지만 로그인 세션, 회원가입, User 생성 로직을 직접 수정하지 않는다.
- GitHub 로그인 OAuth scope는 사용자 인증용 기본 scope만 사용한다.
- Repository 선택, Issue/PR 조회, Webhook, GitHub App 설치는 주형 GitHub contract에서 다룬다.
