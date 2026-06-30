# Task / Milestone Contract

## Owner

주형

## Scope

Task는 실제 작업 단위, 담당자, 상태, 우선순위, 마감일, 체크리스트,
댓글, 변경 이력, 의존성, Milestone 연결을 담당한다.

`TaskCreateDraft`와 `TaskDraft`는 현재 app-server runtime API와 SQL baseline에 포함되어 있다.
진호 Meeting이나 세인 Agent가 Task 후보를 만들 때는 주형의 Task draft API를 사용한다.
이 rebaseline 이후 public contract에서는 legacy candidate naming을 쓰지 않는다.
옛 candidate 개념은 `TaskCreateDraft` request 또는 저장된 `TaskDraft`로 읽는다.

## Owned Tables

- `tasks`
- `task_checklist_items`
- `task_comments`
- `task_activity_logs`
- `task_dependencies`
- `task_drafts`
- `milestones`

## Base Path

app-server uses the global `api` prefix. Current runtime paths in this document are listed as `/api/...`.

## Current Runtime APIs

현재 `dev` app-server controller에 구현된 API만 여기에 둔다.

### Milestone

| Method | Path | Purpose | Consumer |
|---|---|---|---|
| `GET` | `/api/workspaces/:workspaceId/milestones` | Workspace Milestone 목록 조회 | 동현, 주형, 세인 |
| `POST` | `/api/workspaces/:workspaceId/milestones` | Milestone 생성 | 주형, 세인 planning approve |
| `PATCH` | `/api/milestones/:milestoneId` | Milestone 제목/일정/상태 수정 | 주형 |

현재 controller에는 `GET /api/milestones/:milestoneId`가 없다. 단건 조회가 필요하면
후속 API PR에서 추가해야 한다.

### Task

| Method | Path | Purpose | Consumer |
|---|---|---|---|
| `GET` | `/api/workspaces/:workspaceId/tasks` | Task 목록/필터 조회 | 동현, 주형, 세인 |
| `POST` | `/api/workspaces/:workspaceId/tasks` | Task 생성 | 주형, 세인 action executor |
| `GET` | `/api/tasks/:taskId` | Task 상세 + checklist 조회 | 전체 |
| `PATCH` | `/api/tasks/:taskId` | 제목/설명/담당자/마감일/Milestone 수정 | 주형 |
| `PATCH` | `/api/tasks/:taskId/status` | 상태 변경 | 주형, 세인 action executor |
| `DELETE` | `/api/tasks/:taskId` | Task soft delete | 주형 |

### Dependency

| Method | Path | Purpose | Consumer |
|---|---|---|---|
| `POST` | `/api/tasks/:taskId/dependencies` | Task 의존성 추가 | 주형 |
| `DELETE` | `/api/tasks/:taskId/dependencies/:dependsOnTaskId` | Task 의존성 삭제 | 주형 |

### Comment / Activity

| Method | Path | Purpose | Consumer |
|---|---|---|---|
| `POST` | `/api/tasks/:taskId/comments` | 댓글 작성 | 주형 |
| `GET` | `/api/tasks/:taskId/comments` | 댓글 목록 조회 | 주형 |
| `GET` | `/api/tasks/:taskId/activity-logs` | 변경 이력 목록 조회 | 주형, 세인 |

### Checklist

| Method | Path | Purpose | Consumer |
|---|---|---|---|
| `POST` | `/api/tasks/:taskId/checklist-items` | 체크리스트 추가 | 주형 |
| `PATCH` | `/api/tasks/:taskId/checklist-items/:itemId` | 체크리스트 제목/상태/순서 수정 | 주형 |
| `DELETE` | `/api/tasks/:taskId/checklist-items/:itemId` | 체크리스트 삭제 | 주형 |

### Task Draft

| Method | Path | Purpose | Consumer |
|---|---|---|---|
| `POST` | `/api/workspaces/:workspaceId/task-drafts` | Task draft 생성 | 진호, 세인 |
| `POST` | `/api/task-drafts/:draftId/approve` | draft 승인 후 실제 Task 생성 | 주형, 세인 |
| `POST` | `/api/task-drafts/:draftId/reject` | draft 거절 | 주형, 세인 |

