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
