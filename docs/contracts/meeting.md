# Meeting / Report Contract

## Owner

진호

## Scope

Meeting / Report는 workspace 음성방에서 녹음/트래킹된 결과를 Report로 정리하고,
후속 작업을 Task와 GitHub Issue로 연결하는 영역을 담당한다.

중요한 용어 기준:

- 독립적인 `meeting` 객체는 없다.
- 사용자가 말하는 "회의"는 workspace에 붙은 음성방과 사용자의 음성 세션을 의미한다.
- "회의 시작"은 음성방에 참여하는 것이다. Voice contract의 `VoiceSession` 시작이다.
- "회의 종료"는 음성 세션에서 나가는 것이다. Voice contract의 `VoiceSession` 종료다.
- "회의 녹화 시작"부터 "회의 녹화 종료"까지가 Report 생성을 위한 기록 구간이다.
- 이 기록 구간은 `meeting_sessions`로 저장한다. 이 테이블은 meeting 객체가 아니라
  녹음/트래킹 세션이다.
- workspace 음성방에서 나온 결과물은 Report로 저장한다. 팀에서 말하는
  `meeting_result` 개념은 이 contract에서 `meeting_reports` 저장 모델로 다룬다.

이 문서는 별도의 회의 계획 항목 생성/정렬/완료 기능을 포함하지 않는다. Agent도
그런 항목을 추천하지 않는다. Report 안의 `next_agenda`는 다음에 논의할 후보
텍스트 목록일 뿐, 독립적인 객체가 아니다.

Voice room/session은 `docs/contracts/voice.md`에서 별도로 정의한다. Meeting / Report는
Voice provider 세부 상태를 소유하지 않는다.

## Object Definitions

이 구분은 모든 구현, 스키마, API 문서에서 반드시 유지한다.

| Object           | Meaning                                                                              | Owner            | Storage            | Not This                                        |
| ---------------- | ------------------------------------------------------------------------------------ | ---------------- | ------------------ | ----------------------------------------------- |
| `VoiceRoom`      | workspace에 붙는 음성회의방. 사용자가 입장할 수 있는 방이다.                         | Voice            | `voice_rooms`      | 녹화 구간이나 Report가 아니다.                  |
| `VoiceSession`   | 한 사용자가 `VoiceRoom`에 참여한 입장/퇴장 세션이다.                                 | Voice            | `voice_sessions`   | Report 생성 단위가 아니다.                      |
| `MeetingSession` | 특정 `VoiceRoom`에서 회의 녹화 버튼을 누른 시점부터 녹화 종료까지의 기록 구간이다.   | Meeting / Report | `meeting_sessions` | 음성회의방이 아니며, 사용자 입장 세션도 아니다. |
| `MeetingReport`  | `MeetingSession` 동안 수집한 transcript와 이벤트를 Agent/사용자가 정리한 결과물이다. | Meeting / Report | `meeting_reports`  | 음성방이나 녹화 세션 자체가 아니다.             |

따라서 `MeetingSession`은 음성회의방이 아니다. 음성회의방은 `VoiceRoom`이고,
`MeetingSession`은 그 방 안에서 발생한 하나의 녹화/트래킹 구간이다.

## Required Pages

현재 Meeting / Report frontend는 아래 두 페이지를 별도로 제공해야 한다.

| Page                       | Purpose                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| 음성회의 페이지            | 현재 workspace의 기본/선택된 음성방 참여, 참여자 표시, 회의 녹화 시작/종료 |
| 회의록(리포트) 전용 페이지 | workspace에 저장된 Report 게시판, 페이지네이션 목록, Report 상세 모달 편집 |

두 페이지는 같은 sidebar/topbar shell 안에 있어도 되지만, 본문 content 영역과 route는 분리한다.
음성회의 페이지가 회의록 게시판 역할을 겸하면 안 되고, 회의록(리포트) 전용 페이지가
음성방 참여/녹화 control을 주 UI로 삼으면 안 된다.

## Current MVP Screen Scope

현재 음성회의 화면은 음성방 관리 화면이 아니다. 아래 항목만 현재 화면의 필수 요구사항으로
본다.

- workspace context나 mock/default 값으로 선택된 하나의 `VoiceRoom`을 표시한다.
- 현재 `VoiceRoom`에 참여 중인 사용자 목록을 표시한다.
- 사용자는 현재 `VoiceRoom`에 참여해 `VoiceSession`을 시작할 수 있다.
- 사용자가 `VoiceSession`에 참여 중일 때 회의 녹화 버튼으로 `MeetingSession`을 시작할
  수 있다.
- 녹화 중에는 녹화 시간과 회의 녹화 종료 action을 표시한다.
- 녹화 종료는 `MeetingSession` 종료이며, 사용자가 음성방에서 나가는 `VoiceSession`
  종료와 구분한다.
- Real-time audio analytics 같은 시각 장식은 contract 요구사항이 아니다.

현재 MVP 화면에서 제외하는 항목:

- 음성방 생성
- 음성방 삭제
- workspace 전체 음성방 목록 조회/관리 UI

workspace 전체 음성방 목록은 이후 구현 범위다. 따라서 현재 화면의 우측 영역이 임시로
Report 요약이나 빈 placeholder를 보여주더라도, 현재 MVP contract 위반으로 보지 않는다.

## Meeting Report Board Screen Scope

회의록 게시판은 workspace에 저장된 Report를 표 형태로 보여주는 화면이다.

- 게시판 row는 하나의 `MeetingReport` entry다.
- 게시판은 반드시 페이지네이션을 사용한다.
- 각 페이지는 `No`, `Date`, `Title`, `Participants`, `Key Summary` column을 표시한다.
- `Actions` column은 두지 않는다. row 클릭이 상세 열기 action이다.
- `열기`, `편집` 같은 별도 action 버튼을 두지 않는다.
- 사용자가 row를 클릭하면 해당 Report의 상세 모달 페이지를 연다.
- 상세 모달 페이지는 읽기 화면과 편집 화면을 분리하지 않는다. Notion 문서처럼 같은
  화면에서 내용을 읽고, 권한이 있으면 바로 수정할 수 있다.
- 상세 모달 페이지는 route-backed modal 또는 일반 상세 page로 구현할 수 있다. 어떤 UI
  방식을 쓰더라도 뒤로가기, 새로고침, 직접 진입 시 같은 `reportId`를 열 수 있어야 한다.
- 사용자의 권한에 따라 같은 상세 화면이 편집 가능 또는 읽기 전용으로 렌더링되어야 한다.
- `canEdit = true`이면 제목, 요약, 주요 논의, 결정사항, 후속 작업, 다음 논의 후보를
  수정할 수 있다.
- `canRead = true`, `canEdit = false`이면 같은 상세 화면을 읽기 전용으로 보여주고 저장
  action을 숨기거나 비활성화한다.
- `canRead = false`이면 목록에 노출하지 않거나 상세 조회에서 `403 Forbidden`을 반환한다.
- 저장은 `PATCH /api/meeting-reports/:reportId`로 수행한다.
- 닫기 시 저장되지 않은 변경사항이 있으면 저장/취소 여부를 확인한다.

## Functional Requirements

1. 현재 MVP에서 사용자는 workspace의 기본/현재 음성방에 참여할 수 있다.
2. 사용자는 음성방에 참여한 뒤 회의 녹음을 시작할 수 있다.
3. 회의 녹음을 시작하면 음성이 녹음되고, 녹음 종료 전까지 발생한 모든 행동과 이벤트를
   기록한다.
4. 녹음 종료 후 Agent는 기록된 transcript와 이벤트를 기반으로 Report 후보를 생성한다.
5. 사용자는 Report 후보를 확인하고 수정, 삭제, 저장할 수 있다.
6. 사용자는 Report의 후속 작업을 선택해 Task로 생성할 수 있다.
7. 개발 태그나 개발 성격이 있는 Task는 GitHub Issue와 연결할 수 있다.
8. 사용자는 workspace에 저장된 과거 Report 목록과 상세를 조회할 수 있다.
9. 사용자는 권한에 따라 Report 상세 모달 페이지를 편집 가능 또는 읽기 전용으로 볼 수
   있다.
10. Meeting / Report frontend는 음성회의 페이지와 회의록(리포트) 전용 페이지를 분리해야
    한다.
11. 회의록(리포트) 전용 페이지는 페이지네이션된 게시판으로 Report를 조회해야 한다.

## Owned Tables

