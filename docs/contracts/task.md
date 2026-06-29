# Task Contract

## Owner

주형

## Scope

Task는 실제 작업 단위, 담당자, 상태, 우선순위, 마감일, 체크리스트, 댓글, 변경 이력, 의존성, Task draft, Milestone 연결을 담당한다.

## Owned Tables

- `tasks`
- `task_checklist_items`
- `task_comments`
- `task_activity_logs`
- `task_dependencies`
- `milestones`

## Provided APIs

| Method | Path | 목적 | Consumer |
|---|---|---|---|
| `GET` | `/workspaces/:workspaceId/tasks` | Task 목록/필터 조회 | 동현, 주형 |
| `POST` | `/workspaces/:workspaceId/tasks` | Task 생성 | 주형, 세인 action executor |
| `GET` | `/workspaces/:workspaceId/task-drafts` | Task draft 목록 조회 | 주형, 진호, 세인 |
| `POST` | `/workspaces/:workspaceId/task-drafts` | 외부 후보를 Task draft로 변환 | 진호, 세인 |
| `POST` | `/task-drafts/:draftId/approve` | Task draft 승인 후 실제 Task 생성 | 주형, 세인 action executor |
| `POST` | `/task-drafts/:draftId/reject` | Task draft 거절 | 주형, 세인 action executor |
| `GET` | `/workspaces/:workspaceId/milestones` | Milestone 목록 조회 | 동현, 주형, 세인 |
| `POST` | `/workspaces/:workspaceId/milestones` | Milestone 생성 | 주형, 세인 planning approve |
| `GET` | `/milestones/:milestoneId` | Milestone 상세 조회 | 주형, 동현 |
| `PATCH` | `/milestones/:milestoneId` | Milestone 제목/일정/상태 수정 | 주형 |
| `GET` | `/tasks/:taskId` | Task 상세 | 전체 |
| `PATCH` | `/tasks/:taskId` | 제목/설명/담당자/마감일/마일스톤 수정 | 주형 |
| `DELETE` | `/tasks/:taskId` | Task soft delete | 주형 |
| `PATCH` | `/tasks/:taskId/status` | 상태 변경 | 주형, 세인 action executor |
| `POST` | `/tasks/:taskId/comments` | 댓글 작성 | 주형 |
| `POST` | `/tasks/:taskId/checklist-items` | 체크리스트 추가 | 주형 |
| `PATCH` | `/tasks/:taskId/checklist-items/:itemId` | 체크리스트 제목/상태/순서 수정 | 주형 |
| `DELETE` | `/tasks/:taskId/checklist-items/:itemId` | 체크리스트 삭제 | 주형 |
| `POST` | `/tasks/:taskId/dependencies` | 의존성 추가 | 주형 |
| `DELETE` | `/tasks/:taskId/dependencies/:dependencyId` | 의존성 삭제 | 주형 |

Task 목록 API는 `status`, `assigneeMemberId`, `priority`, `dueBefore`, `dueAfter`, `milestoneId`, `page`, `pageSize`, `sort` query를 지원할 수 있다. 구현 PR에서 일부 query를 나중으로 미루면 PR 본문에 deferred field와 후속 Issue를 적는다.

## Read Models

