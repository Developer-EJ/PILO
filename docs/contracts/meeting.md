# Meeting / Report Contract

## Owner

진호

## Scope

회의, 참석자, 아젠다, 메모, transcript segment, 회의록, 결정사항, 리스크,
다음 아젠다, Action Item을 담당한다.

Voice room/session은 `docs/contracts/voice.md`에서 별도로 정의한다. Meeting은
Voice가 만든 transcript segment를 소비해 Report workflow를 실행할 수 있지만,
Voice provider 세부 상태를 소유하지 않는다.

## Owned Tables

- `meetings`
- `meeting_participants`
- `meeting_agendas`
- `meeting_memos`
- `transcript_segments`
- `meeting_reports`
- `meeting_report_open_questions`
- `meeting_report_risks`
- `meeting_report_next_agendas`
- `meeting_decisions`
- `meeting_action_items`

## Consumer Impact

| Consumer | Uses | Impact |
|---|---|---|
| 동현 Dashboard | `MeetingReportSummary` | 최근 회의록 제목, 요약, 결정/액션/리스크 count를 표시한다. |
| 동현 Canvas | `MeetingReportCanvasEntityRef` | 회의록을 `meeting_report` shape로 표시한다. |
| 주형 Task | `MeetingActionItem`, task draft request | Action Item을 Task 후보로 변환한다. Meeting이 `tasks` table에 직접 쓰지 않는다. |
| 세인 Agent Runtime / Planning | `MeetingAgenda`, `meeting.report.generate`, `task.create.draft`, `firstAgendaDraft` | Planning은 `firstAgendaDraft`를 산출하고, 실제 `MeetingAgenda` 저장은 Meeting API 또는 Meeting owner action이 수행한다. 회의록 생성 workflow와 Action Item 실행 제안은 public contract로 연결한다. |
| 은재 Review | 없음 | Meeting 원본 table을 직접 읽거나 수정하지 않는다. 필요하면 별도 read model을 추가한다. |

Breaking change가 발생하는 필드:

- `MeetingReportSummary`
- `MeetingAgenda`
- `MeetingReportCanvasEntityRef`
- `MeetingActionItem`
- `meeting.report.generate` output artifact
- `TaskCreateDraft` mapping source field

위 필드를 바꿀 때는 동현, 주형, 세인을 reviewer로 지정한다.

## Base Path

app-server uses the global `api` prefix. Current runtime paths in this document are listed as `/api/...`.

## Current Runtime APIs

### Scaffold

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/meetings` | Meeting module scaffold 상태 확인 |

### Meeting

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/workspaces/:workspaceId/meetings` | 회의 생성 |
| `GET` | `/api/workspaces/:workspaceId/meetings` | workspace 회의 목록 |
| `GET` | `/api/meetings/:meetingId` | 회의 상세 |
| `PATCH` | `/api/meetings/:meetingId/status` | 회의 상태 변경 |

### Participants

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/meetings/:meetingId/participants` | 참석자 추가 |
| `GET` | `/api/meetings/:meetingId/participants` | 참석자 목록 |
| `PATCH` | `/api/meetings/:meetingId/participants/:participantId/leave` | 참석자 퇴장 처리 |

### Agenda

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/meetings/:meetingId/agendas` | 아젠다 생성 |
| `GET` | `/api/meetings/:meetingId/agendas` | 아젠다 목록 |
| `PATCH` | `/api/meetings/:meetingId/agendas/:agendaId/status` | 아젠다 상태 변경 |
| `PATCH` | `/api/meetings/:meetingId/agendas/:agendaId/sort-order` | 아젠다 정렬 순서 변경 |

### Memo / Transcript

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/meetings/:meetingId/memos` | 회의 메모 작성 |
| `GET` | `/api/meetings/:meetingId/memos` | 회의 메모 목록 |
| `POST` | `/api/meetings/:meetingId/transcript-segments` | transcript segment 저장 |
| `GET` | `/api/meetings/:meetingId/transcript-segments` | transcript segment 목록 |

### Report

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/meetings/:meetingId/report-generation` | Agent workflow 기반 회의록 생성 요청 |
| `POST` | `/api/meetings/:meetingId/report` | 회의록 직접 생성/mock 생성 |
| `GET` | `/api/meeting-reports/:reportId` | 회의록 상세 |
| `GET` | `/api/workspaces/:workspaceId/meeting-reports/recent` | Dashboard용 최근 회의록 요약 |
| `GET` | `/api/workspaces/:workspaceId/meeting-reports/canvas-entity-refs` | Canvas용 회의록 entity ref |

