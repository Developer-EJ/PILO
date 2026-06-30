# Voice Contract

## Owner

진호

## Scope

Voice는 workspace에 붙는 음성방, 사용자의 음성 세션 참여/퇴장, 녹음 상태를
담당한다.

중요한 용어 기준:

- 음성방은 workspace에 붙는다. 음성방은 특정 `meeting` 객체에 붙지 않는다.
- 현재 MVP 화면은 workspace에 이미 존재하는 기본/현재 음성방에 참여하는 흐름을 다룬다.
- 음성방 생성, 삭제, 목록 관리는 이후 구현 범위다. 아래 contract에서 해당 개념을
  언급하더라도 현재 MVP 화면의 필수 구현으로 해석하지 않는다.
- 사용자가 말하는 "회의 시작"은 음성방에 참여해 `VoiceSession`을 시작하는 것이다.
- 사용자가 말하는 "회의 종료"는 음성 세션에서 나가는 것이다.
- 녹음 시작/종료 사이의 결과물 정리, 이벤트 트래킹, Report 생성은
  `docs/contracts/meeting.md`의 Meeting / Report contract가 담당한다.
- `MeetingSession`은 음성회의방이 아니다. 특정 `VoiceRoom` 안에서 녹화/트래킹을
  켠 하나의 기록 구간이다.

Voice는 Report를 직접 생성하지 않는다. Voice는 음성방과 음성 세션 lifecycle을
소유하고, 녹음/STT 확정 이벤트를 Meeting / Report contract가 소비할 수 있게
전달한다.

## Owned Tables

- `voice_rooms`
- `voice_sessions`

## Related Tables Owned By Meeting / Report

- `meeting_sessions`
- `meeting_participants`
- `meeting_events`
- `meeting_reports`
- `report_tasks_mapping`

Voice가 위 테이블을 직접 소유하거나 직접 쓰지 않는다. 녹음 시작/종료, transcript
확정, 세션 참여자 변경 같은 signal을 Meeting / Report 쪽으로 넘긴다.

## Consumer Impact

| Consumer              | Uses                                                    | Impact                                                                       |
| --------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 진호 Meeting / Report | `VoiceRoom`, `VoiceSession`, recording signal           | workspace 음성방에서 시작된 녹음/트래킹 세션과 Report 입력을 만든다.         |
| 세인 Agent Runtime    | transcript completion signal, report generation trigger | STT와 이벤트 수집 완료 후 Report 후보를 생성할 수 있다.                      |
| 동현 Dashboard/Canvas | 직접 의존 없음                                          | Dashboard/Canvas는 Voice 상태가 아니라 Report summary/entity ref를 표시한다. |
| 주형 Task             | 직접 의존 없음                                          | Voice가 Task를 만들지 않는다. Report의 후속 작업이 Task 후보가 된다.         |
| 은재 Review           | 직접 의존 없음                                          | Review가 Voice room/session을 직접 읽지 않는다.                              |

Breaking change가 발생하는 필드:

- `VoiceRoom.workspaceId`
- `VoiceRoom.status`
- `VoiceSession.voiceRoomId`
- `VoiceSession.memberId`
- `VoiceSession.recordingStatus`
- 음성방 생성/조회 path
- 음성 세션 join/leave semantics

위 필드를 바꿀 때는 진호, 세인, 동현을 reviewer로 지정한다.

## Base Path

app-server uses the global `api` prefix. Runtime paths in this document are
listed as `/api/...`.

## Target Runtime APIs

### Scaffold

| Method | Path         | Purpose                         |
| ------ | ------------ | ------------------------------- |
| `GET`  | `/api/voice` | Voice module scaffold 상태 확인 |

### Voice Room

현재 MVP 화면은 음성방 생성, 삭제, 목록 관리를 요구하지 않는다. 현재 화면은
workspace context나 mock/default 값으로 선택된 하나의 `VoiceRoom`을 기준으로 렌더링할
수 있다.

| Method  | Path                                   | Purpose          |
| ------- | -------------------------------------- | ---------------- |
| `GET`   | `/api/voice-rooms/:voiceRoomId`        | 음성방 상세 조회 |
| `PATCH` | `/api/voice-rooms/:voiceRoomId/status` | 음성방 상태 변경 |

