# 진호 Agent Brief: Meeting / Voice / Report

## Mission

진호는 회의 생성부터 음성방, transcript, 회의록, 결정사항, action item까지 회의 경험을 소유한다. 회의에서 나온 업무는 직접 Task DB에 쓰지 않고 주형의 contract로 넘긴다.

## Must Read

- `docs/contracts/meeting.md`
- `docs/contracts/task.md`
- `docs/contracts/agent-actions.md`
- `docs/db/db-schema-by-owner.md`

## Owned Data

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

## Suggested Paths

- Frontend: `apps/frontend/app/(workspace)/meetings`, `apps/frontend/components/meeting`
- App Server: `apps/app-server/src/modules/meeting`, `apps/app-server/src/modules/voice`
- Realtime Server: `apps/realtime-server/src/meeting`, `apps/realtime-server/src/voice`
- AI Worker: `apps/ai-worker/app/workflows/meeting`
- Public adapters: `apps/app-server/src/modules/meeting/public`

## Implement First

1. Meeting create/list/detail.
2. Participant and agenda management.
3. Memo and transcript segment append.
4. Meeting report generation request.
5. Meeting report summary, decisions, risks, next agenda.
6. Action item extraction and Task draft request.
7. Meeting node summary for Canvas.

## Current Runtime APIs

- `GET /api/meetings` lists all accessible meetings for the actor context.
- `GET /api/workspaces/:workspaceId/meetings` lists workspace meetings.
- `POST /api/workspaces/:workspaceId/meetings` creates meeting.
- `GET /api/meetings/:meetingId` returns meeting detail.
- `POST /api/meetings/:meetingId/memos` appends memo.
- `POST /api/meetings/:meetingId/transcript-segments` appends transcript.
- `POST /api/meetings/:meetingId/report-generation` requests report workflow.
- `POST /api/meetings/:meetingId/report` creates or updates report.
- `GET /api/workspaces/:workspaceId/meeting-reports/recent` returns `MeetingReportSummary[]`.
- `GET /api/workspaces/:workspaceId/meeting-reports/canvas-entity-refs` returns Canvas refs.
- `POST /api/meeting-action-items/:actionItemId/task-draft` calls 주형 Task draft contract.
- Voice APIs are defined in `docs/contracts/voice.md` and use `/api/...` public paths.

## Deferred APIs

- None for the listed Meeting/Voice runtime surface. Any direct Agent run API for report generation remains under 세인 Agent deferred contract until its controller lands.

## Provides To Others

- 동현: Recent meeting report summary, decisions, risks, Canvas meeting node data.
- 주형: Action item to Task draft request.
- 세인: Meeting report generation workflow inputs and outputs.

## Consumes From Others

- 동현: Workspace and member identity.
- 주형: Task draft API and converted task id.
- 세인: Agent runtime for report summary and action item extraction.

## Mock Rule

Voice/STT가 늦으면 transcript segment를 text input fixture로 대체한다. Task 전환은 실제 Task API가 없을 때 `TaskCreateDraft` fixture를 만들고 `convertedTaskId`는 null로 둔다.

## Do Not Touch

- Task table 직접 insert/update.
- GitHub Issue 생성.
- Canvas layout 저장.
- PR analysis.
- Agent runtime 공통 queue와 action schema.

## Done

- 회의록 없이도 meeting shell과 agenda/memo가 동작한다.
- transcript가 없어도 report empty state가 깨지지 않는다.
- action item이 Task draft contract로 변환된다.
- Dashboard와 Canvas가 쓸 meeting summary를 제공한다.
- 회의 데이터와 Task 데이터의 소유권이 분리되어 있다.