### Report Items

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/meeting-reports/:reportId/decisions` | 결정사항 생성 |
| `GET` | `/api/meeting-reports/:reportId/decisions` | 결정사항 목록 |
| `POST` | `/api/meeting-reports/:reportId/risks` | 리스크 생성 |
| `GET` | `/api/meeting-reports/:reportId/risks` | 리스크 목록 |
| `POST` | `/api/meeting-reports/:reportId/next-agendas` | 다음 아젠다 생성 |
| `GET` | `/api/meeting-reports/:reportId/next-agendas` | 다음 아젠다 목록 |
| `POST` | `/api/meeting-reports/:reportId/action-items` | Action Item 생성 |
| `GET` | `/api/meeting-reports/:reportId/action-items` | Action Item 목록 |

### Action Item State / Task Draft

| Method | Path | Purpose |
|---|---|---|
| `PATCH` | `/api/meeting-action-items/:actionItemId/approve` | Action Item 승인 |
| `PATCH` | `/api/meeting-action-items/:actionItemId/reject` | Action Item 거절 |
| `PATCH` | `/api/meeting-action-items/:actionItemId/convert` | 실제 Task 생성 성공 후 converted 처리 |
| `POST` | `/api/meeting-action-items/:actionItemId/task-draft` | Task draft 생성 요청 |

## Request DTOs

### CreateMeetingRequest

```json
{
  "title": "MVP scope sync",
  "purpose": "계약 우선순위 정리",
  "canvasBoardId": "uuid"
}
```

- `title`: required, non-empty string
- `purpose`: nullable string
- `canvasBoardId`: nullable UUID
- `createdByMemberId`는 client가 보내지 않는다. 현재 member context에서 정한다.

### UpdateMeetingStatusRequest

```json
{
  "status": "in_progress"
}
```

- `status`: `scheduled`, `in_progress`, `ended`, `report_generated`

### CreateMeetingParticipantRequest

```json
{
  "memberId": "uuid",
  "role": "facilitator"
}
```

- `memberId`: required workspace member id
- `role`: nullable string

### CreateMeetingAgendaRequest

```json
{
  "title": "Task contract 확인",
  "sortOrder": 0
}
```

- `title`: required, non-empty string
- `sortOrder`: optional integer, missing이면 repository/service가 기본 순서를 정한다.

### UpdateMeetingAgendaStatusRequest

```json
{
  "status": "done"
}
```

- `status`: `open`, `done`, `skipped`

### ReorderMeetingAgendaRequest

```json
{
  "sortOrder": 2
}
```

### CreateMeetingMemoRequest

```json
{
  "authorMemberId": "uuid",
  "body": "Task 전환은 draft부터 처리한다."
}
```

- `authorMemberId`: nullable workspace member id
- `body`: required, non-empty string

### CreateTranscriptSegmentRequest

```json
{
  "speakerMemberId": "uuid",
  "source": "stt",
  "body": "회의록은 agent workflow로 생성한다.",
  "startedAt": "2026-06-27T08:30:00.000Z",
  "endedAt": "2026-06-27T08:30:05.000Z"
}
```

- `speakerMemberId`: nullable workspace member id
- `source`: `text`, `stt`
- `body`: required, non-empty string
- `startedAt`, `endedAt`: nullable ISO date-time

### CreateMeetingDecisionRequest

```json
{
  "content": "회의 Action Item은 Task draft로 먼저 만든다.",
  "status": "decided",
  "linkedTaskId": null
}
```

- `status`: `decided`, `pending`, `reopened`
- `linkedTaskId`: nullable Task id. Meeting은 Task 존재 여부를 직접 보장하지 않는다.

### CreateMeetingReportRiskRequest

```json
{
  "content": "Task API contract merge가 늦을 수 있다.",
  "severity": "medium",
  "sortOrder": 0
}
```

- `severity`: `low`, `medium`, `high`, `critical`

### CreateMeetingReportNextAgendaRequest

```json
{
  "title": "TaskCreateDraft 실제 연동 확인",
  "sortOrder": 0
}
```

### CreateMeetingActionItemRequest

```json
{
  "title": "OAuth 실패 상태 UI 추가",
  "description": "로그인 실패 케이스를 사용자가 이해할 수 있게 표시한다.",
  "assigneeSuggestionMemberId": "uuid",
  "dueDateSuggestion": "2026-07-03"
}
```

- Action Item은 Task 원본이 아니다.
- 생성 시 `status = draft`, `convertedTaskId = null`이다.

### ConvertMeetingActionItemRequest

```json
{
  "convertedTaskId": "uuid"
}
```

- 주형 Task API 또는 세인 Agent action executor가 실제 Task 생성에 성공한 뒤에만 호출한다.

## Response / Read Models

### MeetingResponse

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "canvasBoardId": null,
  "title": "MVP scope sync",
  "purpose": "계약 우선순위 정리",
  "status": "scheduled",
  "startedAt": null,
  "endedAt": null,
  "createdByMemberId": "uuid",
  "createdAt": "2026-06-27T08:30:00.000Z",
  "updatedAt": "2026-06-27T08:30:00.000Z"
}
```