- `meeting_sessions`
- `meeting_participants`
- `meeting_events`
- `meeting_reports`
- `report_tasks_mapping`

## Removed / Not Owned Tables

기존 개별 회의/항목 테이블은 이 contract의 target schema에서 사용하지 않는다.

결정사항, 후속 작업, 다음 논의 후보 등은 `meeting_reports`의 JSONB 필드 또는
`report_tasks_mapping`으로 관리한다.

## Consumer Impact

| Consumer           | Uses                                                                 | Impact                                                              |
| ------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 진호 Voice         | recording signal, transcript completion signal                       | 음성방/음성 세션에서 녹음 구간과 transcript 입력을 만든다.          |
| 세인 Agent Runtime | `meeting.report.generate`, `meeting_events`, `meeting_reports` draft | 녹음 구간의 모든 입력을 읽고 Report 후보와 Task 후보를 생성한다.    |
| 동현 Dashboard     | `MeetingReportSummary`                                               | 최근 Report 제목, 요약, Task/Issue count를 표시한다.                |
| 동현 Canvas        | `MeetingReportCanvasEntityRef`, meeting event payload                | 회의 중 Canvas 작업을 이벤트로 남기고 Report entity ref를 표시한다. |
| 주형 Task          | `ReportTaskMapping`, task draft request                              | Report의 후속 작업을 실제 Task로 전환한다.                          |
| 은재 Review        | GitHub Issue/PR event payload, linked issue id                       | 회의에서 언급된 개발 작업과 Issue/PR 연결을 참조할 수 있다.         |

Breaking change가 발생하는 필드:

- `MeetingSession.status`
- `MeetingEvent.eventType`
- `MeetingReport.status`
- `MeetingReport.title`
- `MeetingReport.summary`
- `MeetingReport.mainTopics`
- `MeetingReport.decisions`
- `MeetingReport.followUps`
- `MeetingReport.nextAgenda`
- `MeetingReport.permissions`
- `ReportTaskMapping.taskId`
- `ReportTaskMapping.githubIssueId`
- `meeting.report.generate` output artifact

위 필드를 바꿀 때는 진호, 세인, 동현, 주형을 reviewer로 지정한다.

## Base Path

app-server uses the global `api` prefix. Runtime paths in this document are
listed as `/api/...`.

## Target Runtime APIs

### Scaffold

| Method | Path            | Purpose                                    |
| ------ | --------------- | ------------------------------------------ |
| `GET`  | `/api/meetings` | Meeting / Report module scaffold 상태 확인 |

### Recording / Tracking Session

| Method  | Path                                            | Purpose                           |
| ------- | ----------------------------------------------- | --------------------------------- |
| `POST`  | `/api/workspaces/:workspaceId/meeting-sessions` | 녹음/트래킹 세션 시작             |
| `GET`   | `/api/workspaces/:workspaceId/meeting-sessions` | workspace의 녹음/트래킹 세션 목록 |
| `GET`   | `/api/meeting-sessions/:sessionId`              | 녹음/트래킹 세션 상세             |
| `PATCH` | `/api/meeting-sessions/:sessionId/end`          | 녹음/트래킹 세션 종료             |

### Participants

| Method  | Path                                                          | Purpose                    |
| ------- | ------------------------------------------------------------- | -------------------------- |
| `POST`  | `/api/meeting-sessions/:sessionId/participants`               | 세션 참여자 snapshot 추가  |
| `GET`   | `/api/meeting-sessions/:sessionId/participants`               | 세션 참여자 목록           |
| `PATCH` | `/api/meeting-sessions/:sessionId/participants/:userId/leave` | 세션 참여자 퇴장 시각 기록 |

### Events / Memo / Transcript

| Method | Path                                                   | Purpose                             |
| ------ | ------------------------------------------------------ | ----------------------------------- |
| `POST` | `/api/meeting-sessions/:sessionId/events`              | 통합 이벤트 저장                    |
| `GET`  | `/api/meeting-sessions/:sessionId/events`              | 통합 이벤트 목록                    |
| `POST` | `/api/meeting-sessions/:sessionId/memos`               | 회의 중 메모를 `NOTE` event로 저장  |
| `POST` | `/api/meeting-sessions/:sessionId/transcript-segments` | STT transcript를 `STT` event로 저장 |

### Report

| Method   | Path                                                              | Purpose                              |
| -------- | ----------------------------------------------------------------- | ------------------------------------ |
| `POST`   | `/api/meeting-sessions/:sessionId/report-generation`              | Agent workflow 기반 Report 후보 생성 |
| `POST`   | `/api/meeting-sessions/:sessionId/report`                         | Report 직접 생성/mock 생성           |
| `GET`    | `/api/meeting-reports/:reportId`                                  | Report 상세                          |
| `PATCH`  | `/api/meeting-reports/:reportId`                                  | Report 수정                          |
| `DELETE` | `/api/meeting-reports/:reportId`                                  | Report 삭제                          |
| `PATCH`  | `/api/meeting-reports/:reportId/finalize`                         | Report 저장/확정                     |
| `GET`    | `/api/workspaces/:workspaceId/meeting-reports`                    | 페이지네이션된 workspace Report 목록 |
| `GET`    | `/api/workspaces/:workspaceId/meeting-reports/recent`             | Dashboard용 최근 Report 요약         |
| `GET`    | `/api/workspaces/:workspaceId/meeting-reports/canvas-entity-refs` | Canvas용 Report entity ref           |

Rules:

- `GET /api/workspaces/:workspaceId/meeting-reports`는 현재 사용자가 읽을 수 있는 Report만
  반환한다.
- `GET /api/workspaces/:workspaceId/meeting-reports`는 `page`, `pageSize` query를 받아
  `MeetingReportBoardPage`를 반환한다.
- 기본 `page`는 `1`, 기본 `pageSize`는 `10`, 최대 `pageSize`는 `50`이다.
- `GET /api/meeting-reports/:reportId`는 `permissions.canRead = false`이면 HTTP 403
  Forbidden을 반환한다.
- `PATCH /api/meeting-reports/:reportId`는 `permissions.canEdit = false`이면 HTTP 403
  Forbidden을 반환한다.
- 목록과 상세 read model은 현재 사용자 기준 `permissions.canRead`, `permissions.canEdit`을
  포함해야 한다.

### Task / GitHub Issue Mapping

| Method  | Path                                           | Purpose                                 |
| ------- | ---------------------------------------------- | --------------------------------------- |
| `POST`  | `/api/meeting-reports/:reportId/task-mappings` | 후속 작업과 Task/GitHub Issue 연결 생성 |
| `GET`   | `/api/meeting-reports/:reportId/task-mappings` | Report의 Task/GitHub Issue 연결 목록    |
| `PATCH` | `/api/report-task-mappings/:mappingId`         | Task 또는 GitHub Issue 연결 갱신        |

## Input Data Captured During Recording

녹음/트래킹 세션이 `IN_PROGRESS`인 동안 아래 입력이 `meeting_events`로 저장될 수 있다.

| Input             | Event Type   | Description                                                         |
| ----------------- | ------------ | ------------------------------------------------------------------- |
| 챗봇과의 채팅내역 | `CHAT`       | 회의와 관련된 내용만 포함한다.                                      |
| Canvas 작업       | `CANVAS`     | 회의 중 생성/수정/삭제된 Canvas shapes/connections 내용을 포함한다. |
| 메모              | `NOTE`       | 회의 중 작성 가능한 텍스트 메모다.                                  |
| Canvas 투표 결과  | `CANVAS`     | MVP 제외. 이후 payload subtype으로 확장한다.                        |
| Task 변경         | `TASK`       | 회의 중 생성/수정/삭제된 Task event다.                              |
| GitHub Issue/PR   | `GITHUB`     | 회의에서 언급된 개발 작업과 관련 Issue/PR이다.                      |
| 음성방 상태       | `VOICE_ROOM` | 음성방 참여/퇴장, 마이크 상태 변경 같은 voice room event다.         |
| 음성 transcript   | `STT`        | 녹음된 음성을 STT로 전사한 전체 내용이다.                           |

## Meeting Event Payload Contract

이 섹션은 `meeting_events.payload`의 도메인별 JSON 계약이다. 녹음/트래킹 세션이
`IN_PROGRESS`인 동안 발생한 workspace CUD 작업은 이 계약을 따라 `meeting_events`에
기록한다.

General rules:

