# GitHub Contract

## Owner

주형

## Scope

GitHub App 설치 연결, 연결 상태 조회, 연결 해제를 담당한다.

Issue/PR 동기화, Task-Issue/PR 매핑, changed file 제공, webhook 처리는 public
read model과 schema 후보가 있지만 현재 `temp-dev` app-server controller에는 없다.
구현 전까지는 Current Runtime API로 취급하지 않는다.

MVP의 Repository 연동 방식은 GitHub App 설치 기반이다. GitHub OAuth는 로그인
수단으로는 동현 Auth가 소유하지만, repository scope OAuth는 MVP 범위에서 사용하지
않는다. 나중에 OAuth 기반 repository 권한을 추가하려면 별도 contract change Issue를
만든다.

## Owned Tables

- `github_connections`
- `github_repositories`
- `github_issues`
- `github_issue_labels`
- `task_github_issues`
- `pull_requests`
- `task_pull_requests`

## Current Runtime APIs

현재 `temp-dev` app-server controller에 구현된 API만 여기에 둔다.

| Method | Path | Purpose | Consumer |
|---|---|---|---|
| `POST` | `/api/workspaces/:workspaceId/github/connections` | GitHub App 설치 flow 시작 | 주형, 동현 설정 UI |
| `GET` | `/api/workspaces/:workspaceId/github/connections` | Workspace GitHub 연결 상태 조회 | 주형, 동현 설정 UI |
| `DELETE` | `/api/workspaces/:workspaceId/github/connections/:connectionId` | GitHub 연결 해제 또는 revoked 처리 | 주형, 동현 설정 UI |
| `GET` | `/api/github/app/callback` | GitHub App 설치 callback 처리 | GitHub App redirect |

Note: app-server uses the global `api` prefix. Controller decorators keep only domain-relative paths, but public runtime paths are `/api/...`.

Authorization note:

- Current runtime connection APIs require Workspace membership. They do not yet
  enforce the MVP Target Owner-only policy for repository connect/change/revoke.
- `docs/domain-boundary-v1.md` treats repository connect/change as Owner target
  behavior. Before implementation freeze, a 주형 runtime authorization PR must
  either enforce Owner-only on connection mutation or explicitly reclassify that
  permission in the MVP scope.
- Deferred repository list/sync, Issue, PR, changed-file, and webhook APIs must
  require both Workspace membership and an active non-revoked GitHub App
  connection when they land.

## Deferred APIs

아래 API는 문서/fixture/schema 후보이지만 현재 `temp-dev` controller에는 없다.
다른 팀은 이 API를 현재 호출하면 안 된다.

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/workspaces/:workspaceId/github/repositories` | deferred | 연결 저장소 목록 조회 후속 PR 필요 |
| `POST` | `/api/workspaces/:workspaceId/github/repositories/sync` | deferred | provider sync 후속 PR 필요 |
| `GET` | `/api/repositories/:repositoryId/issues` | deferred | Issue 목록 API 후속 PR 필요 |
| `POST` | `/api/tasks/:taskId/github-issues` | deferred | Task에서 Issue 생성/연결 후속 PR 필요 |
| `GET` | `/api/repositories/:repositoryId/pull-requests` | deferred | PR 목록 API 후속 PR 필요 |
| `GET` | `/api/pull-requests/:pullRequestId/changed-files` | deferred | Review가 소비할 changed file source 후속 PR 필요 |
| `POST` | `/api/tasks/:taskId/pull-requests/:pullRequestId` | deferred | Task-PR 연결 후속 PR 필요 |
| `POST` | `/api/github/webhooks` | deferred | webhook 수신 후속 PR 필요 |

### Repository Sync Preconditions

`POST /api/workspaces/:workspaceId/github/repositories/sync`가 구현되면 workspace에는
active GitHub App connection이 최소 1개 있어야 한다. Active connection은
`installationId`가 있고 revoked 되지 않은 `github_connections` row다. Active
GitHub App connection이 없으면 API는 `409 Conflict`와
`Active GitHub App connection is required before repository sync`를 반환해야 한다.
성공적인 `200 []`는 provider sync가 실행됐고 provider가 repository를 반환하지
않았다는 뜻이다.

## Request / Response Rules

### StartGithubConnectionRequest

`POST /api/workspaces/:workspaceId/github/connections`

현재 body는 optional이다. GitHub App 설치 URL을 생성하고, 단일 사용 `state`를
저장한다.

```json
{}
```

### GithubConnectionStartResponse

이 응답은 GitHub connection flow의 owner-internal response이며, cross-domain
read model이 아니다.

```json
{
  "state": "single-use-nonce",
  "installationUrl": "https://github.com/apps/pilo/installations/new?state=single-use-nonce"
}
```

### GitHub App Callback Query

`GET /api/github/app/callback`

Accepted query fields:

- `state`
- `installation_id` 또는 `installationId`
- `account_login` 또는 `github_account_login`
- `scopes`

`scopes`는 comma-separated string으로 받을 수 있다.

### GitHub App Callback Binding

`POST /api/workspaces/:workspaceId/github/connections`는 pending install intent를 만들고
`workspaceId`를 `state/nonce`에 묶는다. `GET /api/github/app/callback`은 `state/nonce`를
검증해 같은 `workspaceId`를 복원하고, `installationId -> workspaceId` binding을
`github_connections`에 저장한다.

규칙:

- 유효하지 않은 `state/nonce` callback은 거절한다.
- 이미 다른 workspace에 연결된 `installationId`는 새 연결 flow 없이 재사용할 수 없다.
- revoke된 연결은 active connection으로 취급하지 않는다.

## Provided Read Models

### GithubConnectionSummary

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "provider": "github_app",
  "installationId": "12345678",
  "githubAccountLogin": "team-org",
  "scopes": ["metadata", "contents"],
  "connectedAt": "2026-06-27T12:00:00.000Z",
  "revokedAt": null
}
```