### MeetingParticipant

```json
{
  "id": "uuid",
  "meetingId": "uuid",
  "memberId": "uuid",
  "role": "facilitator",
  "joinedAt": "2026-06-27T08:30:00.000Z",
  "leftAt": null
}
```

### MeetingAgenda

```json
{
  "id": "uuid",
  "meetingId": "uuid",
  "title": "Task contract 확인",
  "status": "open",
  "sortOrder": 0,
  "createdAt": "2026-06-27T08:30:00.000Z",
  "updatedAt": "2026-06-27T08:30:00.000Z"
}
```

### MeetingMemo

```json
{
  "id": "uuid",
  "meetingId": "uuid",
  "authorMemberId": "uuid",
  "body": "Task 전환은 draft부터 처리한다.",
  "createdAt": "2026-06-27T08:30:00.000Z",
  "updatedAt": "2026-06-27T08:30:00.000Z"
}
```

### TranscriptSegment

```json
{
  "id": "uuid",
  "meetingId": "uuid",
  "speakerMemberId": "uuid",
  "source": "stt",
  "body": "회의록은 agent workflow로 생성한다.",
  "startedAt": "2026-06-27T08:30:00.000Z",
  "endedAt": "2026-06-27T08:30:05.000Z",
  "createdAt": "2026-06-27T08:30:05.000Z"
}
```

### MeetingReportSummary

Dashboard가 소비하는 최소 read model이다. 상세 회의록이 아니라 요약 카드용이다.

```json
{
  "id": "uuid",
  "meetingId": "uuid",
  "workspaceId": "uuid",
  "title": "MVP scope sync",
  "summary": "로그인, Task, Canvas, Review의 contract 우선순위를 확정했다.",
  "decisionCount": 2,
  "actionItemCount": 3,
  "riskCount": 1,
  "createdAt": "2026-06-27T08:30:00.000Z"
}
```

### MeetingReportDetail

`GET /api/meeting-reports/:reportId` 응답이다.

```json
{
  "id": "uuid",
  "meetingId": "uuid",
  "workspaceId": "uuid",
  "title": "MVP scope sync",
  "summary": "로그인, Task, Canvas, Review의 contract 우선순위를 확정했다.",
  "decisionCount": 2,
  "actionItemCount": 3,
  "riskCount": 1,
  "createdAt": "2026-06-27T08:30:00.000Z",
  "decisions": [],
  "risks": [],
  "nextAgendas": []
}
```

### MeetingDecision

```json
{
  "id": "uuid",
  "reportId": "uuid",
  "title": "회의 Action Item은 Task draft로 먼저 만든다.",
  "content": "회의 Action Item은 Task draft로 먼저 만든다.",
  "status": "decided",
  "linkedTaskId": null,
  "createdAt": "2026-06-27T08:30:00.000Z"
}
```

- `title`: deprecated compatibility alias for existing consumers. New consumers
  should read `content`; producers keep `title = content` until the next
  breaking contract version.
- `linkedTaskId`: additive nullable field during the compatibility rollout.

### MeetingReportRisk

```json
{
  "id": "uuid",
  "reportId": "uuid",
  "content": "Task API contract merge가 늦을 수 있다.",
  "severity": "medium",
  "sortOrder": 0,
  "createdAt": "2026-06-27T08:30:00.000Z"
}
```

### MeetingReportNextAgenda