- Canvas 용어는 항상 `shapes`와 `connections`만 사용한다.
- `event_type`은 상위 분류이고, 실제 행위는 `payload.action`으로 구분한다.
- PR review 요청, PR comment, Issue 상태 변경은 별도 event type을 만들지 않고
  `event_type = GITHUB`로 저장한다.
- `meeting_events.user_id`는 event를 발생시킨 사용자의 user id를 복사한다. system/STT
  event면 `null`일 수 있다.
- `payload.actor`는 UI/Agent가 읽을 수 있는 actor snapshot이다. user/member 이름이 나중에
  바뀌어도 회의 당시 맥락을 유지하기 위해 저장한다.
- `payload.target`은 event가 직접 바꾼 대상을 가리킨다. `workspaceId`, `entityType`,
  `entityId`는 모든 domain event에서 필수다.
- `payload.source.clientEventId` 또는 `payload.source.requestId`가 있으면 같은 값으로 들어온
  중복 event는 idempotent하게 처리한다.
- secret, OAuth token, GitHub token, LiveKit token, raw credential은 payload에 저장하지
  않는다.
- App Server는 `apps/app-server/src/modules/meeting/types/meeting-event-payload.schema.ts`의
  `validateMeetingEventPayloadContract(eventType, payload)`를 통과한 payload만
  `meeting_events`에 저장할 수 있다.
- schema validation에 실패한 `POST /api/meeting-sessions/:sessionId/events` 요청은
  `400 Bad Request`로 거절한다. mock 저장소와 테스트 fixture도 이 예외를 우회하면 안 된다.

### Base Schema

```ts
type MeetingEventPayloadSchemaVersion = "meeting-event.v1";

type MeetingEventSourceDomain =
  | "canvas"
  | "task"
  | "github"
  | "chat"
  | "voice_room";

type MeetingEventEntityType =
  | "canvas_shape"
  | "canvas_connection"
  | "task"
  | "github_pull_request"
  | "github_issue"
  | "github_comment"
  | "chat_message"
  | "voice_room"
  | "voice_session";

type MeetingEventChangeOperation = "CREATE" | "UPDATE" | "DELETE" | "STATE";

interface MeetingEventActorRef {
  userId: string | null;
  memberId: string | null;
  displayName: string | null;
}

interface MeetingEventSourceRef {
  domain: MeetingEventSourceDomain;
  clientEventId?: string;
  requestId?: string;
}

interface MeetingEventTargetRef {
  workspaceId: string;
  entityType: MeetingEventEntityType;
  entityId: string;
  boardId?: string;
  voiceRoomId?: string;
}

interface MeetingEventChange<TPatch, TSnapshot> {
  operation: MeetingEventChangeOperation;
  changedFields: string[];
  before: TPatch | null;
  after: TPatch | null;
  snapshot: TSnapshot | null;
}

interface MeetingEventPayloadBase<TAction extends string, TPatch, TSnapshot> {
  schemaVersion: MeetingEventPayloadSchemaVersion;
  action: TAction;
  occurredAt: string;
  source: MeetingEventSourceRef;
  actor: MeetingEventActorRef;
  target: MeetingEventTargetRef;
  change: MeetingEventChange<TPatch, TSnapshot>;
  summary: string;
}
```

### Diff vs Snapshot Rule

Update event는 전체 snapshot만 저장하지 않는다. 변경된 필드의 `before`/`after` diff와
Agent가 문맥을 즉시 파악할 수 있는 compact `snapshot`을 함께 저장한다.

| Operation | `before`                    | `after`                     | `snapshot`                                |
| --------- | --------------------------- | --------------------------- | ----------------------------------------- |
| `CREATE`  | `null`                      | 생성된 주요 필드 전체       | 생성 후 compact snapshot                  |
| `UPDATE`  | 변경된 필드의 이전 값만     | 변경된 필드의 이후 값만     | 변경 후 compact snapshot                  |
| `DELETE`  | 삭제 직전 주요 필드 전체    | `null`                      | `null`                                    |
| `STATE`   | 상태 변경 전 값 또는 `null` | 상태 변경 후 값 또는 `null` | 상태 변경 후 compact snapshot 또는 `null` |

이 구조를 쓰는 이유:

- diff만 저장하면 Agent가 제목, 담당자, 연결 대상 같은 주변 맥락을 잃기 쉽다.
- 전체 snapshot만 저장하면 변경 이유와 변경 필드가 불명확하고 저장량이 불필요하게 커진다.
- 따라서 update는 diff를 기준으로 하되, Report 생성에 필요한 최소 표시 정보를 snapshot에
  함께 둔다.

### `CANVAS` Payload

Canvas event는 Canvas domain의 `shapes`와 `connections` 변경만 기록한다. Canvas는 원본
Task, Meeting Report, GitHub data를 수정하지 않고, Canvas 계약의 `entityType`/`entityId`로
참조만 남긴다.

```ts
type CanvasMeetingEventAction =
  | "SHAPE_CREATED"
  | "SHAPE_UPDATED"
  | "SHAPE_DELETED"
  | "SHAPE_DISPLAY_TITLE_CHANGED"
  | "SHAPE_POSITION_CHANGED"
  | "CONNECTION_CREATED"
  | "CONNECTION_UPDATED"
  | "CONNECTION_DELETED"
  | "CONNECTION_LABEL_CHANGED";

type CanvasEntityType =
  | "task"
  | "meeting_report"
  | "pull_request"
  | "github_issue"
  | "document"
  | "file"
  | "code"
  | "decision"
  | "risk";

interface CanvasShapeSnapshot {
  shapeId: string;
  boardId: string;
  shapeType: CanvasEntityType;
  entityType: CanvasEntityType;
  entityId: string;
  displayTitle: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  color?: string;
}

interface CanvasConnectionSnapshot {
  connectionId: string;
  boardId: string;
  sourceShapeId: string;
  targetShapeId: string;
  connectionType: string;
  label: string | null;
}

type CanvasMeetingPatch =
  | Partial<CanvasShapeSnapshot>
  | Partial<CanvasConnectionSnapshot>;

type CanvasMeetingSnapshot = CanvasShapeSnapshot | CanvasConnectionSnapshot;

interface CanvasMeetingEventPayload
  extends MeetingEventPayloadBase<
    CanvasMeetingEventAction,
    CanvasMeetingPatch,
    CanvasMeetingSnapshot
  > {
  source: MeetingEventSourceRef & { domain: "canvas" };
  target: MeetingEventTargetRef & {
    entityType: "canvas_shape" | "canvas_connection";
    boardId: string;
  };
}
```

Required fields:

- `schemaVersion`, `action`, `occurredAt`, `source.domain`, `actor`, `target`, `change`,
  `summary`
- `target.workspaceId`, `target.boardId`, `target.entityType`, `target.entityId`
- shape event: `target.entityType = "canvas_shape"`, `target.entityId = shapeId`
- connection event: `target.entityType = "canvas_connection"`, `target.entityId = connectionId`

Example:

```json
{
  "eventType": "CANVAS",
  "userId": "user-1",
  "payload": {
    "schemaVersion": "meeting-event.v1",
    "action": "SHAPE_POSITION_CHANGED",
    "occurredAt": "2026-06-27T08:41:12.000Z",
    "source": {
      "domain": "canvas",
      "clientEventId": "canvas-evt-001"
    },
    "actor": {
      "userId": "user-1",
      "memberId": "member-1",
      "displayName": "Alex Linderman"
    },
    "target": {
      "workspaceId": "workspace-1",
      "boardId": "board-1",
      "entityType": "canvas_shape",
      "entityId": "shape-1"
    },
    "change": {
      "operation": "UPDATE",
      "changedFields": ["position"],
      "before": {
        "position": {
          "x": 80,
          "y": 120
        }
      },
      "after": {
        "position": {
          "x": 160,
          "y": 180
        }
      },
      "snapshot": {
        "shapeId": "shape-1",
        "boardId": "board-1",
        "shapeType": "task",
        "entityType": "task",
        "entityId": "task-1",
        "displayTitle": "OAuth callback",
        "position": {
          "x": 160,
          "y": 180
        },
        "size": {
          "width": 280,
          "height": 160
        },
        "color": "#6d5bd6"
      }
    },
    "summary": "Canvas task shape moved: OAuth callback"
  },
  "createdAt": "2026-06-27T08:41:12.000Z"
}
```

### `TASK` Payload