Future scope:

| Method   | Path                                       | Purpose                    |
| -------- | ------------------------------------------ | -------------------------- |
| `POST`   | `/api/workspaces/:workspaceId/voice-rooms` | workspace에 음성방 생성    |
| `GET`    | `/api/workspaces/:workspaceId/voice-rooms` | workspace 음성방 목록      |
| `DELETE` | `/api/voice-rooms/:voiceRoomId`            | workspace 음성방 삭제/보관 |

### Voice Session

| Method  | Path                                                   | Purpose                                           |
| ------- | ------------------------------------------------------ | ------------------------------------------------- |
| `POST`  | `/api/voice-rooms/:voiceRoomId/sessions`               | 음성방 참여. UI의 회의 시작/참여에 해당한다.      |
| `GET`   | `/api/voice-rooms/:voiceRoomId/sessions`               | 음성방의 현재/과거 세션 목록                      |
| `PATCH` | `/api/voice-sessions/:voiceSessionId/leave`            | 음성 세션 종료. UI의 회의 종료/나가기에 해당한다. |
| `PATCH` | `/api/voice-sessions/:voiceSessionId/recording-status` | 녹음/STT 처리 상태 변경                           |

## Request DTOs

### CreateVoiceRoomRequest

이 DTO는 future scope다. 현재 MVP 화면은 음성방 생성 UI를 요구하지 않는다.

```json
{
  "title": "Sprint Planning Room"
}
```

- `title`: nullable string. 비어 있으면 서버가 기본 이름을 정한다.
- `workspaceId`는 path에서 받는다.
- 음성방 생성 시 별도 meeting 식별자를 받지 않는다. Voice room은 workspace에 붙는다.

### UpdateVoiceRoomStatusRequest

현재 MVP 화면은 음성방 상태 변경 UI를 요구하지 않는다. 상태 변경은 future scope의
음성방 관리 기능에서 사용한다.

```json
{
  "status": "inactive"
}
```

- `status`: `active`, `inactive`, `archived`
- `archived`는 terminal에 가깝게 사용한다. 재활성화가 필요하면 별도 contract로
  명시한다.

### JoinVoiceSessionRequest

```json
{}
```

- client가 `memberId`를 보내지 않는다. 서버가 인증된 `currentMember` context에서
  workspace member id를 채운다.
- client가 별도 meeting 식별자를 보내지 않는다. 별도 meeting 객체가 없기 때문이다.
- guest/mock join이 필요하면 이 DTO에 `memberId`를 추가하지 말고 별도 guest/mock
  경로로 분리한다.

### UpdateVoiceSessionRecordingStatusRequest

```json
{
  "recordingStatus": "recording"
}
```

- `recordingStatus`: `not_recording`, `recording`, `processing`, `completed`, `failed`
- `recording`으로 바뀌면 Meeting / Report 쪽에서 녹음/트래킹 세션을 열 수 있어야 한다.
- `completed` 또는 `failed`로 바뀌면 Meeting / Report 쪽에서 세션 종료, 이벤트 수집
  완료, Report 후보 생성 여부를 판단한다.

## Response / Read Models

### CurrentVoiceRoomView

현재 MVP의 음성회의 화면이 소비하는 최소 read model이다. 음성방 목록 화면이 아니라,
이미 선택된 기본/현재 음성방 하나를 표시하기 위한 모델이다.

```json
{
  "voiceRoom": {
    "id": "uuid",
    "workspaceId": "uuid",
    "title": "Core Sync #102",
    "status": "active"
  },
  "participants": [
    {
      "memberId": "uuid",
      "displayName": "Alex Linderman",
      "roleLabel": "Lead Designer",
      "voiceState": "speaking",
      "joinedAt": "2026-06-27T08:30:00.000Z"
    }
  ],
  "currentUserSession": {
    "voiceSessionId": "uuid",
    "joined": true,
    "recordingStatus": "not_recording"
  }
}
```

Field rules:

