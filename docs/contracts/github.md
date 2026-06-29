# GitHub Contract

## Owner

주형

## Scope

GitHub Repository 연결, Issue/PR 동기화, Task-Issue/PR 매핑을 담당한다.

MVP의 Repository 연동 방식은 GitHub App 설치 기반이다. GitHub OAuth는 로그인 수단으로는 동현 Auth가 소유하지만, repository scope OAuth는 MVP 범위에서 사용하지 않는다. 나중에 OAuth 기반 repository 권한을 추가하려면 별도 contract change Issue를 만든다.

## Owned Tables

- `github_connections`
- `github_repositories`
- `github_issues`
- `github_issue_labels`
- `task_github_issues`
- `pull_requests`
- `task_pull_requests`

## Provided APIs

| Method | Path | 목적 |
|---|---|---|
| `POST` | `/workspaces/:workspaceId/github/connections` | GitHub App 설치 flow 시작 |
| `GET` | `/github/app/callback` | GitHub App 설치 callback 처리 |
| `GET` | `/workspaces/:workspaceId/github/connections` | Workspace GitHub 연결 상태 조회 |
| `DELETE` | `/workspaces/:workspaceId/github/connections/:connectionId` | GitHub 연결 해제 또는 revoked 처리 |
| `GET` | `/workspaces/:workspaceId/github/repositories` | 연결 저장소 목록 |
| `POST` | `/workspaces/:workspaceId/github/repositories/sync` | 저장소 동기화 |
| `GET` | `/repositories/:repositoryId/issues` | Issue 목록 |
| `POST` | `/tasks/:taskId/github-issues` | Task에서 Issue 생성/연결 |
| `GET` | `/repositories/:repositoryId/pull-requests` | PR 목록 |
| `GET` | `/pull-requests/:pullRequestId/changed-files` | PR changed file/diff source metadata 조회 |
| `POST` | `/tasks/:taskId/pull-requests/:pullRequestId` | Task와 PR 연결 |
| `POST` | `/github/webhooks` | GitHub webhook 수신 |

Workspace 단위 연결과 repository 목록은 `/workspaces/:workspaceId/github/*` 아래에 둔다. 특정 repository의 Issue/PR 목록은 이미 저장된 PILO `github_repositories.id`를 기준으로 `/repositories/:repositoryId/*`에서 조회한다.

### Repository Sync Preconditions

`POST /workspaces/:workspaceId/github/repositories/sync` requires at least one active GitHub App connection for the workspace. An active GitHub App connection has `installationId` set and is not revoked. If no active GitHub App connection exists, the API returns `409 Conflict` with `Active GitHub App connection is required before repository sync`. A successful `200 []` means the provider sync ran and returned no repositories.

### GitHub App Callback Binding

`POST /workspaces/:workspaceId/github/connections` creates a pending install intent that stores `workspaceId` with a single-use `state/nonce`. `GET /github/app/callback` must verify that `state/nonce`, recover the same `workspaceId`, and persist the resulting `installationId -> workspaceId` binding on `github_connections`. A callback without a valid `state/nonce` is rejected, and an existing `installationId` cannot be attached to another workspace without a new connection flow.

## Owner-Internal API Responses

`GithubConnectionStartResponse` is owned by the 주형 GitHub connection flow and is not a cross-domain public read model.

### GithubConnectionStartResponse

```json
{
  "state": "single-use-nonce",
  "installationUrl": "https://github.com/apps/pilo/installations/new?state=single-use-nonce"
}
```

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
  "connectedAt": "2026-06-27T12:00:00Z",
  "revokedAt": null
}
```

### GithubRepositorySummary

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "owner": "team-org",
  "repoName": "pilo",
  "url": "https://github.com/team-org/pilo",
  "defaultBranch": "dev",
  "syncedAt": "2026-06-27T12:00:00Z"
}
```

### GithubIssueSummary

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
  "syncedAt": "2026-06-27T12:00:00Z"
}
```

### PullRequestSummary

```json
{
  "id": "uuid",
  "repositoryId": "uuid",
  "number": 33,
  "title": "feat: task api",
  "authorLogin": "github-user",
  "state": "review_requested",
  "branch": "feat/task-api",
  "baseBranch": "dev",
  "url": "https://github.com/org/repo/pull/33",
  "changedFilesCount": 8,
  "additions": 200,
  "deletions": 40,
  "linkedTaskIds": ["uuid"],
  "syncedAt": "2026-06-27T12:00:00Z"
}
```

### PullRequestChangedFileSummary

Review domain consumes this source read model to create its own `changed_files`. It is GitHub PR source metadata, not a Review analysis result. `changed_functions` is Review-owned analysis output and is not guaranteed by this GitHub contract.

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
  "sourceSyncedAt": "2026-06-27T12:00:00Z"
}
```

`patch` can be `null` for binary files, very large files, or provider responses that omit a patch. Review keeps `patch: null` entries as file-level `changed_files`, but excludes them from `changed_functions` extraction. Review may derive `changed_functions` only from entries with non-null `patch` or from a separate Review-owned analysis source. Review must treat `pullRequestId + path + sha` as source identity when creating changed-file records.

### GithubIssueCreateAction

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

- `github.repository_connected`
- `github.issue_synced`
- `github.issue_linked_to_task`
- `github.pr_synced`
- `github.pr_linked_to_task`
- `github.pr_merged`

## Consumed By

- 동현 Dashboard/Canvas: `GithubIssueSummary`, `PullRequestSummary`
- 은재 Review: `PullRequestSummary`, `PullRequestChangedFileSummary`, Task-PR links
- 세인 Agent: `GithubIssueCreateAction`

## Boundaries

- Review consumes `PullRequestChangedFileSummary` for changed file/diff source metadata and owns `changed_files`. Review owns `changed_functions` extraction and derives it only from non-null `patch` entries or a separate Review-owned analysis source.

- GitHub 로그인은 동현 Auth이고, Repository 권한/동기화는 주형 GitHub이다.
- Repository 연동은 GitHub App installation id와 app private key로 처리한다.
- GitHub App private key와 webhook secret은 env 또는 Secrets Manager에서만 읽고 DB에 저장하지 않는다.
- 은재는 PR 원본을 직접 GitHub에서 가져오지 않는다. `PullRequestSummary`와 `pull_requests.id`를 사용한다.
- 동현 Canvas/Dashboard는 GitHub 원본 테이블을 직접 읽지 않고 summary API를 사용한다.

## Breaking Change Policy

- `GithubConnectionSummary`, `GithubRepositorySummary`, `PullRequestSummary`, and `PullRequestChangedFileSummary` fields are public read model contract fields.
- Removing or renaming fields requires a separate contract change PR, affected consumer review, and a deprecated-field migration plan.
- `PullRequestChangedFileSummary.sha` is required because Review uses `pullRequestId + path + sha` as stable source identity for resync.

## Mock Rule

Repository sync can use `docs/contracts/fixtures/github-repositories.fixture.json` as the contract-compatible stub until a live GitHub API client is introduced. Stub rows must follow `GithubRepositorySummary`.

Review 화면이 PR diff보다 먼저 필요하면 `PullRequestSummary`와 `PullRequestChangedFileSummary` fixture를 사용한다. GitHub token, webhook secret, repository sync 구현을 은재가 임시로 만들지 않는다.