```ts
type TaskMeetingEventAction =
  | "TASK_CREATED"
  | "TASK_UPDATED"
  | "TASK_DELETED"
  | "TASK_STATUS_CHANGED"
  | "TASK_ASSIGNEE_CHANGED"
  | "TASK_DESCRIPTION_CHANGED"
  | "TASK_DUE_DATE_CHANGED"
  | "TASK_PRIORITY_CHANGED";

interface TaskSnapshot {
  taskId: string;
  title: string;
  status: string;
  assigneeMemberId: string | null;
  priority?: string | null;
  dueDate?: string | null;
  descriptionExcerpt?: string | null;
}

interface TaskMeetingEventPayload
  extends MeetingEventPayloadBase<
    TaskMeetingEventAction,
    Partial<TaskSnapshot>,
    TaskSnapshot
  > {
  source: MeetingEventSourceRef & { domain: "task" };
  target: MeetingEventTargetRef & {
    entityType: "task";
    entityId: string;
  };
}
```

Required fields:

- `target.workspaceId`, `target.entityType = "task"`, `target.entityId = taskId`
- `change.changedFields`
- create/delete: compact Task snapshot in `after` or `before`
- update/state change: changed field diff plus post-change `snapshot`

Example:

```json
{
  "eventType": "TASK",
  "userId": "user-2",
  "payload": {
    "schemaVersion": "meeting-event.v1",
    "action": "TASK_STATUS_CHANGED",
    "occurredAt": "2026-06-27T08:44:00.000Z",
    "source": {
      "domain": "task",
      "requestId": "req-task-001"
    },
    "actor": {
      "userId": "user-2",
      "memberId": "member-2",
      "displayName": "Sarah Kinski"
    },
    "target": {
      "workspaceId": "workspace-1",
      "entityType": "task",
      "entityId": "task-1"
    },
    "change": {
      "operation": "UPDATE",
      "changedFields": ["status"],
      "before": {
        "status": "todo"
      },
      "after": {
        "status": "in_progress"
      },
      "snapshot": {
        "taskId": "task-1",
        "title": "OAuth callback 처리",
        "status": "in_progress",
        "assigneeMemberId": "member-2",
        "priority": "high",
        "dueDate": "2026-07-03",
        "descriptionExcerpt": "Google/GitHub callback 실패 상태를 처리한다."
      }
    },
    "summary": "Task moved to in_progress: OAuth callback 처리"
  },
  "createdAt": "2026-06-27T08:44:00.000Z"
}
```

### `GITHUB` Payload

GitHub PR review 요청, comment, Issue 상태 변경은 `event_type = GITHUB`와 action enum으로
구분한다.

```ts
type GithubMeetingEventAction =
  | "PR_REVIEW_REQUESTED"
  | "PR_COMMENT_CREATED"
  | "PR_STATUS_CHANGED"
  | "PR_MERGED"
  | "ISSUE_STATUS_CHANGED"
  | "ISSUE_COMMENT_CREATED"
  | "ISSUE_LINKED_TO_TASK";

interface GithubSnapshot {
  provider: "github";
  repositoryId: string;
  repositoryFullName: string;
  pullRequestId?: string;
  issueId?: string;
  commentId?: string;
  title?: string;
  state?: string;
  url: string;
  authorLogin?: string | null;
  bodyExcerpt?: string | null;
}

interface GithubMeetingEventPayload
  extends MeetingEventPayloadBase<
    GithubMeetingEventAction,
    Partial<GithubSnapshot>,
    GithubSnapshot
  > {
  source: MeetingEventSourceRef & { domain: "github" };
  target: MeetingEventTargetRef & {
    entityType: "github_pull_request" | "github_issue" | "github_comment";
    entityId: string;
  };
}
```

Required fields:

- `target.workspaceId`, `target.entityType`, `target.entityId`
- `snapshot.provider`, `snapshot.repositoryId`, `snapshot.repositoryFullName`, `snapshot.url`
- PR actions: `pullRequestId`
- Issue actions: `issueId`
- comment actions: `commentId`, `bodyExcerpt`

Example:

```json
{
  "eventType": "GITHUB",
  "userId": "user-3",
  "payload": {
    "schemaVersion": "meeting-event.v1",
    "action": "PR_COMMENT_CREATED",
    "occurredAt": "2026-06-27T08:46:20.000Z",
    "source": {
      "domain": "github",
      "requestId": "github-webhook-001"
    },
    "actor": {
      "userId": "user-3",
      "memberId": "member-3",
      "displayName": "Marcus Jenson"
    },
    "target": {
      "workspaceId": "workspace-1",
      "entityType": "github_comment",
      "entityId": "comment-99"
    },
    "change": {
      "operation": "CREATE",
      "changedFields": ["commentId", "bodyExcerpt"],
      "before": null,
      "after": {
        "provider": "github",
        "repositoryId": "repo-1",
        "repositoryFullName": "team/pilo",
        "pullRequestId": "pr-12",
        "commentId": "comment-99",
        "url": "https://github.com/team/pilo/pull/12#discussion_r99",
        "authorLogin": "marcus",
        "bodyExcerpt": "이 auth callback 경계는 실패 상태를 UI에 노출해야 합니다."
      },
      "snapshot": {
        "provider": "github",
        "repositoryId": "repo-1",
        "repositoryFullName": "team/pilo",
        "pullRequestId": "pr-12",
        "commentId": "comment-99",
        "title": "OAuth callback handling",
        "state": "open",
        "url": "https://github.com/team/pilo/pull/12#discussion_r99",
        "authorLogin": "marcus",
        "bodyExcerpt": "이 auth callback 경계는 실패 상태를 UI에 노출해야 합니다."
      }
    },
    "summary": "GitHub PR comment added on PR #12"
  },
  "createdAt": "2026-06-27T08:46:20.000Z"
}
```

### `CHAT` Payload

```ts
type ChatMeetingEventAction =
  | "MESSAGE_SENT"
  | "MESSAGE_EDITED"
  | "MESSAGE_DELETED";

interface ChatMessageSnapshot {
  messageId: string;
  threadId: string | null;
  body: string | null;
  mentions: Array<{ memberId: string; displayName: string }>;
  attachmentRefs?: Array<{ fileId: string; displayName: string }>;
}

interface ChatMeetingEventPayload
  extends MeetingEventPayloadBase<
    ChatMeetingEventAction,
    Partial<ChatMessageSnapshot>,
    ChatMessageSnapshot
  > {
  source: MeetingEventSourceRef & { domain: "chat" };
  target: MeetingEventTargetRef & {
    entityType: "chat_message";
    entityId: string;
  };
}
```

Required fields:

- `target.workspaceId`, `target.entityType = "chat_message"`, `target.entityId = messageId`
- `body` for `MESSAGE_SENT` and `MESSAGE_EDITED`
- `mentions` defaults to `[]`

Example:

```json
{
  "eventType": "CHAT",
  "userId": "user-1",
  "payload": {
    "schemaVersion": "meeting-event.v1",
    "action": "MESSAGE_SENT",
    "occurredAt": "2026-06-27T08:47:05.000Z",
    "source": {
      "domain": "chat",
      "clientEventId": "chat-evt-001"
    },
    "actor": {
      "userId": "user-1",
      "memberId": "member-1",
      "displayName": "Alex Linderman"
    },
    "target": {
      "workspaceId": "workspace-1",
      "entityType": "chat_message",
      "entityId": "message-1"
    },
    "change": {
      "operation": "CREATE",
      "changedFields": ["body", "mentions"],
      "before": null,
      "after": {
        "messageId": "message-1",
        "threadId": null,
        "body": "이 내용은 후속 Task로 빼는 게 좋겠습니다.",
        "mentions": [
          {
            "memberId": "member-2",
            "displayName": "Sarah Kinski"
          }
        ]
      },
      "snapshot": {
        "messageId": "message-1",
        "threadId": null,
        "body": "이 내용은 후속 Task로 빼는 게 좋겠습니다.",
        "mentions": [
          {
            "memberId": "member-2",
            "displayName": "Sarah Kinski"
          }
        ],
        "attachmentRefs": []
      }
    },
    "summary": "Chat message sent during recording"
  },
  "createdAt": "2026-06-27T08:47:05.000Z"
}
```

### `VOICE_ROOM` Payload

Voice room event는 음성방 참여/퇴장, 마이크 상태 변경, speaking 상태 변경을 기록한다.
녹화/트래킹 구간 자체의 시작/종료는 `MeetingSession` API가 소유한다.

