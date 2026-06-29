# Meeting Contract

## Owner

진호

## Scope

회의, 음성방, transcript, 회의록, 결정사항, 질문, 리스크, 다음 아젠다, Action Item을 담당한다.

## Owned Tables

- `meetings`
- `meeting_participants`
- `meeting_agendas`
- `meeting_memos`
- `voice_rooms`
- `voice_sessions`
- `transcript_segments`
- `meeting_reports`
- `meeting_report_open_questions`
- `meeting_report_risks`
- `meeting_report_next_agendas`
- `meeting_decisions`
- `meeting_action_items`

## Provided APIs

| Method  | Path                                             | 목적                    |
| ------- | ------------------------------------------------ | ----------------------- |
| `POST`  | `/workspaces/:workspaceId/meetings`              | 회의 생성               |
| `GET`   | `/workspaces/:workspaceId/meetings`              | 회의 목록               |
| `GET`   | `/meetings/:meetingId`                           | 회의 상세               |
| `PATCH` | `/meetings/:meetingId/status`                    | 회의 시작/종료          |
| `POST`  | `/meetings/:meetingId/participants`              | 참석자 추가             |
| `POST`  | `/meetings/:meetingId/memos`                     | 회의 메모 작성          |
| `POST`  | `/meetings/:meetingId/transcript-segments`       | transcript segment 저장 |
| `POST`  | `/meetings/:meetingId/report`                    | 회의록 생성             |
| `GET`   | `/meeting-reports/:reportId`                     | 회의록 상세             |
| `POST`  | `/meeting-action-items/:actionItemId/task-draft` | Task draft 요청         |

## Status Values

아래 값은 `docs/db/pilo_erd_schema.sql`의 check constraint와 맞춰야 한다.

| Table / Model          | Field              | Values                                                            | Notes                                        |
| ---------------------- | ------------------ | ----------------------------------------------------------------- | -------------------------------------------- |
| `meetings`             | `status`           | `scheduled`, `in_progress`, `ended`, `report_generated`           | 회의 생성, 진행, 종료, 회의록 생성 완료 상태 |
| `meeting_agendas`      | `status`           | `open`, `done`, `skipped`                                         | 회의 중 아젠다 처리 상태                     |
| `voice_rooms`          | `status`           | `active`, `inactive`, `archived`                                  | 음성방 사용 가능 상태                        |
| `voice_sessions`       | `recording_status` | `not_recording`, `recording`, `processing`, `completed`, `failed` | 녹음과 STT 처리 상태                         |
| `transcript_segments`  | `source`           | `text`, `stt`                                                     | 직접 입력 또는 STT 생성 transcript           |
| `meeting_report_risks` | `severity`         | `low`, `medium`, `high`, `critical`                               | 회의록 리스크 심각도                         |
| `meeting_decisions`    | `status`           | `decided`, `pending`, `reopened`                                  | 결정사항 확정 여부                           |
| `meeting_action_items` | `status`           | `draft`, `approved`, `converted`, `rejected`                      | Task draft 변환 전후 상태                    |

## Read Models

### MeetingReportSummary

```json
{
  "id": "uuid",
  "meetingId": "uuid",
  "workspaceId": "uuid",
  "title": "1차 스프린트 회의",
  "summary": "Task 분배와 GitHub 연동 범위를 결정했다.",
  "decisionCount": 2,
  "actionItemCount": 4,
  "riskCount": 1,
  "createdAt": "2026-06-27T12:00:00Z"
}
```

### MeetingActionItem

```json
{
  "id": "uuid",
  "reportId": "uuid",
  "title": "Task API contract 작성",
  "description": "TaskSummary와 TaskCreateDraft를 확정한다.",
  "assigneeSuggestionMemberId": "uuid",
  "dueDateSuggestion": "2026-07-03",
  "status": "draft",
  "convertedTaskId": null
}
```

## Events

- `meeting.created`
- `meeting.ended`
- `meeting.report_generated`
- `meeting.action_item_created`
- `meeting.action_item_converted`

## Agent Actions Produced

- `meeting.report.generate`
- `task.create.draft`

## Workflow Output

### `meeting.report.generate` v1

`AgentResultMessage.output`은 DB row가 아니라 회의록 저장을 위한 artifact 초안이다. DB id, `reportId`, `createdAt`, `updatedAt`은 App Server가 저장 시점에 부여한다.

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

### Artifact Shapes

| Artifact | Fields | Defaults / Validation |
|---|---|---|
| `summary` | non-empty string | 빈 문자열이면 저장하지 않고 workflow 실패로 처리한다. |
| `decisions[]` | `content`, `status`, `linkedTaskId` | `status` 기본값은 `decided`; 허용값은 `decided`, `pending`, `reopened`; `linkedTaskId`는 없으면 `null`. |
| `risks[]` | `content`, `severity`, `sortOrder` | `severity` 기본값은 `medium`; 허용값은 `low`, `medium`, `high`, `critical`; `sortOrder`가 없으면 배열 index를 사용한다. |
| `nextAgendas[]` | `title`, `sortOrder` | `sortOrder`가 없으면 배열 index를 사용한다. |
| `actionItems[]` | `title`, `description`, `assigneeSuggestionMemberId`, `dueDateSuggestion`, `priority` | 저장 시 `status = draft`, `convertedTaskId = null`; `priority` 기본값은 `medium`; 실제 Task 생성은 하지 않는다. |

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
- Task draft 생성과 승인/거절은 주형 API 또는 세인 Agent action을 통해 수행한다.
- 동현 Dashboard/Canvas는 `MeetingReportSummary`만 표시한다.
- 음성 provider 세부 구현은 Realtime/Voice 영역에 두고 Task/GitHub/Review 코드와 결합하지 않는다.

## Mock Rule

Task API가 없으면 Action Item은 `draft` 또는 `approved`까지만 처리한다. `converted_task_id`는 주형 Task draft approve로 실제 Task가 생성된 후에만 채운다.