| Field                                | Rule                                                               |
| ------------------------------------ | ------------------------------------------------------------------ |
| `voiceRoom`                          | 현재 화면에서 표시할 하나의 기본/선택된 음성방                     |
| `participants`                       | 현재 음성방에 참여 중인 사용자 목록                                |
| `participants[].voiceState`          | `speaking`, `muted`, `listening` 중 하나. provider mock이면 추정값 |
| `currentUserSession.joined`          | 현재 사용자가 이 음성방에 참여 중인지 여부                         |
| `currentUserSession.voiceSessionId`  | 참여 중이면 `VoiceSession.id`, 미참여면 `null`                     |
| `currentUserSession.recordingStatus` | 현재 사용자 세션의 녹음/STT 처리 상태                              |

### VoiceRoom

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "title": "Sprint Planning Room",
  "livekitRoomName": "pilo-workspace-voice-room",
  "status": "active",
  "createdAt": "2026-06-27T08:30:00.000Z",
  "updatedAt": "2026-06-27T08:30:00.000Z"
}
```

Field rules:

| Field             | Rule                                                     |
| ----------------- | -------------------------------------------------------- |
| `workspaceId`     | Voice room이 속한 workspace id                           |
| `title`           | 사용자에게 보이는 음성방 이름. nullable 가능             |
| `livekitRoomName` | provider room name. provider 미연동 mock이면 `null` 가능 |
| `status`          | `active`, `inactive`, `archived`                         |

### VoiceSession

```json
{
  "id": "uuid",
  "voiceRoomId": "uuid",
  "memberId": "uuid",
  "recordingStatus": "not_recording",
  "joinedAt": "2026-06-27T08:30:00.000Z",
  "leftAt": null,
  "createdAt": "2026-06-27T08:30:00.000Z",
  "updatedAt": "2026-06-27T08:30:00.000Z"
}
```

Field rules:

| Field             | Rule                                                              |
| ----------------- | ----------------------------------------------------------------- |
| `voiceRoomId`     | 세션이 속한 voice room id                                         |
| `memberId`        | 세션 소유 workspace member id. guest/mock이면 `null` 가능         |
| `recordingStatus` | `not_recording`, `recording`, `processing`, `completed`, `failed` |
| `joinedAt`        | 음성방 참여 시각                                                  |
| `leftAt`          | 세션이 살아 있으면 `null`, leave 후 ISO date-time                 |

## Status Values

| Model          | Field             | Values                                                            |
| -------------- | ----------------- | ----------------------------------------------------------------- |
| `VoiceRoom`    | `status`          | `active`, `inactive`, `archived`                                  |
| `VoiceSession` | `recordingStatus` | `not_recording`, `recording`, `processing`, `completed`, `failed` |

## Lifecycle

```text
VoiceRoom: active -> inactive -> archived

VoiceSession:
join -> joinedAt set
leave -> leftAt set

VoiceSession.recordingStatus:
not_recording -> recording -> processing -> completed
not_recording -> recording -> failed
processing -> failed
```

- `join`은 UI의 회의 시작/참여에 해당한다.
- `leave`는 UI의 회의 종료/나가기에 해당한다.
- recording status가 `completed`가 되어도 Voice가 Report를 직접 생성하지 않는다.
- transcript 확정 text와 녹음 완료 signal은 Meeting / Report contract가 소비한다.

## Events

- `voice_room.created`
- `voice_room.status_changed`
- `voice_session.joined`
- `voice_session.left`
- `voice_session.recording_status_changed`
- `voice_recording.started`
- `voice_recording.completed`
- `voice_transcript.completed`

## Boundaries

- Voice는 `meetings` table을 만들거나 쓰지 않는다. 독립적인 meeting 객체는 없다.
- Voice는 `meeting_sessions`, `meeting_events`, `meeting_reports`,
  `report_tasks_mapping`, `tasks`, `agent_runs` table을 직접 쓰지 않는다.
- Voice provider room name, participant token, media URL 등 provider-specific field는
  public read model에 노출하지 않는다.
- Report 생성은 Meeting / Report 또는 Agent Runtime이 실행한다.
- Task 생성은 Report의 후속 작업을 Task API 또는 Agent action executor가 처리한다.

## Mock Rule

LiveKit/Realtime provider가 없으면 `livekitRoomName = null`인 mock room을 사용한다.
mock 세션도 public DTO field shape는 실제 `VoiceRoom`, `VoiceSession`과 같아야 한다.