## Deferred APIs

아래 API는 contract 후보이지만 현재 `dev` controller에는 없다. 다른 팀은
이 API를 runtime에서 호출하면 안 된다.

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/workspaces/:workspaceId/task-drafts` | deferred | Task draft 목록 API 후속 PR 필요 |
| `GET` | `/api/milestones/:milestoneId` | deferred | 단건 Milestone 상세 조회 후속 PR 필요 |

## Request Rules

### TaskListQuery

`GET /api/workspaces/:workspaceId/tasks`는 기본적으로 삭제되지 않은 Task를
`updatedAt desc`로 최대 50개 반환한다.

Task status와 priority는 현재 runtime, SQL baseline, public schema가 같은 값을 쓴다.

- `TaskStatus`: `todo`, `in_progress`, `in_review`, `done`, `blocked`
- `TaskPriority`: `low`, `medium`, `high`, `urgent`

| Query | Type | Rule |
|---|---|---|
| `status` | `todo,in_progress,in_review,done,blocked` 또는 반복 param | 중복 제거 후 필터 |
| `assigneeMemberId` | string | 빈 문자열이면 무시 |
| `priority` | `low,medium,high,urgent` 또는 반복 param | 중복 제거 후 필터 |
| `dueDateFrom` | `YYYY-MM-DD` | 시작일 |
| `dueDateTo` | `YYYY-MM-DD` | 종료일, `dueDateFrom <= dueDateTo` |
| `milestoneId` | string | 빈 문자열이면 무시 |
| `sortBy` | `updatedAt`, `createdAt`, `dueDate`, `priority`, `status`, `title` | 기본값 `updatedAt` |
| `sortDirection` | `asc`, `desc` | 기본값 `desc` |
| `limit` | integer `1..100` | 기본값 `50` |
| `offset` | integer `0..` | 기본값 `0` |

```text
GET /api/workspaces/:workspaceId/tasks?status=todo,in_progress&priority=high&dueDateFrom=2026-07-01&dueDateTo=2026-07-31&sortBy=dueDate&sortDirection=asc&limit=25&offset=50
```

### CreateTaskRequest

`POST /api/workspaces/:workspaceId/tasks`

```json
{
  "title": "GitHub Repository 연결",
  "description": "GitHub App 설치 후 repository를 연결한다.",
  "assigneeMemberId": "uuid",
  "status": "todo",
  "priority": "high",
  "dueDate": "2026-07-03",
  "milestoneId": "uuid"
}
```

- `title`: required, non-empty string
- `description`: nullable string
- `assigneeMemberId`: nullable workspace member id
- `status`: optional, default `todo`
- `priority`: optional, default `medium`
- `dueDate`: nullable `YYYY-MM-DD`
- `milestoneId`: nullable Milestone id in the same workspace

### UpdateTaskRequest

`PATCH /api/tasks/:taskId`

```json
{
  "title": "GitHub Repository 연결",
  "description": "GitHub App 설치 후 repository를 연결한다.",
  "assigneeMemberId": "uuid",
  "dueDate": "2026-07-04",
  "milestoneId": null
}
```

- 위 필드 중 하나 이상이 필요하다.
- `assigneeMemberId`, `description`, `dueDate`, `milestoneId`는 `null`로 비울 수 있다.
- `milestoneId`를 설정할 때는 같은 workspace의 Milestone이어야 한다.

### UpdateTaskStatusRequest

`PATCH /api/tasks/:taskId/status`

```json
{
  "status": "in_review"
}
```

- `status`: `todo`, `in_progress`, `in_review`, `done`, `blocked`
- 상태 변경은 `task_activity_logs`에 `task.status_changed`로 기록한다.

### CreateMilestoneRequest

`POST /api/workspaces/:workspaceId/milestones`

```json
{
  "title": "MVP Backend",
  "status": "planned",
  "startDate": "2026-07-01",
  "endDate": "2026-07-31"
}
```

- `title`: required, non-empty string
- `status`: optional, default `planned`
- `startDate`, `endDate`: nullable `YYYY-MM-DD`
- 두 날짜가 모두 있으면 `endDate >= startDate`

### UpdateMilestoneRequest

`PATCH /api/milestones/:milestoneId`

```json
{
  "title": "MVP Backend",
  "status": "in_progress",
  "startDate": "2026-07-01",
  "endDate": "2026-07-31"
}
```

- `title`, `status`, `startDate`, `endDate` 중 하나 이상이 필요하다.
- `status`: `planned`, `in_progress`, `done`

### CreateTaskDependencyRequest

`POST /api/tasks/:taskId/dependencies`

```json
{
  "dependsOnTaskId": "uuid"
}
```

- `taskId`는 선행 작업을 필요로 하는 Task다.
- `dependsOnTaskId`는 먼저 완료되어야 하는 Task다.
- 두 Task는 같은 workspace에 있어야 한다.
- 자기 자신 의존성, 중복 의존성, cycle은 허용하지 않는다.

### CreateTaskCommentRequest

`POST /api/tasks/:taskId/comments`

```json
{
  "body": "GitHub App 설치 후 repository sync를 확인해야 한다."
}
```

- `body`: required, non-empty string

### CreateChecklistItemRequest

`POST /api/tasks/:taskId/checklist-items`

```json
{
  "title": "GitHub App 설치",
  "status": "todo",
  "sortOrder": 0
}
```

- `title`: required, non-empty string
- `status`: optional, default `todo`, allowed `todo`, `done`
- `sortOrder`: optional non-negative integer
- 같은 Task 안에서 `sortOrder`가 충돌하면 기존 checklist item을 뒤로 밀어 순서를 보존한다.

### UpdateChecklistItemRequest

`PATCH /api/tasks/:taskId/checklist-items/:itemId`

```json
{
  "title": "GitHub App 설치",
  "status": "done",
  "sortOrder": 1
}
```

- `title`, `status`, `sortOrder` 중 하나 이상이 필요하다.
- `status`: `todo`, `done`
- `sortOrder`: non-negative integer

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
  "updatedAt": "2026-06-27T12:00:00.000Z"
}
```