```json
{
  "id": "uuid",
  "reportId": "uuid",
  "title": "TaskCreateDraft 실제 연동 확인",
  "sortOrder": 0,
  "createdAt": "2026-06-27T08:30:00.000Z"
}
```

### MeetingActionItem

```json
{
  "id": "uuid",
  "reportId": "uuid",
  "title": "OAuth 실패 상태 UI 추가",
  "description": "로그인 실패 케이스를 사용자가 이해할 수 있게 표시한다.",
  "assigneeSuggestionMemberId": "uuid",
  "dueDateSuggestion": "2026-07-03",
  "status": "draft",
  "convertedTaskId": null
}
```

### MeetingActionItemTaskDraftResponse

`POST /api/meeting-action-items/:actionItemId/task-draft` 응답이다.

```json
{
  "actionItem": {
    "id": "uuid",
    "reportId": "uuid",
    "title": "OAuth 실패 상태 UI 추가",
    "description": "로그인 실패 케이스를 사용자가 이해할 수 있게 표시한다.",
    "assigneeSuggestionMemberId": "uuid",
    "dueDateSuggestion": "2026-07-03",
    "status": "approved",
    "convertedTaskId": null
  },
  "taskDraft": {
    "workspaceId": "uuid",
    "sourceType": "meeting_action_item",
    "sourceId": "uuid",
    "title": "OAuth 실패 상태 UI 추가",
    "description": "로그인 실패 케이스를 사용자가 이해할 수 있게 표시한다.",
    "assigneeMemberId": "uuid",
    "priority": "medium",
    "dueDate": "2026-07-03"
  }
}
```

### MeetingReportCanvasEntityRef

Canvas가 소비하는 최소 entity ref이다.

```json
{
  "entityType": "meeting_report",
  "entityId": "uuid",
  "displayTitle": "MVP scope sync",
  "shapeType": "meeting_report"
}
```

## Status Values

아래 값은 `docs/db/pilo_erd_schema.sql`의 check constraint와 맞춰야 한다.

| Table / Model | Field | Values | Notes |
|---|---|---|---|
| `meetings` | `status` | `scheduled`, `in_progress`, `ended`, `report_generated` | 회의 생성, 진행, 종료, 회의록 생성 완료 상태 |
| `meeting_agendas` | `status` | `open`, `done`, `skipped` | 회의 중 아젠다 처리 상태 |
| `transcript_segments` | `source` | `text`, `stt` | 직접 입력 또는 STT 생성 transcript |
| `meeting_report_risks` | `severity` | `low`, `medium`, `high`, `critical` | 회의록 리스크 심각도 |
| `meeting_decisions` | `status` | `decided`, `pending`, `reopened` | 결정사항 확정 여부 |
| `meeting_action_items` | `status` | `draft`, `approved`, `converted`, `rejected` | Task draft 변환 전후 상태 |

## Events

- `meeting.created`
- `meeting.started`
- `meeting.ended`
- `meeting.report_generation_requested`
- `meeting.report_generated`
- `meeting.action_item_created`
- `meeting.action_item_approved`
- `meeting.action_item_rejected`
- `meeting.action_item_converted`

## Agent Actions Produced / Consumed

- Meeting consumes `meeting.report.generate`.
- Meeting may produce or request `task.create.draft`.
- Meeting does not execute Task writes directly.

## Workflow Output

### `meeting.report.generate` v1

`AgentResultMessage.output`은 DB row가 아니라 회의록 저장을 위한 artifact 초안이다.
DB id, `reportId`, `createdAt`, `updatedAt`은 App Server가 저장 시점에 부여한다.

```json
{
  "summary": "Task 분배와 GitHub 연동 범위를 결정했다.",
  "decisions": [
    {
      "content": "Task draft 변환은 Task API adapter 뒤에 둔다.",
      "status": "decided",
      "linkedTaskId": null
    }
  ],
  "risks": [
    {
      "content": "Task API contract merge가 지연될 수 있다.",
      "severity": "medium",
      "sortOrder": 0
    }
  ],
  "nextAgendas": [
    {
      "title": "TaskCreateDraft adapter 실제 연동 확인",
      "sortOrder": 0
    }
  ],
  "actionItems": [
    {
      "title": "TaskCreateDraft adapter mock 작성",
      "description": "meeting_action_items를 TaskCreateDraft payload로 매핑한다.",
      "assigneeSuggestionMemberId": null,
      "dueDateSuggestion": null,
      "priority": "medium"
    }
  ]
}
```

