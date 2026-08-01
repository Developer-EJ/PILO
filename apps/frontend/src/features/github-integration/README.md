# GitHub Integration Feature

Owner: 주형

API contract: `docs/api/github-integration-api.md`
([link](../../../../../docs/api/github-integration-api.md))

이 폴더는 Workspace의 GitHub 연결 설정 화면을 소유한다. `/github` route는 호환용 entry로
`/home?settings=github` 형태의 settings 화면으로 이동하고, 실제 panel은 settings surface에서
사용된다. GitHub App user OAuth,
ProjectV2 OAuth, GitHub App installation, repository 선택, repository-scoped
ProjectV2 discovery, 활성 Board source 선택, 수동 sync run 시작/조회 UI를 여기서
구성한다.

## 책임

- GitHub 연결 화면의 상태 조회, OAuth/App 설치 redirect 시작, 연결 해제, installation
  삭제 confirmation UI
- repository 목록과 선택한 repository에 연결된 ProjectV2 목록 조회
- repository 선택 시 기본 ProjectV2를 활성 Board source로 만드는 frontend workflow
- 수동 sync run 요청, `Idempotency-Key` 생성/재사용, sync run polling과 progress 표시
- GitHub callback error query를 사용자 메시지로 매핑하고 URL에서 제거
- ProjectV2 OAuth scope(`read:user user:email project repo`)가 부족한 연결의 재연결 안내

## 책임이 아닌 것

- Board kanban, card, issue detail, drag/drop, issue create/update UI는
  [Board Feature](../board/README.md)가 소유한다.
- GitHub token 복호화, GitHub provider 호출, webhook 처리, sync worker 실행은
  [App Server GitHub Integration Module](../../../../app-server/src/modules/github-integration/README.md)이
  소유한다.
- Board cache hydrate, issue write, Board realtime room 처리는
  [App Server Board Module](../../../../app-server/src/modules/board/README.md)과
  Realtime Server가 소유한다.
- PR Review 제출/merge/conflict workflow의 public UX는 PR Review 도메인 책임이다.

## 구조와 데이터 흐름

```text
page.tsx
  -> components/github-panel.tsx
     -> api/client.ts
        -> /api/v1/me/github
        -> /api/v1/me/github/project-oauth
        -> /api/v1/workspaces/{workspaceId}/github/*
        -> /api/v1/workspaces/{workspaceId}/boards/active
     -> utils/github-*
```

1. `GithubPanel`은 `useAuthSession()`에서 `activeWorkspaceId`, access token, owner 여부를
   읽고 `createGithubIntegrationApiClient()`를 만든다.
2. 초기 snapshot은 OAuth 상태, ProjectV2 OAuth 상태, installation, repository,
   active Board source, manual sync run 상태를 병렬로 조회한다.
3. repository가 선택되면 `discoverGithubProjectV2()`로 repository-scoped ProjectV2 metadata를
   조회한다. personal ProjectV2에 연결이 필요하면 API의 `connectionRequired`를 사용자
   안내로 표시한다.
4. repository의 기본 ProjectV2가 결정되면 `activateWorkspaceBoardSource()`가
   `/boards/active`를 호출한다. 활성 source 저장과 Board hydrate는 서버 Board module의
   transaction boundary에서 처리된다.
5. manual sync는 `startGithubSyncRun()`에 `Idempotency-Key`를 붙여 요청하고,
   `createGithubSyncPollLoop()`가 queued/running 상태를 polling한다.

## 중요한 파일

- [page.tsx](page.tsx): `/github` 호환 route. `GithubPanel`을 직접 렌더링하지 않고 settings
  경로로 replace한다.
- [components/github-panel.tsx](components/github-panel.tsx): 화면 상태, redirect workflow,
  repository/ProjectV2 선택, manual sync orchestration.
- [components/github-connect-layout.tsx](components/github-connect-layout.tsx): 연결 화면의
  presentation surface.
- [components/github-connect-repositories.tsx](components/github-connect-repositories.tsx):
  repository 목록과 repository 선택 UI.
- [components/github-connect-project.tsx](components/github-connect-project.tsx): ProjectV2 선택
  UI와 Project OAuth 연결 상태 표시.
- [api/client.ts](api/client.ts): GitHub Integration/active Board source REST client.
- [types/index.ts](types/index.ts): API payload와 query/input 타입.
- [utils/github-manual-sync-idempotency.ts](utils/github-manual-sync-idempotency.ts): manual sync
  scope별 idempotency key 보존/교체 규칙.
- [utils/github-sync-progress.ts](utils/github-sync-progress.ts): sync polling, active status,
  request gate.
- [utils/github-project-oauth-scope.ts](utils/github-project-oauth-scope.ts): ProjectV2 OAuth
  scope 검증.
- [utils/github-project-selection.ts](utils/github-project-selection.ts): repository-scoped
  browsing selection과 active Board source reconciliation.
- [utils/github-active-board-revision.ts](utils/github-active-board-revision.ts): active Board
  선택 race guard.

## Public surface

이 feature가 외부로 제공하는 안정 surface는 다음이다.

- `createGithubIntegrationApiClient({ accessToken, baseUrl, fetcher })`
- `GithubIntegrationApiError`
- `GithubPanel`
- `GithubPage`
- `GITHUB_SETTINGS_QUERY_KEY=settings`, `GITHUB_SETTINGS_QUERY_VALUE=github`
- `buildGithubSettingsReturnUrl()`와 settings entry helper
- GitHub/ProjectV2/sync 관련 타입(`GithubOAuthStatus`, `GithubProjectV2`,
  `GithubSyncRun`, `GithubSyncTarget` 등)

