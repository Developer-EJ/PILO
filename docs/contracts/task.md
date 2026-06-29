# Task Contract

## Owner

주형

## Scope

Task는 실제 작업 단위, 담당자, 상태, 우선순위, 마감일, 체크리스트, 댓글, 변경 이력, 의존성, Task draft, Milestone 연결을 담당한다.

## Owned Tables

- `tasks`
- `task_drafts`
- `task_checklist_items`
- `task_comments`
- `task_activity_logs`
- `task_dependencies`
- `milestones`

## Provided APIs

| Method   | Path                                           | 목적                          | Consumer                   |
| -------- | ---------------------------------------------- | ----------------------------- | -------------------------- |
| `GET`    | `/workspaces/:workspaceId/milestones`          | Milestone 목록 조회           | 주형, 세인 action executor |
| `POST`   | `/workspaces/:workspaceId/milestones`          | Milestone 생성                | 주형, 세인 action executor |
| `PATCH`  | `/milestones/:milestoneId`                     | Milestone 수정                | 주형, 세인 action executor |
| `GET`    | `/workspaces/:workspaceId/tasks`               | Task 목록/필터 조회           | 동현, 주형                 |
| `POST`   | `/workspaces/:workspaceId/tasks`               | Task 생성                     | 주형, 세인 action executor |
| `GET`    | `/tasks/:taskId`                               | Task 상세                     | 전체                       |
| `PATCH`  | `/tasks/:taskId`                               | 제목/설명/담당자/마감일 수정  | 주형                       |
| `PATCH`  | `/tasks/:taskId/status`                        | 상태 변경                     | 주형, 세인 action executor |
| `DELETE` | `/tasks/:taskId`                               | Task soft delete              | 주형                       |
| `POST`   | `/tasks/:taskId/comments`                      | 댓글 작성                     | 주형                       |
| `POST`   | `/tasks/:taskId/checklist-items`               | 체크리스트 추가               | 주형                       |
| `PATCH`  | `/tasks/:taskId/checklist-items/:itemId`       | 체크리스트 수정/완료/reorder  | 주형                       |
| `DELETE` | `/tasks/:taskId/checklist-items/:itemId`       | 체크리스트 삭제               | 주형                       |
| `POST`   | `/tasks/:taskId/dependencies`                  | 의존성 추가                   | 주형                       |
| `DELETE` | `/tasks/:taskId/dependencies/:dependsOnTaskId` | 의존성 삭제                   | 주형                       |
| `POST`   | `/workspaces/:workspaceId/task-drafts`         | 외부 후보를 Task draft로 변환 | 진호, 세인                 |
| `POST`   | `/task-drafts/:draftId/approve`                | Task draft를 실제 Task로 승인 | 주형, 세인 action executor |
| `POST`   | `/task-drafts/:draftId/reject`                 | Task draft 거절               | 주형, 세인 action executor |

## Read Models

### TaskSummary

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "milestoneId": "uuid",
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

### MilestoneSummary

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "title": "MVP Backend",
  "status": "in_progress",
  "startDate": "2026-07-01",
  "endDate": "2026-07-31",
  "updatedAt": "2026-06-27T12:00:00Z"
}
```

`status`는 `planned`, `in_progress`, `done` 중 하나다. `startDate`, `endDate`는 없으면 `null`이며, 두 값이 모두 있으면 `endDate >= startDate`여야 한다.

### TaskDependencySummary

```json
{
  "id": "uuid",
  "taskId": "uuid",
  "dependsOnTaskId": "uuid",
  "createdAt": "2026-06-28T11:00:00Z"
}
```

`taskId`는 선행 작업을 필요로 하는 Task이고, `dependsOnTaskId`는 먼저 완료되어야 하는 Task다. 두 Task는 같은 workspace에 있어야 하며, 자기 자신 의존성, 중복 의존성, cycle은 허용하지 않는다.

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

### TaskDetail

`GET /tasks/:taskId`는 `TaskSummary` 필드에 checklist를 포함한다.

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "milestoneId": "uuid",
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
  "updatedAt": "2026-06-27T12:00:00Z",
  "checklistItems": [
    {
      "id": "uuid",
      "taskId": "uuid",
      "title": "GitHub App 설치",
      "status": "todo",
      "sortOrder": 0,
      "updatedAt": "2026-06-27T12:30:00Z"
    }
  ]
}
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

### TaskDraftSummary

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
  "status": "draft",
  "taskId": null,
  "createdAt": "2026-06-28T10:00:00Z",
  "updatedAt": "2026-06-28T10:00:00Z"
}
```