```ts
type VoiceRoomMeetingEventAction =
  | "PARTICIPANT_JOINED"
  | "PARTICIPANT_LEFT"
  | "MICROPHONE_MUTED"
  | "MICROPHONE_UNMUTED"
  | "SPEAKING_STARTED"
  | "SPEAKING_STOPPED";

interface VoiceRoomSnapshot {
  voiceRoomId: string;
  voiceSessionId: string | null;
  memberId: string | null;
  displayName: string | null;
  microphoneState: "muted" | "unmuted" | "unknown";
  speaking: boolean;
}

interface VoiceRoomMeetingEventPayload
  extends MeetingEventPayloadBase<
    VoiceRoomMeetingEventAction,
    Partial<VoiceRoomSnapshot>,
    VoiceRoomSnapshot
  > {
  source: MeetingEventSourceRef & { domain: "voice_room" };
  target: MeetingEventTargetRef & {
    entityType: "voice_room" | "voice_session";
    voiceRoomId: string;
  };
}
```

Required fields:

- `target.workspaceId`, `target.voiceRoomId`
- participant-specific actions: `voiceSessionId`, `memberId`
- microphone actions: `microphoneState`
- speaking actions: `speaking`

Example:

```json
{
  "eventType": "VOICE_ROOM",
  "userId": "user-2",
  "payload": {
    "schemaVersion": "meeting-event.v1",
    "action": "MICROPHONE_MUTED",
    "occurredAt": "2026-06-27T08:48:30.000Z",
    "source": {
      "domain": "voice_room",
      "clientEventId": "voice-evt-001"
    },
    "actor": {
      "userId": "user-2",
      "memberId": "member-2",
      "displayName": "Sarah Kinski"
    },
    "target": {
      "workspaceId": "workspace-1",
      "voiceRoomId": "voice-room-1",
      "entityType": "voice_session",
      "entityId": "voice-session-2"
    },
    "change": {
      "operation": "STATE",
      "changedFields": ["microphoneState"],
      "before": {
        "microphoneState": "unmuted"
      },
      "after": {
        "microphoneState": "muted"
      },
      "snapshot": {
        "voiceRoomId": "voice-room-1",
        "voiceSessionId": "voice-session-2",
        "memberId": "member-2",
        "displayName": "Sarah Kinski",
        "microphoneState": "muted",
        "speaking": false
      }
    },
    "summary": "Sarah Kinski muted microphone"
  },
  "createdAt": "2026-06-27T08:48:30.000Z"
}
```

## Report Includes

| Field                | Description                                  |
| -------------------- | -------------------------------------------- |
| `title`              | Report 제목                                  |
| `summary`            | 전체 회의 내용 요약                          |
| `mainTopics`         | 주요 논의 주제 목록                          |
| `decisions`          | 최종 결정된 내용                             |
| `generatedTasks`     | 회의 결과 생성 또는 생성 후보가 된 Task      |
| `linkedGithubIssues` | 관련 GitHub Issue 목록                       |
| `followUps`          | 앞으로 해야 할 작업                          |
| `nextAgenda`         | 다음에 논의할 후보 목록. 별도 객체가 아니다. |

## User Flow

1. 사용자가 workspace 또는 Canvas에서 음성방에 참여한다.
2. 사용자가 회의 녹화 버튼을 눌러 녹음/트래킹 세션을 시작한다.
3. 회의 중 채팅, 메모, Canvas 작업, Task 변경, GitHub Issue/PR 언급, STT transcript가
   이벤트로 기록된다.
4. 사용자가 회의 녹화 종료 버튼을 누르거나 음성 세션에서 나간다.
5. Agent가 기록된 이벤트를 바탕으로 Report 생성 후보를 만든다.
6. 사용자가 Report를 확인하고 수정 또는 삭제한다.
7. 사용자가 Report를 저장/확정한다.
8. 사용자가 후속 작업을 Task로 생성한다.
9. 개발 태그가 붙은 Task는 GitHub Issue와 연결한다.

## Main Features

| Feature             | Description                                                          | Priority |
| ------------------- | -------------------------------------------------------------------- | -------- |
| 음성방 참여         | 현재 workspace의 기본/선택된 음성방에 참여한다.                      | Must     |
| 회의 녹화 시작      | 음성 세션 참여 중 녹음/트래킹 세션을 시작한다.                       | Must     |
| 회의 메모 작성      | 녹음/트래킹 세션 중 텍스트 메모를 작성한다.                          | Must     |
| 회의 녹화 종료      | 녹음/트래킹 세션을 종료한다.                                         | Should   |
| Event Tracking      | 녹음 중 STT, 채팅, Canvas, 메모, Task, GitHub 이벤트를 저장한다.     | Must     |
| Report 생성         | Agent가 회의 내용을 Report 후보로 정리한다.                          | Must     |
| Report 수정         | 사용자가 Report 내용을 수정한다.                                     | Should   |
| Report 게시판       | workspace Report 목록을 표 형태로 조회하고 row 클릭으로 상세를 연다. | Must     |
| Report 권한 모드    | 권한에 따라 상세 모달 페이지를 편집 가능/읽기 전용으로 표시한다.     | Must     |
| Report 페이지네이션 | 회의록 전용 페이지는 페이지네이션으로 목록을 조회한다.               | Must     |
| Task 전환           | 후속 작업을 Task로 생성한다.                                         | Must     |
| Issue 연결          | 생성된 Task를 GitHub Issue와 연결한다.                               | Should   |
| Report 조회         | 과거 Report 목록/상세를 조회한다.                                    | Must     |

Future scope:

| Feature            | Description                                                           | Priority |
| ------------------ | --------------------------------------------------------------------- | -------- |
| 음성방 생성        | workspace 안에 새 음성방을 만든다.                                    | Later    |
| 음성방 삭제        | workspace의 음성방을 삭제하거나 보관 처리한다.                        | Later    |
| 음성방 목록 관리   | workspace의 여러 음성방을 목록으로 조회/선택한다.                     | Later    |
| Report vector 저장 | 전역 RAG/embedding scope가 열리면 Report를 pgvector index에 저장한다. | Later    |

## Acceptance Criteria

- 사용자는 회의 내용을 텍스트 메모로 기록할 수 있어야 한다.
- Agent는 회의 내용을 요약하고 결정사항과 후속 작업을 분리해야 한다.
- 사용자는 후속 작업을 선택해 Task로 생성할 수 있어야 한다.
- Report는 workspace에 저장되어야 한다.
- 녹음/트래킹이 시작된 뒤 종료되기 전까지 발생한 이벤트만 해당 Report의 입력으로
  사용해야 한다.
- 회의록 게시판의 row를 클릭하면 Report 상세 모달 페이지가 열려야 한다.
- 사용자가 Report를 읽을 권한만 있으면 상세 모달 페이지는 읽기 전용이어야 한다.
- 사용자가 Report를 편집할 권한이 있으면 같은 상세 모달 페이지에서 바로 수정할 수 있어야
  한다.
- Report 수정 API는 편집 권한이 없는 사용자에게 성공하면 안 된다.
- 회의록(리포트) 전용 페이지는 페이지네이션된 목록을 사용해야 하며 각 페이지는 `No`,
  `Date`, `Title`, `Participants`, `Key Summary`를 표시해야 한다.
- 현재 MVP 화면은 음성방 생성/삭제/목록 관리를 요구하지 않아야 한다.
- 독립적인 `meeting` 객체나 별도 회의 계획 항목 기능을 전제로 하면 안 된다.

## Database Schema

### `meeting_sessions`

녹음/트래킹 세션이다. meeting 객체가 아니다.

| Column                        | Type           | Constraints | Description                                                          |
| ----------------------------- | -------------- | ----------- | -------------------------------------------------------------------- |
| `id`                          | `UUID`         | PK          | 세션 고유 식별자                                                     |
| `workspace_id`                | `UUID`         | FK          | 연관된 워크스페이스 ID                                               |
| `voice_room_id`               | `UUID`         | FK          | 녹화/트래킹이 발생한 음성방 ID. `voice_rooms.id`를 참조한다.         |
| `started_by_voice_session_id` | `UUID`         | FK          | 녹화를 시작한 사용자의 음성 세션 ID. `voice_sessions.id`를 참조한다. |
| `status`                      | `VARCHAR(20)`  | NOT NULL    | `IN_PROGRESS`, `COMPLETED`                                           |
| `started_at`                  | `TIMESTAMP`    | NOT NULL    | 녹화/트래킹 시작 시간                                                |
| `ended_at`                    | `TIMESTAMP`    | NULL        | 종료 시간                                                            |
| `livekit_room_id`             | `VARCHAR(255)` | NULL        | LiveKit Room 식별자                                                  |