`api/client.ts`는 `NEXT_PUBLIC_PILO_APP_SERVER_URL`을 origin으로 읽고 `/api/v1`을 한 번만
붙인다. OAuth/App 설치 시작 요청은 callback binding cookie가 필요하므로
`credentials: "include"`로 전송된다.

## API 사용 범위

전체 endpoint, request, response, status code는
[GitHub Integration API](../../../../../docs/api/github-integration-api.md)를 따른다. 이 feature는
그중 OAuth/App installation, repository/ProjectV2 source read, ProjectV2 discovery/selection,
manual sync run, active Board source 변경에 필요한 client wrapper만 호출한다.

주의: active Board source는 Board API의 `/workspaces/{workspaceId}/boards/active` 계약이지만
GitHub 설정 화면에서 repository/ProjectV2 선택 결과를 저장하기 위해 이 client에서도 호출한다.

## 설정과 환경 변수

Frontend에서 이 폴더가 직접 읽는 값은 다음이다.

- `NEXT_PUBLIC_PILO_APP_SERVER_URL`: App Server origin. 없으면 `http://localhost:4000`.

GitHub 연결 flow가 실제로 성공하려면 App Server 쪽에 다음 값도 필요하다.

- `FRONTEND_URL`
- `API_PUBLIC_ORIGIN`
- `GITHUB_USER_OAUTH_CLIENT_ID`
- `GITHUB_USER_OAUTH_CLIENT_SECRET`
- `GITHUB_PROJECT_OAUTH_CLIENT_ID`
- `GITHUB_PROJECT_OAUTH_CLIENT_SECRET`
- `GITHUB_APP_ID`
- `GITHUB_APP_SLUG`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_WEBHOOK_SECRET`
- `GITHUB_TOKEN_ENCRYPTION_KEY`
- `SESSION_SECRET`
- `OAUTH_STATE_TTL_SECONDS`
- `AWS_REGION`
- `SQS_ENDPOINT`(local SQS/LocalStack을 쓰는 경우)
- `SQS_GITHUB_SYNC_JOBS_QUEUE_URL`
- `SQS_GITHUB_WEBHOOKS_QUEUE_URL`
- `REDIS_URL`

`SQS_GITHUB_SYNC_JOBS_QUEUE_URL`은 installation callback, manual sync, automatic sync job enqueue에 필요하다. root [/.env.example](../../../../../.env.example)에는 현재 이 값이 없으므로 App Server 실행 환경에 별도로 inject/export해야 한다. `AWS_REGION`은 SQS client region이며, `SQS_ENDPOINT`는 local SQS/LocalStack 검증 때만 선택적으로 둔다.

로컬 예시는 [/.env.example](../../../../../.env.example)에 있다. 실제 secret은 README에
넣지 않는다.

## 실행과 검증 명령

[apps/frontend/package.json](../../../package.json)의 script 기준이다.

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run format:check
```

GitHub Integration 변경을 좁게 확인할 때는 package script인 `npm run test`가 전체 frontend
테스트 묶음을 실행한다. 현재 feature 전용 `.test.mjs` 파일들은 `src/features/github-integration`
아래에 있고, manual sync idempotency, ProjectV2 OAuth scope, repository pagination,
active Board race guard를 검증한다.

## 지원 workflow

- App user OAuth 연결: `/me/github/oauth/start`에서 authorize URL을 받고 GitHub callback 후
  현재 settings return URL로 돌아온다.
- ProjectV2 OAuth 연결: `/me/github/project-oauth/start`가 `read:user user:email project repo`
  scope를 요구한다.
- GitHub App installation: Workspace Owner만 시작/삭제할 수 있고, App user OAuth 연결이
  선행되어야 한다.
- repository 선택: repository 선택 후 ProjectV2 discovery를 수행하고, 선택 가능한 ProjectV2가
  있으면 active Board source를 저장한다.
- manual sync: owner만 시작할 수 있다. `source` 외 target은 repository 선택이 필요하고,
  `project_v2`, `project_v2_fields`, `project_v2_items`는 ProjectV2 선택이 필요하다.

## 실패와 보안 caveat

- callback failure는 `github_callback_error`와 legacy `github_oauth_error` query를 안전한
  사용자 메시지로 바꾸고 URL에서 제거한다. raw provider error는 화면에 노출하지 않는다.
- personal ProjectV2 sync/write에는 ProjectV2 OAuth 연결이 필요하고, 연결된 GitHub login이
  personal owner와 맞아야 하며 `project`와 `repo` scope가 모두 있어야 한다.
- `repo` scope는 연결된 사용자가 접근 가능한 public/private repository에 넓은 read/write
  권한을 준다. UI 문구를 바꿀 때 이 위험 안내를 약화하지 않는다.
- manual sync idempotency key는 같은 scope의 transport failure/rate limit에서는 유지하고,
  definitive failure나 success 뒤에는 새 key로 교체한다.
- stale repository/workspace response는 request gate와 active Board revision guard로 버린다.
  repository 선택 중 느린 응답이 더 최신 선택을 덮어쓰면 안 된다.
- Board는 GitHub source invalidation socket을 구독하지 않는다. Board 화면은
  [Board Feature](../board/README.md)의 `board:invalidated`/`board:source:updated` 흐름으로
  REST snapshot을 다시 읽는다.

## 관련 문서

- [Board Feature](../board/README.md)
- [App Server GitHub Integration Module](../../../../app-server/src/modules/github-integration/README.md)
- [App Server Board Module](../../../../app-server/src/modules/board/README.md)
- [GitHub Integration API](../../../../../docs/api/github-integration-api.md)
- [Board API](../../../../../docs/api/board-api.md)
- [Realtime Server](../../../../realtime-server/README.md)
