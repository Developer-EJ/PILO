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
| `POST` | `/tasks/:taskId/pull-requests/:pullRequestId` | Task와 PR 연결 |
| `POST` | `/github/webhooks` | GitHub webhook 수신 |

Workspace 단위 연결과 repository 목록은 `/workspaces/:workspaceId/github/*` 아래에 둔다. 특정 repository의 Issue/PR 목록은 이미 저장된 PILO `github_repositories.id`를 기준으로 `/repositories/:repositoryId/*`에서 조회한다.

## Read Models

### GithubConnectionSummary

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "provider": "github_app",
  "installationId": "12345678",
  "githubAccountLogin": "team-org",
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

### GithubIssueCreateAction

```json
{
  "workspaceId": "uuid",
  "taskId": "uuid",
  "repositoryId": "uuid",
  "title": "Task API 구현",
  "body": "PILO Task contract 기준으로 Task 생성/목록/상세 API를 구현한다.",
  "labels": ["backend"],
  "assignees": ["github-user"]
}
```

## Events

- `github.repository_connected`
- `github.issue_synced`
- `github.issue_linked_to_task`
- `github.pr_synced`
- `github.pr_linked_to_task`
- `github.pr_merged`

## Boundaries

- GitHub 로그인은 동현 Auth이고, Repository 권한/동기화는 주형 GitHub이다.
- Repository 연동은 GitHub App installation id와 app private key로 처리한다.
- GitHub App private key와 webhook secret은 env 또는 Secrets Manager에서만 읽고 DB에 저장하지 않는다.
- 은재는 PR 원본을 직접 GitHub에서 가져오지 않는다. `PullRequestSummary`와 `pull_requests.id`를 사용한다.
- 동현 Canvas/Dashboard는 GitHub 원본 테이블을 직접 읽지 않고 summary API를 사용한다.

## Mock Rule

Review 화면이 먼저 필요하면 `PullRequestSummary` fixture를 사용한다. GitHub token, webhook secret, repository sync 구현을 은재가 임시로 만들지 않는다.