### TaskSummary

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "title": "GitHub Repository 연결",
  "status": "in_progress",
  "priority": "high",
  "assignee": {
    "memberId": "uuid",
    "name": "주형"
  },
  "dueDate": "2026-07-03",
  "isDelayed": false,
  "linkedIssueCount": 1,
  "linkedPrCount": 1,
  "updatedAt": "2026-06-27T12:00:00Z"
}
```

### TaskListQuery

`GET /workspaces/:workspaceId/tasks`는 기본적으로 삭제되지 않은 Task를 `updatedAt desc`로 최대 50개 반환한다.

| Query              | Type                                                               | 설명                            |
| ------------------ | ------------------------------------------------------------------ | ------------------------------- |
| `status`           | `todo,in_progress,in_review,done,blocked` 또는 반복 param          | 상태 필터                       |
| `assigneeMemberId` | `uuid`                                                             | 담당자 필터                     |
| `priority`         | `low,medium,high,urgent` 또는 반복 param                           | 우선순위 필터                   |
| `dueDateFrom`      | `YYYY-MM-DD`                                                       | 마감일 시작 범위                |
| `dueDateTo`        | `YYYY-MM-DD`                                                       | 마감일 종료 범위                |
| `milestoneId`      | `uuid`                                                             | milestone 필터                  |
| `sortBy`           | `updatedAt`, `createdAt`, `dueDate`, `priority`, `status`, `title` | 정렬 기준. 기본값은 `updatedAt` |
| `sortDirection`    | `asc`, `desc`                                                      | 정렬 방향. 기본값은 `desc`      |
| `limit`            | `1..100`                                                           | 반환 개수. 기본값은 `50`        |
| `offset`           | `0..`                                                              | 건너뛸 개수. 기본값은 `0`       |

```text
GET /workspaces/:workspaceId/tasks?status=todo,in_progress&priority=high&dueDateFrom=2026-07-01&dueDateTo=2026-07-31&sortBy=dueDate&sortDirection=asc&limit=25&offset=50
```

### TaskCreateDraft

```json
{
  "workspaceId": "uuid",
  "sourceType": "meeting_action_item",
  "sourceId": "uuid",
  "title": "OAuth callback 처리",
  "description": "Google/GitHub callback을 처리한다.",
  "assigneeMemberId": "uuid",
  "priority": "high",
  "dueDate": "2026-07-03"
}
```

`TaskCreateDraft`는 Agent action payload와 외부 후보 입력에 쓰는 request DTO다. 사용자가 승인할 때까지 원본 source는 `meeting_action_items`, `agent_actions`, 또는 planning draft owner가 보관하고, 승인 후 실제 `tasks` row 생성은 주형 API가 담당한다.

### TaskDraft

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "sourceType": "meeting_action_item",
  "sourceId": "uuid",
  "title": "OAuth callback 처리",
  "description": "Google/GitHub callback을 처리한다.",
  "assigneeMemberId": "uuid",
  "priority": "high",
  "dueDate": "2026-07-03",
  "status": "waiting_confirmation",
  "createdAt": "2026-06-27T12:00:00Z"
}
```

### MilestoneSummary

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "title": "MVP 1차 구현",
  "startDate": "2026-07-01",
  "endDate": "2026-07-14",
  "status": "in_progress",
  "taskCount": 12,
  "doneTaskCount": 5
}
```

### TaskStatusUpdateAction

```json
{
  "workspaceId": "uuid",
  "taskId": "uuid",
  "status": "in_review"
}
```

## Write Models

### TaskUpdatePatch

`PATCH /tasks/:taskId`는 아래 필드 중 하나 이상을 받는다. `assigneeMemberId`, `description`, `dueDate`, `milestoneId`는 `null`로 비울 수 있다.

```json
{
  "title": "GitHub Repository 연결",
  "description": "GitHub App 설치 후 repository를 연결한다.",
  "assigneeMemberId": "uuid",
  "dueDate": "2026-07-04",
  "milestoneId": null
}
```

### TaskStatusUpdate

`PATCH /tasks/:taskId/status`는 `todo`, `in_progress`, `in_review`, `done`, `blocked` 중 하나를 받는다. 상태 변경은 `task_activity_logs`에 `task.status_changed`로 기록한다.

```json
{
  "status": "in_review"
}
```

### TaskDelete

`DELETE /tasks/:taskId`는 `tasks.deleted_at`을 설정하는 soft delete다. 기본 Task 목록과 상세 조회는 삭제된 Task를 제외한다.

## Events

- `task.created`
- `task.updated`
- `task.status_changed`
- `task.assignee_changed`
- `task.linked_to_github_issue`
- `task.linked_to_pull_request`

## Agent Actions Consumed

- `task.create.draft`
- `task.update.status`
- `task.assign`

## Boundaries

- 주형만 Task 원본을 생성/수정/삭제한다.
- 진호의 `meeting_action_items`는 Task 후보일 뿐이다. 실제 Task 저장은 주형 API 또는 세인 Agent action executor를 통해 처리한다.
- 동현 Canvas/Dashboard는 `TaskSummary`만 사용한다.
- 은재 Review는 PR과 연결된 `TaskSummary`만 소비한다.

## Mock Rule

Task API 미구현 시 consumer는 `TaskSummary` fixture를 사용한다. 임시 `tasks` table이나 별도 Task store를 만들지 않는다.