### Output Artifacts

| Artifact | Required | Purpose |
|---|---:|---|
| `summary` | Yes | `meeting_reports.summary` 초안 |
| `decisions` | Yes | `meeting_decisions` 초안 배열 |
| `risks` | Yes | `meeting_report_risks` 초안 배열 |
| `nextAgendas` | Yes | `meeting_report_next_agendas` 초안 배열 |
| `actionItems` | Yes | `meeting_action_items` 초안 배열 |

### Persistence Mapping

| `AgentResultMessage.output` path | Meeting storage target | Rule |
|---|---|---|
| `summary` | `meeting_reports.summary` | 먼저 report를 생성하거나 기존 report를 재사용한다. |
| `decisions[]` | `meeting_decisions` | `report_id`는 저장된 report id를 사용한다. |
| `risks[]` | `meeting_report_risks` | `report_id`와 `sort_order` unique 규칙을 지킨다. |
| `nextAgendas[]` | `meeting_report_next_agendas` | `report_id`와 `sort_order` unique 규칙을 지킨다. |
| `actionItems[]` | `meeting_action_items` | Task 후보만 저장한다. `tasks` table에 직접 insert하지 않는다. |

### AgentResultMessage Rules

- `status = failed`이면 `output`을 저장하지 않는다.
- `trace`는 workflow 실행 설명만 담고 meeting table에 저장하지 않는다.
- `actions`에 `task.create.draft`가 포함될 수 있지만, `meeting_action_items.convertedTaskId`는 Task API 성공 후에만 채운다.
- enum이나 required field가 contract와 맞지 않으면 App Server는 report 저장을 중단하고 workflow 실패로 기록한다.
- `meeting_report_open_questions`는 v1 output artifact에 포함하지 않는다. 필요하면 별도 contract issue/PR로 추가한다.

## Task Draft Mapping

`MeetingActionItem`은 Task 원본이 아니라 Task 후보이다. Task draft 저장과 approve/reject 전이는 주형 Task API 또는 Agent action executor가 담당한다.

Internal public source boundary:

- `MEETING_ACTION_ITEM_TASK_DRAFT_SOURCE` is an app-server internal Meeting owner
  boundary, not a public HTTP endpoint.
- It reads the current Mock/In-memory Meeting ActionItem source and returns only
  the contract-safe `TaskCreateDraft` payload shape.
- It does not create TaskDraft rows, change ActionItem status, or call Task
  service/repository/Prisma.
- 세인 Agent Runtime consumes this boundary for
  `meeting.action-item.to-task-draft` and creates the actual TaskDraft only
  after AgentAction approve plus explicit execute.

| TaskCreateDraft field | Source                                            |
| --------------------- | ------------------------------------------------- |
| `workspaceId`         | action item이 속한 report -> meeting -> workspace |
| `sourceType`          | 고정값 `meeting_action_item`                      |
| `sourceId`            | `MeetingActionItem.id`                            |
| `title`               | `MeetingActionItem.title`                         |
| `description`         | `MeetingActionItem.description`                   |
| `assigneeMemberId`    | `MeetingActionItem.assigneeSuggestionMemberId`    |
| `priority`            | 명시 입력이 없으면 `medium`                       |
| `dueDate`             | `MeetingActionItem.dueDateSuggestion`             |

## Boundaries

- 진호는 회의록과 Action Item 원본을 소유한다.
- Meeting은 `tasks`, `pull_requests`, `canvas_shapes`, `agent_runs` table을 직접 쓰지 않는다.
- Task draft 생성과 승인/거절은 주형 API 또는 세인 Agent action을 통해 수행한다.
- 동현 Dashboard는 `MeetingReportSummary`만 표시한다.
- 동현 Canvas는 `MeetingReportCanvasEntityRef`와 `MeetingReportSummary`만 사용한다.
- 음성 provider 세부 구현은 Voice contract에 둔다.
- Review가 회의 내용을 참조해야 하면 `MeetingReportSummary` 또는 별도 read model을 contract로 추가한다.

## Mock Rule

Task API가 없으면 Action Item은 `draft` 또는 `approved`까지만 처리한다.
`convertedTaskId`는 주형 Task draft approve로 실제 Task가 생성된 후에만 채운다.