Required fields:

- `id`
- `workspaceId`
- `milestoneId`
- `title`
- `status`
- `priority`
- `assignee`
- `dueDate`
- `isDelayed`
- `linkedIssueCount`
- `linkedPrCount`
- `updatedAt`

### TaskDetail

`GET /api/tasks/:taskId`는 `TaskSummary` 필드에 `checklistItems`를 포함한다.

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
  "updatedAt": "2026-06-27T12:00:00.000Z",
  "checklistItems": []
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
  "updatedAt": "2026-06-27T12:00:00.000Z"
}
```

`status`는 `planned`, `in_progress`, `done` 중 하나다.
`startDate`, `endDate`는 없으면 `null`이다.

### TaskDependencySummary

```json
{
  "id": "uuid",
  "taskId": "uuid",
  "dependsOnTaskId": "uuid",
  "createdAt": "2026-06-28T11:00:00.000Z"
}
```

### TaskChecklistItemSummary

```json
{
  "id": "uuid",
  "taskId": "uuid",
  "title": "GitHub App 설치",
  "status": "todo",
  "sortOrder": 0,
  "updatedAt": "2026-06-27T12:30:00.000Z"
}
```

### TaskCommentSummary

```json
{
  "id": "uuid",
  "taskId": "uuid",
  "body": "GitHub App 설치 후 repository sync를 확인해야 한다.",
  "author": {
    "memberId": "uuid",
    "name": "주형"
  },
  "createdAt": "2026-06-27T12:30:00.000Z",
  "updatedAt": "2026-06-27T12:30:00.000Z"
}
```

### TaskActivityLogSummary

```json
{
  "id": "uuid",
  "taskId": "uuid",
  "action": "task.status_changed",
  "actor": {
    "memberId": "uuid",
    "name": "주형"
  },
  "beforeValue": "todo",
  "afterValue": "in_progress",
  "createdAt": "2026-06-27T12:30:00.000Z"
}
```

`beforeValue`와 `afterValue`는 action별 JSON value다. 값이 없으면 `null`이다.

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

`TaskCreateDraft`는 Agent action payload와 외부 후보 입력에 쓰는 request DTO다.
현재 dev에서는 `POST /api/workspaces/:workspaceId/task-drafts`로 저장할 수 있다.

`sourceType` vocabulary:

| sourceType | sourceId points to | Producer | Mapping rule |
|---|---|---|---|
| `meeting_action_item` | `MeetingActionItem.id` | 진호 Meeting | Meeting action item의 title/description/assignee/due date를 Task draft로 복사한다. |
| `planning_feature` | `ProjectPlanFeatureDraft.id` | 세인 Planning | Planning feature draft는 `TaskCreateDraft`가 되고, 승인 실행 시 주형 Task API가 실제 Task를 만든다. |
| `agent_recommendation` | `AgentRecommendation.id` | 세인 Agent Runtime | 추천을 Task 후보로 바꿀 때만 사용한다. |
| `manual` | user-entered draft id 또는 null 불가 | 주형 Task UI | 사용자가 명시적으로 초안을 만들 때 사용한다. |

`sourceType`과 `sourceId`는 함께 보내거나 둘 다 생략한다. 둘 중 하나만 있으면
현재 runtime은 `400`으로 거절한다.
`ProjectPlanMilestoneDraft`는 `TaskCreateDraft`가 아니다. 마일스톤 후보는 승인 시
`POST /api/workspaces/:workspaceId/milestones` request로 매핑한다.

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
  "status": "draft",
  "createdAt": "2026-06-27T12:00:00.000Z"
}
```