### `meeting_participants`

녹음/트래킹 세션에 참여한 사용자 snapshot이다.

| Column       | Type        | Constraints | Description         |
| ------------ | ----------- | ----------- | ------------------- |
| `session_id` | `UUID`      | PK, FK      | 연관된 회의 세션 ID |
| `user_id`    | `UUID`      | PK, FK      | 참여한 사용자 ID    |
| `joined_at`  | `TIMESTAMP` | NOT NULL    | 입장 시간           |
| `left_at`    | `TIMESTAMP` | NULL        | 퇴장 시간           |

### `meeting_events`

녹음/트래킹 중 발생한 모든 정보를 담는 통합 이벤트 테이블이다.

| Column       | Type          | Constraints | Description                                                     |
| ------------ | ------------- | ----------- | --------------------------------------------------------------- |
| `id`         | `BIGSERIAL`   | PK          | 이벤트 고유 식별자                                              |
| `session_id` | `UUID`        | FK          | 연관된 회의 세션 ID                                             |
| `event_type` | `VARCHAR(50)` | NOT NULL    | `STT`, `CHAT`, `CANVAS`, `NOTE`, `TASK`, `GITHUB`, `VOICE_ROOM` |
| `user_id`    | `UUID`        | FK          | 이벤트를 발생시킨 사용자 ID                                     |
| `payload`    | `JSONB`       | NOT NULL    | 이벤트 상세 데이터                                              |
| `created_at` | `TIMESTAMP`   | NOT NULL    | 이벤트 발생 시간                                                |

### `meeting_reports`

workspace 음성방에서 나온 결과물을 저장하는 Report 테이블이다. 팀에서 말하는
`meeting_result` 개념에 해당한다.

| Column        | Type          | Constraints | Description                                    |
| ------------- | ------------- | ----------- | ---------------------------------------------- |
| `id`          | `UUID`        | PK          | 리포트 고유 식별자                             |
| `session_id`  | `UUID`        | FK, UNIQUE  | 연관된 녹음/트래킹 세션 ID                     |
| `title`       | `TEXT`        | NOT NULL    | Report 제목. 비어 있으면 서버가 기본 제목 생성 |
| `summary`     | `TEXT`        | NULL        | 회의 전체 요약                                 |
| `main_topics` | `JSONB`       | NULL        | 논의된 주제 목록                               |
| `decisions`   | `JSONB`       | NULL        | 최종 결정 사항                                 |
| `follow_ups`  | `JSONB`       | NULL        | 후속 작업 목록                                 |
| `next_agenda` | `JSONB`       | NULL        | 다음에 논의할 후보 목록. 별도 객체가 아니다.   |
| `status`      | `VARCHAR(20)` | NOT NULL    | `DRAFT`, `FINALIZED`                           |
| `created_at`  | `TIMESTAMP`   | NOT NULL    | 리포트 생성 시간                               |
| `updated_at`  | `TIMESTAMP`   | NOT NULL    | 리포트 수정 시간                               |

### `report_tasks_mapping`

Report의 후속 작업, 내부 Task, GitHub Issue를 연결한다.

| Column            | Type           | Constraints | Description                         |
| ----------------- | -------------- | ----------- | ----------------------------------- |
| `id`              | `UUID`         | PK          | 매핑 고유 식별자                    |
| `report_id`       | `UUID`         | FK          | 연관된 리포트 ID                    |
| `task_id`         | `UUID`         | FK, NULL    | 생성/연결된 내부 Task ID            |
| `github_issue_id` | `VARCHAR(255)` | NULL        | 연관된 GitHub Issue ID              |
| `is_generated`    | `BOOLEAN`      | NOT NULL    | AI에 의해 자동 생성된 항목인지 여부 |

## Deferred RAG / Pgvector Extension

현행 기준 문서(`docs/api-contract-v1.md`, `docs/domain-boundary-v1.md`,
`docs/mvp-scope-v1.md`, `docs/db/mvp-db-schema-v1.md`)는 RAG/embedding/vector index를
MVP 제외로 둔다. 따라서 아래 내용은 현재 구현 필수 범위가 아니다.

전역 RAG/embedding scope가 열리면 Meeting / Report는 저장된 Report를 Agent RAG 데이터로
사용할 수 있도록 pgvector index에 저장할 수 있다. 이때 전역 Agent/RAG contract가 따로
정의되어 있으면 그 문서를 우선한다.

Deferred API:

| Method | Path                                          | Purpose                                        |
| ------ | --------------------------------------------- | ---------------------------------------------- |
| `POST` | `/api/meeting-reports/:reportId/vector-index` | Report 내용을 pgvector RAG index에 저장/재생성 |

Deferred request option:

```json
{
  "saveToVectorStore": true
}
```

- `saveToVectorStore`는 현재 MVP `CreateMeetingReportRequest` 또는
  `UpdateMeetingReportRequest`의 필드가 아니다.
- 전역 RAG scope가 열리기 전까지 frontend는 이 값을 보내지 않는다.
- 전역 RAG scope가 열리면 Report 저장/수정 후 system 또는 Agent 권한으로 vector index를
  생성/갱신할 수 있다.

Deferred table:

### `meeting_report_embeddings`

Report를 Agent RAG 데이터로 사용하기 위한 pgvector index table이다. PostgreSQL `vector`
extension이 필요하다.

| Column            | Type           | Constraints | Description                                                  |
| ----------------- | -------------- | ----------- | ------------------------------------------------------------ |
| `id`              | `UUID`         | PK          | embedding row 고유 식별자                                    |
| `workspace_id`    | `UUID`         | FK          | 권한 필터링과 workspace-scoped RAG 조회용 workspace ID       |
| `report_id`       | `UUID`         | FK          | 연관된 Report ID                                             |
| `chunk_key`       | `VARCHAR(100)` | NOT NULL    | Report 안에서 chunk를 식별하는 stable key                    |
| `content`         | `TEXT`         | NOT NULL    | embedding에 사용한 원문 chunk                                |
| `content_hash`    | `VARCHAR(64)`  | NOT NULL    | 같은 chunk 중복 저장 방지용 hash                             |
| `embedding`       | `VECTOR(1536)` | NOT NULL    | pgvector embedding 값. dimension은 embedding model과 맞춘다. |
| `embedding_model` | `VARCHAR(100)` | NOT NULL    | embedding 생성에 사용한 model id                             |
| `metadata`        | `JSONB`        | NOT NULL    | source field, report status, participant 등 검색 metadata    |
| `is_active`       | `BOOLEAN`      | NOT NULL    | 현재 RAG에서 사용할 row인지 여부                             |
| `created_at`      | `TIMESTAMP`    | NOT NULL    | 생성 시간                                                    |
| `updated_at`      | `TIMESTAMP`    | NOT NULL    | 갱신 시간                                                    |

Deferred index rules:

- `(workspace_id, report_id, chunk_key)`는 unique해야 한다.
- vector similarity index는 pgvector HNSW 또는 IVFFlat 중 운영 기준에 맞게 둔다.
- Agent RAG는 반드시 `workspace_id`, `is_active = true`, Report read permission으로
  필터링한 뒤 vector search를 수행한다.
- Report가 삭제되면 연결된 pgvector row도 삭제하거나 `is_active = false`로 비활성화해야
  한다.

## Request DTOs

### CreateMeetingSessionRequest

```json
{
  "voiceRoomId": "uuid",
  "startedByVoiceSessionId": "uuid",
  "livekitRoomId": "pilo-workspace-voice-room"
}
```

- `workspaceId`는 path에서 받는다.
- `voiceRoomId`: required. workspace에 붙은 음성방 ID다.
- `startedByVoiceSessionId`: required. 녹음을 시작한 사용자의 음성 세션 ID다.
- `livekitRoomId`: nullable provider room id.

### EndMeetingSessionRequest

```json
{
  "endedAt": "2026-06-27T09:30:00.000Z"
}
```

- `endedAt`: optional ISO date-time. 없으면 서버 시간이 들어간다.
- 종료 시 `status = COMPLETED`가 된다.

### CreateMeetingEventRequest

