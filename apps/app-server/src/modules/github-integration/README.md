# GitHub Integration Module

Owner: 주형

API contract: `docs/api/github-integration-api.md`
([link](../../../../../docs/api/github-integration-api.md))

이 모듈은 Workspace 단위 GitHub source of truth 연결을 소유한다. GitHub App user OAuth,
ProjectV2 OAuth, GitHub App installation, repository/issue/pull request/ProjectV2 source
cache, sync run, webhook receiver/worker, PR Review와 Board가 호출하는 GitHub provider
adapter 경계를 제공한다.

## 책임

- `app_user`와 `project_v2` 목적별 OAuth 연결 저장, refresh, revoke, callback state 검증
- GitHub App installation 시작/callback/삭제와 installation 접근 검증
- repository, issue, pull request, ProjectV2 metadata/field/item source cache 조회와 동기화
- manual/automatic sync run 생성, idempotency, admission limit, SQS job publish, worker lease
- GitHub webhook signature 검증, delivery 기록, source/ProjectV2 item reconcile outbox
- Board hydration invalidation과 GitHub source invalidation Redis publish
- PR Review/Board가 호출하는 내부 adapter: review submission, merge/conflict file write,
  issue write, assignee lookup, ProjectV2 item/status write

## 책임이 아닌 것

- GitHub 연결 설정 화면과 manual sync UX는
  [GitHub Integration Feature](../../../../frontend/src/features/github-integration/README.md)가
  소유한다.
- Board screen용 read model, active Board source pointer, Board issue create/update public API는
  [Board Module](../board/README.md)이 소유한다.
- Board kanban frontend는 [Board Feature](../../../../frontend/src/features/board/README.md)가
  소유한다.
- PR Review public endpoint와 사용자 확인 workflow는 PR Review 도메인이 소유한다.
- GitHub repository 생성/삭제, public PR merge/close endpoint, inline review comment,
  ProjectV2 field/option write는 현재 public API 범위가 아니다.

## 구조와 데이터 흐름

```text
github-integration.controller.ts
  -> github-integration.service.ts
     -> github-oauth-*.service.ts
     -> github-app-installation*.service.ts
     -> github-source-read.service.ts
     -> github-project-v2.service.ts
     -> github-sync-run.service.ts
     -> github-sync-job.service.ts
     -> github-sync-executor.service.ts
     -> github-webhook*.service.ts
     -> github-*-write.service.ts
```

1. Controller는 `/api/v1` 아래 public REST/callback/webhook endpoint를 제공한다.
2. OAuth/App 설치 시작 endpoint는 signed state row와 HttpOnly binding cookie를 만든다.
3. callback endpoint는 state/cookie/one-time row를 검증하고, 성공하면 return URL redirect 또는
   JSON payload를 반환한다. 실패 시 safe `github_callback_error` query로 redirect한다.
4. installation callback은 installation을 저장하고 `source` sync run을 enqueue한다. enqueue
   실패는 callback redirect 성공을 뒤집지 않고 run 상태에 기록된다.
5. manual sync는 idempotency ledger와 admission limit을 통과한 뒤 durable run/job을 만들고
   SQS에 publish한다.
6. worker는 SQS job/delivery를 lease로 claim하고 GitHub를 다시 조회해 source cache를 갱신한다.
   ProjectV2 field/item sync는 기존 Board hydrate와 invalidation publish를 수행한다.
7. webhook receiver는 raw payload signature를 검증하고 delivery를 기록한다. source worker는
   payload를 직접 source row로 믿지 않고 GitHub REST/GraphQL snapshot을 다시 조회한다.

## 중요한 파일

- [github-integration.controller.ts](github-integration.controller.ts): public REST,
  OAuth/App callback, webhook endpoint.
- [github-integration.service.ts](github-integration.service.ts): controller facade와 module info.
- [github-integration-config.service.ts](github-integration-config.service.ts): GitHub OAuth/App,
  webhook, manual sync admission env parsing.
- [github-oauth-connection.service.ts](github-oauth-connection.service.ts): purpose별 OAuth
  connection 조회와 refresh lifecycle.
- [github-oauth-integration.service.ts](github-oauth-integration.service.ts): App user OAuth flow.
- [github-project-oauth-integration.service.ts](github-project-oauth-integration.service.ts):
  ProjectV2 OAuth flow와 scope/account 검증.
- [github-app-installation.service.ts](github-app-installation.service.ts): installation start,
  callback, delete.
- [github-source-read.service.ts](github-source-read.service.ts): source cache read API.
- [github-project-v2.service.ts](github-project-v2.service.ts): ProjectV2 list/discovery/selection,
  active Board source selection support.
- [github-sync-run.service.ts](github-sync-run.service.ts): sync run 생성, idempotency, progress.
- [github-sync-job.service.ts](github-sync-job.service.ts): SQS publish/poll, job/delivery lease,
  outbox recovery.
