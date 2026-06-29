# Voice Contract

## Owner

진호

## Scope

회의에 붙는 음성방, 음성 세션, 녹음 상태를 담당한다. Voice는 회의 음성
인프라와 session lifecycle을 소유하고, transcript text가 확정되면 Meeting의
`transcript_segments` API로 넘긴다.

Voice는 Meeting report를 직접 생성하지 않는다. Report 생성은 Meeting contract의
`/api/meetings/:meetingId/report-generation` 또는 `meeting.report.generate`
workflow를 사용한다.

## Owned Tables

- `voice_rooms`
- `voice_sessions`

## Consumer Impact

| Consumer | Uses | Impact |
|---|---|---|
| 진호 Meeting | `VoiceRoom`, `VoiceSession`, recording status | 회의 중 음성방을 열고 transcript/report workflow의 입력을 만든다. |
| 세인 Agent Runtime | recording/transcript completion signal | STT 처리 후 회의록 workflow를 실행할 수 있다. |
| 동현 Dashboard/Canvas | 직접 의존 없음 | Dashboard/Canvas는 Voice 상태가 아니라 Meeting report summary만 표시한다. |
| 주형 Task | 직접 의존 없음 | Voice가 Task를 만들지 않는다. Action Item -> Task는 Meeting/Agent 경유다. |
| 은재 Review | 직접 의존 없음 | Review가 Voice room/session을 읽지 않는다. |

Breaking change가 발생하는 필드:

- `VoiceRoom.status`
- `VoiceSession.recordingStatus`
- Voice room lookup path
- Voice session join/leave semantics

위 필드를 바꿀 때는 진호, 세인, 동현을 reviewer로 지정한다.

## Base Path

현재 app-server controller는 `@Controller("api")`를 사용한다. 실제 runtime path는
아래 표의 모든 path 앞에 `/api`가 붙는다.

## Provided APIs

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/voice` | Voice module scaffold 상태 확인 |
| `POST` | `/api/workspaces/:workspaceId/meetings/:meetingId/voice-room` | 회의용 음성방 생성 |
| `GET` | `/api/workspaces/:workspaceId/meetings/:meetingId/voice-room` | 회의에 연결된 음성방 조회 |
| `GET` | `/api/voice-rooms/:voiceRoomId` | 음성방 상세 조회 |
| `PATCH` | `/api/voice-rooms/:voiceRoomId/status` | 음성방 상태 변경 |
| `POST` | `/api/voice-rooms/:voiceRoomId/sessions` | 음성 세션 참여 |
| `GET` | `/api/voice-rooms/:voiceRoomId/sessions` | 음성 세션 목록 |
| `PATCH` | `/api/voice-sessions/:voiceSessionId/leave` | 음성 세션 종료 |
| `PATCH` | `/api/voice-sessions/:voiceSessionId/recording-status` | 녹음/STT 처리 상태 변경 |

## Request DTOs

### UpdateVoiceRoomStatusRequest

```json
{
  "status": "inactive"
}
```

- `status`: `active`, `inactive`, `archived`
- `archived`는 terminal에 가깝게 사용한다. 재활성화가 필요하면 별도 contract로 명시한다.

### JoinVoiceSessionRequest

```json
{}
```

- client가 `memberId`를 보내지 않는다. 서버가 인증된 `currentMember` context에서
  workspace member id를 채운다.
- client가 meeting id를 보내지 않는다. `voiceRoomId`로 연결된 room에서 가져온다.
- guest/mock join이 필요하면 이 DTO에 `memberId`를 추가하지 말고 별도 guest/mock
  경로로 분리한다.

### UpdateVoiceSessionRecordingStatusRequest

```json
{
  "recordingStatus": "recording"
}
```

- `recordingStatus`: `not_recording`, `recording`, `processing`, `completed`, `failed`

## Response / Read Models

### VoiceRoom

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "meetingId": "uuid",
  "livekitRoomName": "pilo-workspace-meeting-room",
  "status": "active",
  "createdAt": "2026-06-27T08:30:00.000Z",
  "updatedAt": "2026-06-27T08:30:00.000Z"
}
```

Field rules:

| Field | Rule |
|---|---|
| `workspaceId` | Voice room이 속한 workspace id |
| `meetingId` | 회의에 묶이지 않은 ad-hoc room이면 `null`, MVP 회의방은 UUID |
| `livekitRoomName` | provider room name. provider 미연동 mock이면 `null` 가능 |
| `status` | `active`, `inactive`, `archived` |

### VoiceSession

```json
{
  "id": "uuid",
  "voiceRoomId": "uuid",
  "meetingId": "uuid",
  "memberId": "uuid",
  "recordingStatus": "not_recording",
  "startedAt": "2026-06-27T08:30:00.000Z",
  "endedAt": null,
  "createdAt": "2026-06-27T08:30:00.000Z",
  "updatedAt": "2026-06-27T08:30:00.000Z"
}
```

Field rules:

| Field | Rule |
|---|---|
| `voiceRoomId` | 세션이 속한 voice room id |
| `meetingId` | voice room의 meeting id를 복사한다. ad-hoc room이면 `null` |
| `memberId` | 세션 소유 workspace member id. guest/mock이면 `null` 가능 |
| `recordingStatus` | `not_recording`, `recording`, `processing`, `completed`, `failed` |
| `startedAt` | 세션 참여 시각. mock이면 `null` 가능 |
| `endedAt` | 세션이 살아 있으면 `null`, leave 후 ISO date-time |

## Status Values

| Model | Field | Values |
|---|---|---|
| `VoiceRoom` | `status` | `active`, `inactive`, `archived` |
| `VoiceSession` | `recordingStatus` | `not_recording`, `recording`, `processing`, `completed`, `failed` |

## Lifecycle

```text
VoiceRoom: active -> inactive -> archived
VoiceSession.recordingStatus:
not_recording -> recording -> processing -> completed
not_recording -> recording -> failed
processing -> failed
```

- `leave`는 `VoiceSession.endedAt`을 채우고 session lifecycle을 종료한다.
- recording status가 `completed`가 되어도 Meeting report가 자동 생성되는 것은 아니다.
- transcript text 저장은 Meeting의 `/api/meetings/:meetingId/transcript-segments`를 사용한다.

## Events

- `voice_room.created`
- `voice_room.status_changed`
- `voice_session.joined`
- `voice_session.left`
- `voice_session.recording_status_changed`
- `voice_transcript.completed`

## Boundaries

- Voice는 `meetings`, `meeting_reports`, `meeting_action_items`, `tasks`, `agent_runs` table을 직접 쓰지 않는다.
- Voice provider room name, participant token, media URL 등 provider-specific field는 public read model에 노출하지 않는다.
- transcript 확정 text는 Meeting transcript segment API로 전달한다.
- report generation은 Meeting 또는 Agent Runtime이 실행한다.

## Mock Rule

LiveKit/Realtime provider가 없으면 `livekitRoomName = null`인 mock room을 사용한다.
mock 세션도 public DTO field shape는 실제 `VoiceRoom`, `VoiceSession`과 같아야 한다.