```json
{
  "eventType": "TASK",
  "userId": "user-2",
  "payload": {
    "schemaVersion": "meeting-event.v1",
    "action": "TASK_STATUS_CHANGED",
    "occurredAt": "2026-06-27T08:44:00.000Z",
    "source": {
      "domain": "task",
      "requestId": "req-task-001"
    },
    "actor": {
      "userId": "user-2",
      "memberId": "member-2",
      "displayName": "Sarah Kinski"
    },
    "target": {
      "workspaceId": "workspace-1",
      "entityType": "task",
      "entityId": "task-1"
    },
    "change": {
      "operation": "UPDATE",
      "changedFields": ["status"],
      "before": {
        "status": "todo"
      },
      "after": {
        "status": "in_progress"
      },
      "snapshot": {
        "taskId": "task-1",
        "title": "OAuth 실패 상태 UI 추가",
        "status": "in_progress",
        "assigneeMemberId": "member-2",
        "priority": "high",
        "dueDate": "2026-07-03",
        "descriptionExcerpt": "Google/GitHub callback 실패 상태를 처리한다."
      }
    },
    "summary": "Task moved to in_progress: OAuth 실패 상태 UI 추가"
  },
  "createdAt": "2026-06-27T08:40:00.000Z"
}
```

- `eventType`: `STT`, `CHAT`, `CANVAS`, `NOTE`, `TASK`, `GITHUB`, `VOICE_ROOM`
- `userId`: nullable. 시스템/STT 이벤트면 `null` 가능
- `payload`: required JSON object. `CANVAS`, `TASK`, `GITHUB`, `CHAT`, `VOICE_ROOM`은
  `validateMeetingEventPayloadContract(eventType, payload)` validation을 통과해야 한다.
- `createdAt`: optional ISO date-time. 없으면 서버 시간이 들어간다.

### CreateMeetingMemoRequest

```json
{
  "body": "후속 작업은 Task로 전환한다."
}
```

- 메모는 별도 table이 아니라 `meeting_events.event_type = NOTE`로 저장한다.
- 세션이 `IN_PROGRESS`일 때만 작성할 수 있다.

### CreateTranscriptSegmentRequest

```json
{
  "speakerUserId": "uuid",
  "body": "회의록은 agent workflow로 생성한다.",
  "startedAt": "2026-06-27T08:30:00.000Z",
  "endedAt": "2026-06-27T08:30:05.000Z"
}
```

- transcript segment는 별도 table이 아니라 `meeting_events.event_type = STT`로 저장한다.
- `speakerUserId`, `startedAt`, `endedAt`은 `payload`에 들어간다.

### CreateMeetingReportRequest

```json
{
  "title": "Sprint Planning: Q4 Infra",
  "summary": "로그인, Task, Canvas, Review의 contract 우선순위를 확정했다.",
  "mainTopics": ["Task 전환", "GitHub Issue 연결"],
  "decisions": ["후속 작업은 Task 후보로 먼저 만든다."],
  "followUps": ["OAuth 실패 상태 UI를 추가한다."],
  "nextAgenda": ["TaskCreateDraft 실제 연동 확인"]
}
```

- `sessionId`는 path에서 받는다.
- `title`: optional. 비어 있으면 서버가 transcript 또는 `MeetingSession.startedAt` 기반
  기본 제목을 만든다.
- `status`는 생성 시 `DRAFT`다.
- `nextAgenda`는 Report 텍스트 항목이며, 별도 객체가 아니다.

### UpdateMeetingReportRequest

```json
{
  "title": "수정된 회의록 제목",
  "summary": "수정된 요약",
  "mainTopics": ["수정된 주제"],
  "decisions": ["수정된 결정사항"],
  "followUps": ["수정된 후속 작업"],
  "nextAgenda": []
}
```

- `title`: optional. 제목을 수정하지 않으면 보내지 않는다.
- `FINALIZED` 이후 수정 가능 여부는 product policy로 정한다. MVP에서는 수정 가능으로 둔다.
- 편집 권한이 없는 사용자가 이 요청을 보내면 서버는 `403 Forbidden`을 반환해야 한다.

### CreateReportTaskMappingRequest

```json
{
  "taskId": "uuid",
  "githubIssueId": "123",
  "isGenerated": true
}
```

- `taskId`: nullable. 아직 Task가 생성되지 않았으면 `null`
- `githubIssueId`: nullable. 연결된 GitHub Issue가 없으면 `null`
- `isGenerated`: Agent가 제안한 항목이면 `true`, 사용자가 직접 연결한 항목이면 `false`

## Response / Read Models

### MeetingSession

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "voiceRoomId": "uuid",
  "startedByVoiceSessionId": "uuid",
  "status": "IN_PROGRESS",
  "startedAt": "2026-06-27T08:30:00.000Z",
  "endedAt": null,
  "livekitRoomId": "pilo-workspace-voice-room"
}
```

### MeetingEvent

```json
{
  "id": 1,
  "sessionId": "uuid",
  "eventType": "STT",
  "userId": "uuid",
  "payload": {
    "speakerUserId": "uuid",
    "body": "회의록은 agent workflow로 생성한다.",
    "startedAt": "2026-06-27T08:30:00.000Z",
    "endedAt": "2026-06-27T08:30:05.000Z"
  },
  "createdAt": "2026-06-27T08:30:05.000Z"
}
```

### MeetingReportSummary

Dashboard가 소비하는 최소 read model이다. 상세 Report가 아니라 요약 카드용이다.

```json
{
  "id": "uuid",
  "sessionId": "uuid",
  "workspaceId": "uuid",
  "summary": "로그인, Task, Canvas, Review의 contract 우선순위를 확정했다.",
  "mainTopicCount": 2,
  "decisionCount": 1,
  "followUpCount": 3,
  "linkedTaskCount": 2,
  "linkedGithubIssueCount": 1,
  "status": "DRAFT",
  "createdAt": "2026-06-27T08:30:00.000Z"
}
```

### MeetingReportBoardPage

회의록(리포트) 전용 페이지의 페이지네이션 목록 응답이다.

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 82,
    "totalPages": 9,
    "hasPreviousPage": false,
    "hasNextPage": true
  }
}
```

Field rules:

| Field                        | Rule                                             |
| ---------------------------- | ------------------------------------------------ |
| `items`                      | 현재 페이지에 표시할 `MeetingReportBoardItem[]`  |
| `pagination.page`            | 1부터 시작하는 현재 페이지 번호                  |
| `pagination.pageSize`        | 현재 페이지 크기                                 |
| `pagination.totalItems`      | 현재 filter/search 조건에서 읽을 수 있는 전체 수 |
| `pagination.totalPages`      | `totalItems`와 `pageSize` 기준 전체 페이지 수    |
| `pagination.hasPreviousPage` | 이전 페이지 존재 여부                            |
| `pagination.hasNextPage`     | 다음 페이지 존재 여부                            |

### MeetingReportBoardItem

`GET /api/workspaces/:workspaceId/meeting-reports`가 회의록 게시판에 반환하는 목록 row
read model이다.

```json
{
  "id": "uuid",
  "reportNo": "#082",
  "sessionId": "uuid",
  "workspaceId": "uuid",
  "title": "Sprint Planning: Q4 Infra",
  "meetingDate": "2026-06-27T08:30:00.000Z",
  "keySummary": "v2.4 배포 범위와 인프라 점검 순서를 확정했습니다.",
  "participants": [
    {
      "memberId": "uuid",
      "displayName": "Alex Linderman",
      "initials": "AL"
    }
  ],
  "participantCount": 4,
  "status": "DRAFT",
  "permissions": {
    "canRead": true,
    "canEdit": true
  },
  "createdAt": "2026-06-27T08:30:00.000Z",
  "updatedAt": "2026-06-27T08:45:00.000Z"
}
```

Field rules:

| Field                 | Rule                                                            |
| --------------------- | --------------------------------------------------------------- |
| `reportNo`            | 화면 표시용 번호. 없으면 서버가 `createdAt` 기준으로 생성 가능  |
| `title`               | 게시판 title column과 상세 모달 제목에 사용                     |
| `meetingDate`         | 회의가 녹화/트래킹된 기준 일시. 보통 `MeetingSession.startedAt` |
| `keySummary`          | 게시판 key summary column에 표시할 짧은 요약                    |
| `participants`        | row에서 미리 보여줄 참여자 preview                              |
| `participantCount`    | 전체 참여자 수. preview 개수보다 클 수 있다.                    |
| `permissions.canRead` | 현재 사용자가 상세를 열 수 있는지 여부                          |
| `permissions.canEdit` | 현재 사용자가 상세 모달 페이지에서 바로 수정할 수 있는지 여부   |

### MeetingReportDetail

`GET /api/meeting-reports/:reportId` 응답이다.