- [github-sync-executor.service.ts](github-sync-executor.service.ts): GitHub source sync 실행과
  existing Board hydrate.
- [github-webhook.service.ts](github-webhook.service.ts): webhook receiver와 delivery 기록.
- [github-project-v2-webhook-reconcile.service.ts](github-project-v2-webhook-reconcile.service.ts):
  ProjectV2 item webhook reconcile.
- [github-source-webhook-reconcile.service.ts](github-source-webhook-reconcile.service.ts):
  issue/PR source webhook reconcile.
- [github-issue-write.service.ts](github-issue-write.service.ts): Board issue create/update와
  assignee lookup adapter.
- [github-project-v2-write.service.ts](github-project-v2-write.service.ts): Board ProjectV2 item/status
  write adapter.
- [github-app.client.ts](github-app.client.ts): GitHub REST/GraphQL HTTP boundary.
- [github-token-encryption.service.ts](github-token-encryption.service.ts): OAuth token encryption/decrypt.

## Public API surface

Public endpoint 전체 목록과 request/response/status rule은
[GitHub Integration API](../../../../../docs/api/github-integration-api.md)를 따른다. 이 module의
public controller surface는 App user OAuth, ProjectV2 OAuth, GitHub App installation,
repository/issue/PR/ProjectV2 source read, ProjectV2 discovery/selection, sync run, webhook
그룹으로 나뉜다.

서버 내부 surface는 `GithubIntegrationModule` export를 통해 다른 module이 주입받는다.

- `GithubIntegrationService`: source read, PR Review helper, sync facade.
- `GithubProjectV2Service`: ProjectV2 list/discovery/selection, active Board source selection support.
- `GithubOAuthConnectionService`: purpose별 OAuth connection 조회와 refresh lifecycle.
- `GithubIssueWriteService`: Board issue create/update/assignee lookup.
- `GithubProjectV2WriteService`: Board issue create/status 이동에서 ProjectV2 item/status write.

## 인증과 token 경계

- Repository/Issue/PR와 organization ProjectV2 조회/동기화는 GitHub App installation token을
  사용한다.
- personal ProjectV2 read/write/sync와 Board issue create는 `github_oauth_connections`
  `purpose=project_v2` token을 사용한다.
- Board issue update, assignee 변경/조회, PR Review는 `purpose=app_user` token을 사용한다.
- ProjectV2 OAuth authorize scope는 정확히 `read:user user:email project repo`이며 callback과
  runtime은 `project` and `repo` scopes를 모두 요구한다. 기존 `project`-only 연결은 재연결해야
  한다.
- `repo` scope는 연결된 사용자가 접근 가능한 public/private repository에 넓은 read/write 권한을
  준다.
- 복호화된 token, refresh token, GitHub App private key, JWT, installation token, raw provider
  error는 API 응답이나 로그에 노출하지 않는다.

## 설정과 환경 변수

이 모듈이 직접 확인하는 주요 env는 다음이다.

- `API_PUBLIC_ORIGIN`
- `API_BASE_PATH`(없으면 `/api/v1`)
- `FRONTEND_URL`(없으면 `http://localhost:3000`)
- `SESSION_SECRET`
- `OAUTH_STATE_TTL_SECONDS`(없으면 `600`)
- `GITHUB_USER_OAUTH_CLIENT_ID`
- `GITHUB_USER_OAUTH_CLIENT_SECRET`
- `GITHUB_PROJECT_OAUTH_CLIENT_ID`
- `GITHUB_PROJECT_OAUTH_CLIENT_SECRET`
- `GITHUB_APP_ID`
- `GITHUB_APP_SLUG`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_WEBHOOK_SECRET`
- `GITHUB_TOKEN_ENCRYPTION_KEY`
- `DATABASE_URL`
- `REDIS_URL`
- `AWS_REGION`
- `SQS_ENDPOINT`
- `SQS_GITHUB_SYNC_JOBS_QUEUE_URL`
- `SQS_GITHUB_WEBHOOKS_QUEUE_URL`
- `PORT`

manual sync admission은 env가 없으면 code default를 사용한다.

- `GITHUB_MANUAL_SYNC_USER_LIMIT` default `5`
- `GITHUB_MANUAL_SYNC_WORKSPACE_LIMIT` default `10`
- `GITHUB_MANUAL_SYNC_RATE_WINDOW_SECONDS` default `600`
- `GITHUB_MANUAL_SYNC_COOLDOWN_SECONDS` default `30`
- `GITHUB_MANUAL_SYNC_MAX_QUEUED_JOBS` default `100`

로컬 예시는 [/.env.example](../../../../../.env.example)에 있다. 현재 예시에는
`SQS_GITHUB_SYNC_JOBS_QUEUE_URL`이 없으므로 sync worker/manual sync를 검증할 때는 별도로
주입해야 한다. env 파일은 App Server가 자동으로 로드하지 않으며 실행 환경에서 export/inject해야
한다. `src/main.ts`의 기본 port는 `3000`이지만 root env 예시는 App Server origin을
`http://localhost:4000`으로 둔다. 로컬에서 예시 origin을 쓰려면 `PORT=4000`을 명시한다.

