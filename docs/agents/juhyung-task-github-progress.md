# 주형 Agent Brief: Task / GitHub / Progress

## Mission

주형은 PILO의 실제 작업 단위와 GitHub 연결을 책임진다. Task, milestone, GitHub Issue/PR 원본, progress 계산은 주형이 소유한다.

## Must Read

- `docs/contracts/task.md`
- `docs/contracts/github.md`
- `docs/contracts/progress.md`
- `docs/contracts/agent-actions.md`
- `docs/db/db-schema-by-owner.md`

## Owned Data

- `milestones`
- `tasks`
- `task_checklist_items`
- `task_comments`
- `task_activity_logs`
- `task_dependencies`
- `github_connections`
- `github_repositories`
- `github_issues`
- `github_issue_labels`
- `task_github_issues`
- `pull_requests`
- `task_pull_requests`
- `progress_snapshots`

## Suggested Paths

- Frontend: `apps/frontend/app/(workspace)/tasks`, `apps/frontend/components/task`, `apps/frontend/components/github`
- App Server: `apps/app-server/src/modules/juhyung`
- Public adapters: `apps/app-server/src/modules/juhyung/juhyung-public.adapter.ts`, `apps/app-server/src/modules/juhyung/juhyung-public.types.ts`

Do not create sibling `apps/app-server/src/modules/task`,
`apps/app-server/src/modules/github`, or `apps/app-server/src/modules/progress`
modules in implementation PRs. Those names are future refactor targets only and
need a separate contract/spec/infra hygiene PR before use.

## Implement First

1. Task CRUD with status, priority, assignee, due date.
2. Task checklist, comments, activity log.
3. Milestone list and task milestone connection.
4. Task draft approval/rejection from meeting and Agent sources.
5. GitHub App repository connection model and repository list.
6. GitHub issue and PR sync stubs.
7. Task to issue and task to PR mapping.
8. Progress summary calculation and snapshot as a Deferred API. Dashboard and
   Agent consumers may use only explicitly marked fixture/mock progress until a
   runtime controller lands.

## Current Runtime APIs

- `GET /api/workspaces/:workspaceId/tasks` returns `TaskSummary[]`.
- `POST /api/workspaces/:workspaceId/tasks` creates task.
- `GET /api/tasks/:taskId` returns task detail.
- `PATCH /api/tasks/:taskId` updates task fields, including `assigneeMemberId`.
- `PATCH /api/tasks/:taskId/status` updates task status.
- `DELETE /api/tasks/:taskId` soft-deletes task.
- `POST /api/workspaces/:workspaceId/task-drafts` creates `TaskDraft`.
- `POST /api/task-drafts/:draftId/approve` creates task from approved draft.
- `POST /api/task-drafts/:draftId/reject` rejects task draft.
- Internal TaskDraft public write adapter creates `TaskDraftSummary` for Agent
  `task.create.draft` execution by reusing the current TaskDraft service
  validation and creation path. This is not a public HTTP route and does not
  approve drafts or create Tasks.
- `GET /api/workspaces/:workspaceId/milestones` returns `MilestoneSummary[]`.
- `POST /api/workspaces/:workspaceId/milestones` creates milestone.
- `PATCH /api/milestones/:milestoneId` updates milestone.
- `POST /api/workspaces/:workspaceId/github/connections` starts GitHub App install flow.
- `GET /api/workspaces/:workspaceId/github/connections` returns GitHub App connection status.
- `DELETE /api/workspaces/:workspaceId/github/connections/:connectionId` revokes a connection.
- `GET /api/github/app/callback` completes GitHub App install callback.

## Deferred APIs

- `GET /api/workspaces/:workspaceId/task-drafts` returns Task draft list.
- `GET /api/workspaces/:workspaceId/github/repositories` returns `GithubRepositorySummary[]`.
- `POST /api/workspaces/:workspaceId/github/repositories/sync` syncs repositories.
- `POST /api/tasks/:taskId/github-issues` creates or links issue.
- `GET /api/repositories/:repositoryId/issues` returns `GithubIssueSummary[]`.
- `GET /api/repositories/:repositoryId/pull-requests` returns `PullRequestSummary[]`.
- `GET /api/pull-requests/:pullRequestId/changed-files` returns `PullRequestChangedFileSummary[]`.
- `GET /api/workspaces/:workspaceId/progress/summary` returns `ProgressSummary`.
- `GET /api/workspaces/:workspaceId/progress/history` returns `ProgressSnapshotSummary[]`.
- Agent action executor for `task.update.status`, `github.issue.create`.

Progress is an MVP Target read model, not Current Runtime. Do not wire
Dashboard/Agent to these Progress endpoints until the 주형 runtime controller,
repository, and tests exist.

## External Callbacks

- `GET /api/github/app/callback` completes GitHub App install flow.

## Provides To Others

- 동현: Task, GitHub Issue, PR, Progress summary for Dashboard and Canvas.
- 진호: API to convert meeting action item into task draft.
- 은재: PR original metadata via `PullRequestSummary`, changed file source via `PullRequestChangedFileSummary`, and Task-PR links.
- 세인: executable action contracts for task and GitHub operations.

## Consumes From Others

- 동현: Workspace and member identity.
- 진호: Meeting action item source refs.
- 세인: Agent action requests.

## Mock Rule

GitHub App integration이 늦어지면 repository, issue, PR, PR changed file source는 fixture-backed sync stub으로 구현한다. stub은 실제 `GithubIssueSummary`, `PullRequestSummary`, `PullRequestChangedFileSummary` 필드와 동일해야 하며, PR에는 GitHub 실제 연동 Issue를 연결한다.

## Do Not Touch

- 로그인 provider와 session 생성.
- Canvas shape 위치 저장.
- Meeting transcript/report 생성.
- PR diff 분석 결과 생성.
- Agent runtime 내부 queue 처리.

## Done

- Task CRUD가 workspace member 기준 권한을 확인한다.
- Progress summary가 task 상태와 due date로 계산된다.
- GitHub 원본 데이터와 Task mapping이 분리되어 있다.
- 은재가 PR 분석을 시작할 수 있는 PR summary를 제공한다.
- 동현이 Dashboard와 Canvas에서 쓸 summary endpoint가 있다.