### GithubRepositorySummary

Deferred API read model. Schema/fixture consumers may use it for mocks, but
runtime consumers must not assume a repository list API exists until the
deferred API lands.

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "owner": "team-org",
  "repoName": "pilo",
  "url": "https://github.com/team-org/pilo",
  "defaultBranch": "temp-dev",
  "syncedAt": "2026-06-27T12:00:00.000Z"
}
```

### GithubIssueSummary

Deferred API read model.

```json
{
  "id": "uuid",
  "repositoryId": "uuid",
  "number": 12,
  "title": "Task API 구현",
  "state": "open",
  "url": "https://github.com/org/repo/issues/12",
  "labels": ["backend"],
  "linkedTaskId": "uuid",
  "syncedAt": "2026-06-27T12:00:00.000Z"
}
```

### PullRequestSummary

Deferred API read model. 은재 Review의 현재 mock/fixture 경계에서는 사용할 수
있지만, runtime PR list API는 아직 없다.

```json
{
  "id": "uuid",
  "repositoryId": "uuid",
  "number": 33,
  "title": "feat: task api",
  "authorLogin": "github-user",
  "state": "review_requested",
  "branch": "feat/task-api",
  "baseBranch": "temp-dev",
  "url": "https://github.com/org/repo/pull/33",
  "changedFilesCount": 8,
  "additions": 200,
  "deletions": 40,
  "linkedTaskIds": ["uuid"],
  "syncedAt": "2026-06-27T12:00:00.000Z"
}
```

### PullRequestChangedFileSummary

Deferred API read model. Review domain consumes this source read model to create
its own `changed_files` after the GitHub changed-files API lands. It is GitHub PR
source metadata, not a Review analysis result. `changed_functions` is
Review-owned analysis output and is not guaranteed by this GitHub contract.

```json
{
  "pullRequestId": "uuid",
  "path": "apps/app-server/src/modules/task/task.service.ts",
  "previousPath": null,
  "status": "modified",
  "additions": 42,
  "deletions": 8,
  "changes": 50,
  "patch": "@@ -10,7 +10,9 @@",
  "sha": "abc123",
  "blobUrl": "https://github.com/org/repo/blob/sha/apps/app-server/src/modules/task/task.service.ts",
  "rawUrl": "https://github.com/org/repo/raw/sha/apps/app-server/src/modules/task/task.service.ts",
  "sourceSyncedAt": "2026-06-27T12:00:00.000Z"
}
```

`patch` can be `null` for binary files, very large files, or provider responses
that omit a patch. Review keeps `patch: null` entries as file-level
`changed_files`, but excludes them from `changed_functions` extraction. Review may
derive `changed_functions` only from entries with non-null `patch` or from a
separate Review-owned analysis source. Review must treat `pullRequestId + path +
sha` as source identity when creating changed-file records.

### GithubIssueCreateAction

Deferred action payload.

```json
{
  "workspaceId": "uuid",
  "taskId": "uuid",
  "repositoryId": "uuid",
  "title": "Task API 구현",
  "body": "PILO Task contract 기준으로 Task 생성/목록/상세 API를 구현한다.",
  "labels": ["backend"]
}
```

## Events

- `github.connection_started`
- `github.connection_completed`
- `github.connection_revoked`
- `github.repository_connected`
- `github.issue_synced`
- `github.issue_linked_to_task`
- `github.pr_synced`
- `github.pr_linked_to_task`
- `github.pr_merged`

## Consumed By

- 동현 settings UI: `GithubConnectionSummary`
- 동현 Dashboard/Canvas: deferred `GithubIssueSummary`, `PullRequestSummary`
- 은재 Review: deferred `PullRequestSummary`, `PullRequestChangedFileSummary`
- 세인 Agent: deferred `GithubIssueCreateAction`

## Boundaries

- Auth 로그인용 GitHub OAuth는 동현 Auth가 소유한다.
- GitHub repository/issue/PR source data는 주형 GitHub domain이 소유한다.
- Review는 PR 분석 결과를 소유하지만 GitHub provider sync를 소유하지 않는다.
- Task는 Task 원본을 소유하지만 GitHub provider connection을 소유하지 않는다.
- GitHub login OAuth is not sufficient for repository access. Runtime provider access must be based on Workspace membership plus an active non-revoked GitHub App connection.

## Breaking Change Policy

- `GithubConnectionSummary`, `GithubRepositorySummary`, `GithubIssueSummary`,
  `PullRequestSummary`, `PullRequestChangedFileSummary`, and
  `GithubIssueCreateAction` fields are public contract fields.
- Removing or renaming fields requires a separate contract change PR, affected
  consumer review, and a deprecated-field migration plan.
- `GithubConnectionSummary.scopes`, `GithubRepositorySummary.defaultBranch`, and
  `GithubRepositorySummary.syncedAt` are additive optional rollout fields.
  Existing producers may omit them or send `null` where the schema allows it
  until all consumers migrate. Making them required requires a separate breaking contract PR with affected consumer approval and a migration plan.
- `PullRequestChangedFileSummary.sha` is required because Review uses
  `pullRequestId + path + sha` as stable source identity for resync.

## Mock Rule

repository/issue/PR API가 구현되기 전까지 consumer는 GitHub contract fixture와
`PullRequestSummary`, `PullRequestChangedFileSummary` read model shape를 사용한다.
임시 GitHub 원본 table이나 provider token 저장소를 다른 도메인에 만들지 않는다.