`TaskCreateDraft`는 Agent action payload와 외부 후보 입력에 쓰는 request DTO다. 사용자가 승인할 때까지 원본 source는 `meeting_action_items`, `agent_actions`, 또는 planning draft owner가 보관하고, 승인 후 실제 `tasks` row 생성은 주형 API가 담당한다.

`status`는 `draft`, `approved`, `rejected` 중 하나다. `draft` 상태만 승인 또는 거절할 수 있다. 승인하면 주형의 `tasks` row가 생성되고 `taskId`가 채워진다. 거절하면 Task는 생성되지 않고 `taskId`는 `null`로 남는다.

## Write Models

### MilestoneWrite

`POST /workspaces/:workspaceId/milestones`는 `title`, 선택 `status`, 선택 `startDate`, 선택 `endDate`를 받는다. `PATCH /milestones/:milestoneId`는 이 필드 중 하나 이상을 받는다.

```json
{
  "title": "MVP Backend",
  "status": "planned",
  "startDate": "2026-07-01",
  "endDate": "2026-07-31"
}
```

### TaskUpdatePatch

`PATCH /tasks/:taskId`는 아래 필드 중 하나 이상을 받는다. `assigneeMemberId`, `description`, `dueDate`, `milestoneId`는 `null`로 비울 수 있다. `milestoneId`를 설정할 때는 같은 workspace의 Milestone만 연결할 수 있고, `null`은 연결 해제다.

```json
{
  "title": "GitHub Repository 연결",
  "description": "GitHub App 설치 후 repository를 연결한다.",
  "assigneeMemberId": "uuid",
  "dueDate": "2026-07-04",
  "milestoneId": null
}
```

### TaskStatusUpdateAction

`PATCH /tasks/:taskId/status`는 `todo`, `in_progress`, `in_review`, `done`, `blocked` 중 하나를 받는다. 상태 변경은 `task_activity_logs`에 `task.status_changed`로 기록한다.

```json
{
  "workspaceId": "uuid",
  "taskId": "uuid",
  "status": "in_review"
}
```

### TaskDraftApproval

`POST /workspaces/:workspaceId/task-drafts`는 `TaskCreateDraft`를 받아 `task_drafts`에 저장하고 `TaskDraftSummary`를 반환한다. 이 호출은 실제 Task를 생성하지 않는다.

`POST /task-drafts/:draftId/approve`는 `draft` 상태의 draft만 승인한다. 승인 시 `tasks` row를 만들고 draft를 `approved`로 닫으며, `TaskDraftSummary.taskId`에 생성된 Task id를 채운다.

`POST /task-drafts/:draftId/reject`는 `draft` 상태의 draft만 거절한다. 거절 시 Task를 생성하지 않고 draft를 `rejected`로 닫는다.

### TaskDelete

`DELETE /tasks/:taskId`는 `tasks.deleted_at`을 설정하는 soft delete다. 기본 Task 목록과 상세 조회는 삭제된 Task를 제외한다.

### TaskChecklistItemWrite

`POST /tasks/:taskId/checklist-items`는 `title`, 선택 `status`, 선택 `sortOrder`를 받는다. `PATCH /tasks/:taskId/checklist-items/:itemId`는 `title`, `status`, `sortOrder` 중 하나 이상을 받는다. `status`는 `todo`, `done` 중 하나이며, reorder는 `sortOrder` 수정으로 처리한다.

```json
{
  "title": "GitHub App 설치",
  "status": "todo",
  "sortOrder": 0
}
```

같은 Task 안에서 `sortOrder`가 충돌하면 주형 API가 기존 checklist item을 뒤로 밀어 순서를 보존한다.

### TaskDependencyWrite

`POST /tasks/:taskId/dependencies`는 `dependsOnTaskId`를 받는다. `DELETE /tasks/:taskId/dependencies/:dependsOnTaskId`는 같은 의존성 edge를 삭제한다.

```json
{
  "dependsOnTaskId": "uuid"
}
```

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

## Boundaries

- 주형만 Task 원본을 생성/수정/삭제한다.
- 진호의 `meeting_action_items`는 Task 후보일 뿐이다. 실제 Task 저장은 주형 API 또는 세인 Agent action executor를 통해 처리한다.
- 동현 Canvas/Dashboard는 `TaskSummary`만 사용한다.
- 은재 Review는 PR과 연결된 `TaskSummary`만 소비한다.

## Mock Rule

Task API 미구현 시 consumer는 `TaskSummary` fixture를 사용한다. 임시 `tasks` table이나 별도 Task store를 만들지 않는다.