`TaskDraft.status`는 현재 runtime/SQL/schema 기준으로 `draft`, `approved`, `rejected`만 사용한다.
`waiting_confirmation`은 AgentAction 상태이며 TaskDraft 상태가 아니다.

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

`TaskDraftSummary`는 주형 Task draft API 응답 DTO다. `status`는 `draft`, `approved`, `rejected` 중 하나다. `draft` 상태만 승인 또는 거절할 수 있다. 승인하면 주형의 `tasks` row가 생성되고 `taskId`가 채워진다. 거절하면 Task는 생성되지 않고 `taskId`는 `null`로 남는다.

### TaskStatusUpdateAction

```json
{
  "workspaceId": "uuid",
  "taskId": "uuid",
  "status": "in_review"
}
```

## Events

- `task.created`
- `task.updated`
- `task.deleted`
- `task.status_changed`
- `task.assignee_changed`
- `task.comment_created`
- `task.checklist_item_created`
- `task.checklist_item_updated`
- `task.checklist_item_deleted`
- `task.dependency_created`
- `task.dependency_deleted`
- `task.linked_to_github_issue`
- `task.linked_to_pull_request`

## Agent Actions Consumed

- `task.create.draft`
- `task.update.status`

`task.assign` Agent action은 현재 public schema에 없다. 담당자 변경은 current runtime에서
`PATCH /api/tasks/:taskId`의 `assigneeMemberId`로 처리한다. Agent가 담당자 변경을
제안해야 하면 후속 contract PR에서 `task.assign` 또는 `task.update.assignee` action을
별도로 정의한다.

## Boundaries

- 주형만 Task, Milestone, dependency, checklist, comment, activity log 원본을 생성/수정/삭제한다.
- 진호의 `meeting_action_items`는 Task 후보일 뿐이다. 실제 Task 저장은 주형 API 또는 세인 Agent action executor를 통해 처리한다.
- 동현 Dashboard/Canvas는 `TaskSummary`, `MilestoneSummary`, `ProgressSummary`만 직접 표시한다.
- 은재 Review는 PR과 연결된 `TaskSummary`만 소비한다.
- 세인 Planning은 승인 실행 시 `POST /api/workspaces/:workspaceId/tasks`와 `POST /api/workspaces/:workspaceId/milestones`를 호출한다.
- Task/GitHub/Meeting/Review에서 넘어온 모든 Task 접근은 `workspace_members` membership guard를 먼저 통과해야 한다.
- `assigneeMemberId`, `createdByMemberId`, draft 승인/거절 actor는 같은 workspace의 `workspace_members.id`여야 한다.

## Mock Rule

Task API 미구현 시 consumer는 `TaskSummary` fixture를 사용한다. 임시 `tasks`
table이나 별도 Task store를 만들지 않는다. 현재 구현된 API가 있는 영역에서는
fixture가 아니라 app-server API를 우선 사용한다.