외부 GitHub provider 설정 URL은 반드시 public origin과 `/api/v1`을 포함한다.

```text
{API_PUBLIC_ORIGIN}/api/v1/github/oauth/callback
{API_PUBLIC_ORIGIN}/api/v1/github/project-oauth/callback
{API_PUBLIC_ORIGIN}/api/v1/github/installations/callback
{API_PUBLIC_ORIGIN}/api/v1/github/webhooks
```

## 실행과 검증 명령

[apps/app-server/package.json](../../../package.json)의 script 기준이다.

```bash
npm run build
npm run lint
npm run test
npm run format:check
npm run start
```

`npm run test`는 `pretest`로 build를 먼저 실행한다. GitHub Integration module 전용 테스트
묶음은 package test 내부에서 [scripts/github-integration/test.mjs](../../../scripts/github-integration/test.mjs)가
호출하는 구조다.

## 지원 workflow

- App user OAuth recovery: 새 callback token을 `/user/installations` capability로 검증한 뒤에만
  기존 active credential을 교체한다.
- ProjectV2 OAuth: `project`와 `repo` scope를 모두 요구하고, App user OAuth가 이미 있으면
  GitHub login mismatch를 거절한다.
- installation 연결: App user OAuth가 접근 가능한 installation인지 검증한 뒤 저장하고 `source`
  sync를 enqueue한다.
- installation 삭제: GitHub remote delete가 `202` 또는 `404`이면 local installation row를
  삭제하고 repository/ProjectV2의 `installation_id`만 `NULL`로 분리한다.
- repository-scoped ProjectV2 discovery/selection: `repositoryId`가 필수이며 selection은
  `{ installationId, repositoryId }` 조합 단위로 교체된다.
- manual sync: `Idempotency-Key`는 printable ASCII 1-128 bytes이고, 같은 manual scope replay는
  기존 run을 반환한다.
- webhook reconcile: source webhook은 issue/PR REST snapshot을 다시 조회하고, ProjectV2 item
  webhook은 selected organization ProjectV2 delivery만 queue한다. personal ProjectV2는 polling
  schedule을 유지한다.

## 실패와 보안 caveat

- Safe app-user OAuth recovery: capability validation 실패는 현재 credential을 유지한다.
  stale callback은 HMAC generation/state 검증으로 새 연결을 덮어쓰지 못한다. reconnect-required
  failure와 rate-limit/transient failure는 구분된다.
- OAuth refresh 실패 중 GitHub `4xx`, refresh token 없음/만료는 connection을 revoke하고
  재연결 오류를 반환한다. network, GitHub `5xx`, malformed success는 rollback해 기존 credential을
  보존한다.
- callback state는 signed state, binding cookie, one-time server-side row가 모두 맞아야 한다.
  replay, expired row, nonce mismatch는 invalid callback state로 거절한다.
- manual sync queue publish 실패는 새 durable run을 failed로 표시하고 API error를 반환한다.
  stranded queued run을 남기지 않는다.
- webhook delivery duplicate는 `delivery_id` unique 기록으로 멱등 처리된다. unsupported event는
  `ignored`로 기록한다.
- Board invalidation/source invalidation publish는 best-effort다. source cache commit을 Redis
  publish 실패 때문에 rollback하지 않는다.
- installation이 분리된 cache는 재연결 sync가 같은 remote identity를 재결합하기 전까지 active
  repository/ProjectV2 목록, ProjectV2 detail read, installation-scoped sync, Board write 대상이
  아니다. public ProjectV2 payload의 `installationId`는 nullable로 바꾸지 않는다.
- PR Review 제출 공개 API는 PR Review가 소유한다. 이 모듈은 PR Review가 호출하는 내부
  OAuth token/decrypt 경계와 body-only GitHub Review adapter만 제공한다. GitHub App
  `Pull requests: write` permission 부족은 safe permission error로 매핑한다.

## 관련 문서

- [GitHub Integration Feature](../../../../frontend/src/features/github-integration/README.md)
- [Board Feature](../../../../frontend/src/features/board/README.md)
- [Board Module](../board/README.md)
- [GitHub Integration API](../../../../../docs/api/github-integration-api.md)
- [Board API](../../../../../docs/api/board-api.md)
- [Realtime Server](../../../../realtime-server/README.md)