```json
{
  "id": "uuid",
  "sessionId": "uuid",
  "workspaceId": "uuid",
  "title": "Sprint Planning: Q4 Infra",
  "summary": "로그인, Task, Canvas, Review의 contract 우선순위를 확정했다.",
  "mainTopics": ["Task 전환", "GitHub Issue 연결"],
  "decisions": ["후속 작업은 Task 후보로 먼저 만든다."],
  "followUps": ["OAuth 실패 상태 UI를 추가한다."],
  "nextAgenda": ["TaskCreateDraft 실제 연동 확인"],
  "status": "DRAFT",
  "permissions": {
    "canRead": true,
    "canEdit": true
  },
  "createdAt": "2026-06-27T08:30:00.000Z",
  "updatedAt": "2026-06-27T08:30:00.000Z",
  "taskMappings": []
}
```

Field rules:

| Field                 | Rule                                                                  |
| --------------------- | --------------------------------------------------------------------- |
| `title`               | 상세 모달 페이지의 문서 제목이며, 편집 권한이 있으면 수정 가능        |
| `permissions.canRead` | `false`인 사용자에게는 응답하지 않고 HTTP 403 Forbidden을 반환한다.   |
| `permissions.canEdit` | `true`이면 상세 모달 페이지에서 직접 편집 가능, `false`이면 읽기 전용 |

### ReportTaskMapping

```json
{
  "id": "uuid",
  "reportId": "uuid",
  "taskId": "uuid",
  "githubIssueId": "123",
  "isGenerated": true
}
```

### MeetingReportCanvasEntityRef

Canvas가 소비하는 최소 entity ref이다.

```json
{
  "entityType": "meeting_report",
  "entityId": "uuid",
  "displayTitle": "회의 Report",
  "shapeType": "meeting_report"
}
```

## Status Values

| Table / Model      | Field        | Values                                                          | Notes                 |
| ------------------ | ------------ | --------------------------------------------------------------- | --------------------- |
| `meeting_sessions` | `status`     | `IN_PROGRESS`, `COMPLETED`                                      | 녹음/트래킹 구간 상태 |
| `meeting_events`   | `event_type` | `STT`, `CHAT`, `CANVAS`, `NOTE`, `TASK`, `GITHUB`, `VOICE_ROOM` | 통합 이벤트 종류      |
| `meeting_reports`  | `status`     | `DRAFT`, `FINALIZED`                                            | Report 저장/확정 상태 |

## Events

- `meeting_session.started`
- `meeting_session.completed`
- `meeting_event.recorded`
- `meeting_report_generation.requested`
- `meeting_report.generated`
- `meeting_report.updated`
- `meeting_report.finalized`
- `report_task_mapping.created`
- `report_task_mapping.updated`

## Agent Actions Produced / Consumed

- Meeting / Report consumes `meeting.report.generate`.
- Meeting / Report may produce or request `task.create.draft`.
- Meeting / Report does not execute Task writes directly.
- Agent가 별도 회의 계획 항목을 추천하거나 생성하는 action은 없다.

## Workflow Output

### `meeting.report.generate` v1

`AgentResultMessage.output`은 DB row가 아니라 Report 저장을 위한 artifact 초안이다.
DB id, `reportId`, `createdAt`, `updatedAt`은 App Server가 저장 시점에 부여한다.

```json
{
  "title": "Task 분배와 GitHub 연동 범위 결정",
  "summary": "Task 분배와 GitHub 연동 범위를 결정했다.",
  "mainTopics": ["Task 전환", "GitHub Issue 연결"],
  "decisions": ["Task draft 변환은 Task API adapter 뒤에 둔다."],
  "followUps": [
    {
      "title": "TaskCreateDraft adapter mock 작성",
      "description": "Report follow-up을 TaskCreateDraft payload로 매핑한다.",
      "assigneeSuggestionUserId": null,
      "dueDateSuggestion": null,
      "priority": "medium"
    }
  ],
  "nextAgenda": ["TaskCreateDraft adapter 실제 연동 확인"],
  "linkedGithubIssues": [
    {
      "githubIssueId": "123",
      "title": "OAuth 실패 상태 UI 추가"
    }
  ]
}
```

### Output Artifacts

| Artifact             | Required | Purpose                                                 |
| -------------------- | -------: | ------------------------------------------------------- |
| `title`              |      Yes | `meeting_reports.title` 초안                            |
| `summary`            |      Yes | `meeting_reports.summary` 초안                          |
| `mainTopics`         |      Yes | `meeting_reports.main_topics` 초안                      |
| `decisions`          |      Yes | `meeting_reports.decisions` 초안                        |
| `followUps`          |      Yes | `meeting_reports.follow_ups` 초안                       |
| `nextAgenda`         |       No | `meeting_reports.next_agenda` 초안. 별도 객체가 아니다. |
| `linkedGithubIssues` |       No | `report_tasks_mapping.github_issue_id` 후보             |

### Persistence Mapping

| `AgentResultMessage.output` path | Storage target                | Rule                                              |
| -------------------------------- | ----------------------------- | ------------------------------------------------- |
| `title`                          | `meeting_reports.title`       | 비어 있으면 서버가 기본 제목을 생성한다.          |
| `summary`                        | `meeting_reports.summary`     | 먼저 report를 생성하거나 기존 draft를 재사용한다. |
| `mainTopics[]`                   | `meeting_reports.main_topics` | JSON array로 저장한다.                            |
| `decisions[]`                    | `meeting_reports.decisions`   | JSON array로 저장한다.                            |
| `followUps[]`                    | `meeting_reports.follow_ups`  | JSON array로 저장한다. Task 후보 원본이다.        |
| `nextAgenda[]`                   | `meeting_reports.next_agenda` | JSON array로 저장한다. 별도 row를 만들지 않는다.  |
| `linkedGithubIssues[]`           | `report_tasks_mapping`        | Issue 연결 후보로 저장한다.                       |

### AgentResultMessage Rules

- `status = failed`이면 `output`을 저장하지 않는다.
- `trace`는 workflow 실행 설명만 담고 meeting table에 저장하지 않는다.
- `actions`에 `task.create.draft`가 포함될 수 있지만, 실제 Task 생성은 Task API 성공
  후에만 `report_tasks_mapping.task_id`로 연결한다.
- enum이나 required field가 contract와 맞지 않으면 App Server는 Report 저장을
  중단하고 workflow 실패로 기록한다.

## Task / Issue Mapping

Report의 후속 작업은 Task 원본이 아니라 Task 후보이다. Task draft 저장과
approve/reject 전이는 주형 Task API 또는 Agent action executor가 담당한다.

| TaskCreateDraft field | Source                                      |
| --------------------- | ------------------------------------------- |
| `workspaceId`         | report가 속한 session의 workspace           |
| `sourceType`          | 고정값 `meeting_report_follow_up`           |
| `sourceId`            | follow-up item id 또는 stable generated key |
| `title`               | follow-up title                             |
| `description`         | follow-up description                       |
| `assigneeMemberId`    | follow-up assignee suggestion               |
| `priority`            | 명시 입력이 없으면 `medium`                 |
| `dueDate`             | follow-up due date suggestion               |

GitHub Issue 연결은 Task 생성 이후 또는 Report 저장 시점에 `report_tasks_mapping`으로
기록한다.

## Boundaries

- Meeting / Report는 독립적인 `meetings` table을 소유하지 않는다.
- Meeting / Report는 별도 회의 계획 항목을 소유하지 않고, Agent도 관련 추천 action을
  만들지 않는다.
- Meeting / Report는 Voice provider 세부 구현을 소유하지 않는다.
- Meeting / Report는 `tasks`, `pull_requests`, `canvas_shapes`, `agent_runs` table을
  직접 쓰지 않는다.
- Task draft 생성과 승인/거절은 주형 API 또는 세인 Agent action을 통해 수행한다.
- Dashboard는 `MeetingReportSummary`만 표시한다.
- Canvas는 `MeetingReportCanvasEntityRef`와 `MeetingReportSummary`만 사용한다.
- Review가 회의 내용을 참조해야 하면 Report summary 또는 별도 read model을 contract로
  추가한다.

## Mock Rule

Task API가 없으면 `report_tasks_mapping.task_id`는 `null`로 둔다.
GitHub Issue 연동이 없으면 `report_tasks_mapping.github_issue_id`는 `null`로 둔다.
Voice/STT provider가 없으면 `meeting_events`에 mock `STT` event를 저장하되 field
shape는 실제 event와 같아야 한다.
