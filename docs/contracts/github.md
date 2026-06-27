# GitHub Contract

## Owner

주형

## Scope

GitHub Repository 연결, Issue/PR 동기화, Task-Issue/PR 매핑을 담당한다.

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
| `POST` | `/workspaces/:workspaceId/github/connections` | GitHub App/OAuth 연결 시작 |
| `GET` | `/workspaces/:workspaceId/github/repositories` | 연결 저장소 목록 |
| `POST` | `/workspaces/:workspaceId/github/repositories/sync` | 저장소 동기화 |
| `GET` | `/repositories/:repositoryId/issues` | Issue 목록 |
| `POST` | `/tasks/:taskId/github-issues` | Task에서 Issue 생성/연결 |
| `GET` | `/repositories/:repositoryId/pull-requests` | PR 목록 |
| `POST` | `/tasks/:taskId/pull-requests/:pullRequestId` | Task와 PR 연결 |
| `POST` | `/github/webhooks` | GitHub webhook 수신 |

## Read Models

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

## Events

- `github.repository_connected`
- `github.issue_synced`
- `github.issue_linked_to_task`
- `github.pr_synced`
- `github.pr_linked_to_task`
- `github.pr_merged`

## Boundaries

- GitHub 로그인은 동현 Auth이고, Repository 권한/동기화는 주형 GitHub이다.
- 은재는 PR 원본을 직접 GitHub에서 가져오지 않는다. `PullRequestSummary`와 `pull_requests.id`를 사용한다.
- 동현 Canvas/Dashboard는 GitHub 원본 테이블을 직접 읽지 않고 summary API를 사용한다.

## Mock Rule

Review 화면이 먼저 필요하면 `PullRequestSummary` fixture를 사용한다. GitHub token, webhook secret, repository sync 구현을 은재가 임시로 만들지 않는다.

