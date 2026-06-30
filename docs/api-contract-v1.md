# PILO API Contract v1

이 문서는 PILO MVP의 public API 목표 계약을 정의하는 **Target 문서**다.
현재 `temp-dev`에 이미 구현된 runtime path와 다를 수 있다.
지금 당장 호출 가능한 API는 `docs/mvp-contract-v0.md`와
`docs/contracts/*`의 `Current Runtime APIs`를 우선한다.
새 API 추가와 rebaseline은 이 문서의 `/api` prefix 목표 계약에 맞춘다.

## Status Classification

이 문서의 endpoint와 enum은 아래처럼 분류한다.

| Label      | 의미                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Current`  | 현재 app-server controller와 global `/api` prefix로 호출 가능한 API다. 상세 source는 `docs/contracts/*`의 `Current Runtime APIs`다. |
| `Deferred` | MVP 목표에는 남지만 현재 controller가 없어서 runtime에서 호출하면 안 된다. fixture/mock 또는 후속 contract/runtime PR 전용이다.     |
| `Target`   | 구현자가 따라야 할 장기 v1 방향이다. Current와 다르면 Current contract를 먼저 따른다.                                               |
| `Excluded` | MVP에서 만들지 않는다. 화면 CTA와 public API를 추가하지 않는다.                                                                     |

이 문서가 상세 contract와 다르게 읽히는 경우, 구현자는 `docs/contracts/*`의
Current/Deferred 분류와 `docs/mvp-contract-v0.md`를 먼저 따른다.

함께 읽을 문서:

- `docs/mvp-scope-v1.md` - MVP 기능 범위.
- `docs/domain-boundary-v1.md` - 도메인 소유권과 접근 규칙.
- `docs/contracts/*` - 기존 상세 contract와 fixture.
- `docs/mvp-contract-v0.md` - 현재 구현 상태표.

## API Principles

1. 새 MVP API는 `/api` prefix를 사용한다.
2. 모든 Workspace-scoped API는 Auth session과 Workspace membership을 검사한다.
3. 응답은 owner domain의 public DTO만 반환한다.
4. 다른 도메인의 entity를 그대로 중첩하지 않고 summary DTO를 사용한다.
5. Agent-generated change는 candidate/draft/action으로 먼저 생성한다.
6. 데이터 변경은 사용자 승인 후 owner API가 실행한다.
7. RAG/embedding API는 MVP 계약에 없다.
8. 삭제는 기본적으로 soft delete 또는 archive를 우선한다. 단, MVP 제외 기능은 endpoint를 만들지 않는다.

## Common Types

### IDs

All IDs are strings.

```ts
type UserId = string;
type WorkspaceId = string;
type TaskId = string;
type GitHubIssueId = string;
type GitHubPullRequestId = string;
type MeetingId = string;
type VoiceSessionId = string;
type TranscriptSegmentId = string;
type ReportId = string;
type ReviewRoomId = string;
type AgentRunId = string;
```

### Error Response

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {},
    "recoveryAction": "string|null"
  }
}
```

Common status codes:

| Status | Meaning                                               |
| ------ | ----------------------------------------------------- |
| 400    | Invalid request                                       |
| 401    | Not authenticated                                     |
| 403    | Not allowed or not Workspace member                   |
| 404    | Resource not found                                    |
| 409    | State conflict or external integration needs recovery |
| 422    | Request is valid JSON but cannot be applied           |
| 500    | Server error                                          |

### Pagination

```json
{
  "items": [],
  "pageInfo": {
    "nextCursor": "string|null",
    "hasNextPage": false
  }
}
```

### Workspace Summary

```json
{
  "id": "workspace-id",
  "name": "PILO",
  "description": "AI project operating workspace",
  "type": "side_project",
  "status": "active",
  "myRole": "owner",
  "memberCount": 5,
  "createdAt": "2026-06-30T00:00:00.000Z",
  "updatedAt": "2026-06-30T00:00:00.000Z"
}
```

## Auth API

### Endpoints

| Method | Path                           | Auth | Description               |
| ------ | ------------------------------ | ---- | ------------------------- |
| GET    | `/api/auth/providers`          | no   | Supported OAuth providers |
| GET    | `/api/auth/:provider/start`    | no   | Start OAuth login         |
| GET    | `/api/auth/:provider/callback` | no   | OAuth callback            |
| GET    | `/api/auth/me`                 | yes  | Current user              |
| POST   | `/api/auth/logout`             | yes  | Revoke current session    |

### Current User Response

```json
{
  "id": "user-id",
  "email": "user@example.com",
  "name": "User Name",
  "avatarUrl": "https://example.com/avatar.png",
  "providers": ["google"],
  "lastLoginAt": "2026-06-30T00:00:00.000Z"
}
```

Rules:

- `provider + providerUserId` prevents duplicate OAuth account creation.
- Cross-provider account merge is excluded.
- Auth API never returns OAuth access tokens.

## Workspace API

### Endpoints

| Method | Path                                                 | Auth | Role   | Description                                                                         |
| ------ | ---------------------------------------------------- | ---- | ------ | ----------------------------------------------------------------------------------- |
| GET    | `/api/workspaces`                                    | yes  | user   | List my Workspaces                                                                  |
| POST   | `/api/workspaces`                                    | yes  | user   | Create Workspace                                                                    |
| GET    | `/api/workspaces/:workspaceId`                       | yes  | member | Workspace Summary                                                                   |
| GET    | `/api/workspaces/:workspaceId/members`               | yes  | member | Member list                                                                         |
| POST   | `/api/workspaces/:workspaceId/invites`               | yes  | owner  | Create invite link                                                                  |
| POST   | `/api/workspace-invites/:inviteId/accept`            | yes  | user   | Accept invite                                                                       |
| GET    | `/api/workspaces/:workspaceId/dashboard`             | yes  | member | Read-only dashboard summary                                                         |
| PATCH  | `/api/workspaces/:workspaceId`                       | yes  | member | Current runtime metadata update; Excluded from MVP success criteria and primary CTA |
| GET    | `/api/workspaces/:workspaceId/dashboard-preferences` | yes  | member | Current runtime preferences read; Excluded from MVP success criteria                |
| PUT    | `/api/workspaces/:workspaceId/dashboard-preferences` | yes  | member | Current runtime preferences write; Excluded from MVP success criteria               |

### Create Workspace Request

```json
{
  "name": "PILO",
  "description": "optional",
  "type": "side_project"
}
```

### Workspace Member DTO

```json
{
  "id": "member-id",
  "userId": "user-id",
  "name": "User Name",
  "email": "user@example.com",
  "avatarUrl": "https://example.com/avatar.png",
  "role": "owner",
  "joinedAt": "2026-06-30T00:00:00.000Z"
}
```

### Invite Link Response

```json
{
  "inviteId": "invite-id",
  "inviteToken": "token",
  "inviteUrl": "https://pilo.example.com/invites/token",
  "expiresAt": "2026-07-07T00:00:00.000Z"
}
```

Rules:

- MVP invite does not send email.
- Invite link creates Member role only.
- Workspace archive/delete endpoints are Excluded.
- Workspace metadata edit and dashboard preferences are Current Runtime APIs
  because the controller exists, but they remain Excluded from MVP success
  criteria and primary user CTA until `docs/mvp-scope-v1.md` is changed.
- Dashboard is a read-only aggregate. Preferences may store member UI state, but
  Dashboard must not become the owner of Task, GitHub, Meeting, Review, Agent,
  Canvas, or Notification source data.

## Project Start / Planning API

### Endpoints

| Method | Path                                                     | Auth | Role   | Description                         |
| ------ | -------------------------------------------------------- | ---- | ------ | ----------------------------------- |
| POST   | `/api/workspaces/:workspaceId/project-plan-drafts`       | yes  | member | Create ProjectPlanDraft             |
| GET    | `/api/project-plan-drafts/:draftId`                      | yes  | member | ProjectPlanDraft detail             |
| POST   | `/api/project-plan-drafts/:draftId/recommend-tech-stack` | yes  | member | Recommend tech stack                |
| POST   | `/api/project-plan-drafts/:draftId/breakdown-features`   | yes  | member | Create ProjectPlanFeatureDraft list |
| POST   | `/api/project-plan-drafts/:draftId/assign-roles`         | yes  | member | Create role drafts                  |
| POST   | `/api/project-plan-drafts/:draftId/approve`              | yes  | member | Approve plan and call owner APIs    |

### Project Start Run Request

```json
{
  "step": "project_info",
  "message": "We are building an AI project management tool",
  "answers": {
    "duration": "5 weeks",
    "teamSize": 5,
    "experienceLevel": "beginner"
  }
}
```

### Project Start Run Response

```json
{
  "agentRunId": "agent-run-id",
  "status": "completed",
  "projectBrief": {
    "oneLine": "string",
    "problem": "string",
    "targetUsers": ["string"],
    "goals": ["string"],
    "constraints": ["string"]
  },
  "techStackOptions": [
    {
      "name": "Stable MVP",
      "stack": {
        "frontend": "Next.js",
        "backend": "NestJS",
        "database": "PostgreSQL"
      },
      "reason": "string",
      "risks": ["string"]
    }
  ],
  "featureCandidates": [
    {
      "title": "string",
      "scope": "must",
      "reason": "string"
    }
  ],
  "taskDrafts": [
    {
      "id": "draft-id",
      "sourceType": "planning_feature",
      "sourceId": "feature-draft-id",
      "title": "string",
      "description": "string",
      "assigneeMemberId": "member-id|null",
      "priority": "medium",
      "dueDate": "2026-07-03"
    }
  ]
}
```

Rules:

- Legacy candidate naming is retired. Use `TaskCreateDraft` request payloads and persisted `TaskDraft` records.
- Planning feature drafts map to `TaskCreateDraft.sourceType = "planning_feature"` and `sourceId = ProjectPlanFeatureDraft.id`.
- Rejected drafts must not create Task.

## Task API

### Endpoints

| Method | Path                                       | Auth | Role   | Description        |
| ------ | ------------------------------------------ | ---- | ------ | ------------------ |
| GET    | `/api/workspaces/:workspaceId/tasks`       | yes  | member | List Tasks         |
| POST   | `/api/workspaces/:workspaceId/tasks`       | yes  | member | Create Task        |
| GET    | `/api/tasks/:taskId`                       | yes  | member | Task detail        |
| PATCH  | `/api/tasks/:taskId`                       | yes  | member | Update Task fields |
| PATCH  | `/api/tasks/:taskId/status`                | yes  | member | Change Task status |
| DELETE | `/api/tasks/:taskId`                       | yes  | member | Soft-delete Task   |
| POST   | `/api/workspaces/:workspaceId/task-drafts` | yes  | member | Create TaskDraft   |
| POST   | `/api/task-drafts/:draftId/approve`        | yes  | member | Approve TaskDraft  |
| POST   | `/api/task-drafts/:draftId/reject`         | yes  | member | Reject TaskDraft   |

### Task DTO

```json
{
  "id": "task-id",
  "workspaceId": "workspace-id",
  "title": "Login API implementation",
  "description": "Implement OAuth callback handling",
  "status": "todo",
  "priority": "medium",
  "taskType": "development",
  "assignee": {
    "userId": "user-id",
    "name": "User Name"
  },
  "dueDate": "2026-07-03",
  "acceptanceCriteria": ["OAuth callback validates state"],
  "source": {
    "type": "agent",
    "id": "agent-run-id"
  },
  "githubIssue": {
    "id": "github-issue-id",
    "number": 12,
    "state": "open",
    "url": "https://github.com/org/repo/issues/12"
  },
  "pullRequests": [
    {
      "id": "github-pr-id",
      "number": 5,
      "state": "open",
      "url": "https://github.com/org/repo/pull/5"
    }
  ],
  "createdAt": "2026-06-30T00:00:00.000Z",
  "updatedAt": "2026-06-30T00:00:00.000Z"
}
```

Enums:

```ts
type TaskStatus = "todo" | "in_progress" | "in_review" | "done" | "blocked";
type TaskPriority = "low" | "medium" | "high" | "urgent";
type TaskType =
  | "development"
  | "planning"
  | "meeting"
  | "review"
  | "document"
  | "bug"
  | "etc";
type TaskSourceType = "manual" | "agent" | "meeting" | "github";
```

Rules:

- `blocked` is a status, not a separate boolean.
- `blockedReason` may be added later, but is not required for MVP.
- Development Task may be linked to GitHub Issue, but it is not required.
- Current runtime, SQL baseline, public schema, and `docs/contracts/task.md`
  use `in_review` and `urgent`. The old MVP-scope wording `review` and
  `low/medium/high` only is deprecated.
- `taskType` and `acceptanceCriteria` are MVP Target fields shown in this DTO,
  but they are not part of the Current `CreateTaskRequest`, `UpdateTaskRequest`,
  public schema, or Prisma-backed runtime subset. Do not send or require them
  until a follow-up Task contract/schema/runtime PR adds them.

## GitHub Integration API

### Endpoints

| Method | Path                                                            | Auth       | Role                          | Description                             |
| ------ | --------------------------------------------------------------- | ---------- | ----------------------------- | --------------------------------------- |
| GET    | `/api/workspaces/:workspaceId/github/connections`               | yes        | member                        | Connection status                       |
| POST   | `/api/workspaces/:workspaceId/github/connections`               | yes        | member current / owner target | Start GitHub App installation flow      |
| DELETE | `/api/workspaces/:workspaceId/github/connections/:connectionId` | yes        | member current / owner target | Disconnect or revoke integration        |
| GET    | `/api/github/app/callback`                                      | no session | GitHub App redirect           | Complete installation callback          |
| GET    | `/api/workspaces/:workspaceId/github/repositories`              | yes        | owner target                  | Deferred repository list                |
| POST   | `/api/workspaces/:workspaceId/github/repositories/sync`         | yes        | owner target                  | Deferred provider sync                  |
| GET    | `/api/repositories/:repositoryId/issues`                        | yes        | member target                 | Deferred Issue list                     |
| POST   | `/api/tasks/:taskId/github-issues`                              | yes        | member target                 | Deferred create/link Issue from Task    |
| GET    | `/api/repositories/:repositoryId/pull-requests`                 | yes        | member target                 | Deferred PR list                        |
| GET    | `/api/pull-requests/:pullRequestId/changed-files`               | yes        | member target                 | Deferred changed-file source for Review |
| POST   | `/api/tasks/:taskId/pull-requests/:pullRequestId`               | yes        | member target                 | Deferred Task-PR link                   |

Status rules:

- Current Runtime APIs are only the GitHub App connection flow:
  `POST/GET/DELETE /api/workspaces/:workspaceId/github/connections` and
  `GET /api/github/app/callback`.
- Current connection runtime checks Workspace membership. MVP Target policy is
  Owner-only for connect/change/revoke; that stricter role enforcement requires
  a follow-up runtime authorization PR before freeze.
- Repository list/sync, Issue, PR, changed-file, webhook, and Task-GitHub link
  APIs are Deferred and must not be called by current runtime consumers.

### Create Issue From Task Request

```json
{
  "title": "Login API implementation",
  "body": "Generated from PILO Task...",
  "labels": ["backend"],
  "assigneeGithubLogins": ["octocat"]
}
```

### GitHub Issue DTO

```json
{
  "id": "github-issue-id",
  "workspaceId": "workspace-id",
  "repositoryId": "repo-id",
  "number": 12,
  "title": "Login API implementation",
  "state": "open",
  "url": "https://github.com/org/repo/issues/12",
  "labels": ["backend"],
  "assignees": ["octocat"],
  "linkedTaskId": "task-id|null",
  "syncStatus": "synced",
  "lastSyncedAt": "2026-06-30T00:00:00.000Z"
}
```

### GitHub Pull Request DTO

```json
{
  "id": "github-pr-id",
  "workspaceId": "workspace-id",
  "repositoryId": "repo-id",
  "number": 5,
  "title": "Implement login API",
  "state": "open",
  "isDraft": false,
  "url": "https://github.com/org/repo/pull/5",
  "author": "octocat",
  "baseBranch": "temp-dev",
  "headBranch": "feat/login-api",
  "changedFilesCount": 8,
  "additions": 120,
  "deletions": 30,
  "linkedTaskIds": ["task-id"],
  "linkedIssueIds": ["github-issue-id"],
  "reviewRoomId": "review-room-id|null",
  "syncStatus": "synced",
  "lastSyncedAt": "2026-06-30T00:00:00.000Z"
}
```

Enums:

```ts
type GitHubIssueState = "open" | "closed";
type GitHubPullRequestState =
  | "open"
  | "draft"
  | "review_requested"
  | "changes_requested"
  | "approved"
  | "merged"
  | "closed";
type GitHubSyncStatus =
  | "synced"
  | "syncing"
  | "partial_failure"
  | "failed"
  | "auth_required"
  | "broken_reference";
```

Rules:

- Sync is manual in MVP.
- Sync updates GitHub metadata only.
- Sync does not update Task status automatically.
- Tokens are never returned by API.

## Meeting / Report API

### Endpoints

| Method | Path                                                              | Auth | Role   | Description                                   |
| ------ | ----------------------------------------------------------------- | ---- | ------ | --------------------------------------------- |
| GET    | `/api/meetings`                                                   | yes  | member | Current scaffold/list for accessible meetings |
| GET    | `/api/workspaces/:workspaceId/meetings`                           | yes  | member | List meetings                                 |
| POST   | `/api/workspaces/:workspaceId/meetings`                           | yes  | member | Start meeting                                 |
| GET    | `/api/meetings/:meetingId`                                        | yes  | member | Meeting detail                                |
| PATCH  | `/api/meetings/:meetingId/status`                                 | yes  | member | Change meeting status                         |
| POST   | `/api/meetings/:meetingId/participants`                           | yes  | member | Add participant                               |
| GET    | `/api/meetings/:meetingId/participants`                           | yes  | member | List participants                             |
| PATCH  | `/api/meetings/:meetingId/participants/:participantId/leave`      | yes  | member | Leave participant                             |
| POST   | `/api/meetings/:meetingId/agendas`                                | yes  | member | Add agenda                                    |
| GET    | `/api/meetings/:meetingId/agendas`                                | yes  | member | List agendas                                  |
| PATCH  | `/api/meetings/:meetingId/agendas/:agendaId/status`               | yes  | member | Change agenda status                          |
| PATCH  | `/api/meetings/:meetingId/agendas/:agendaId/sort-order`           | yes  | member | Reorder agenda                                |
| POST   | `/api/meetings/:meetingId/memos`                                  | yes  | member | Add text memo                                 |
| GET    | `/api/meetings/:meetingId/memos`                                  | yes  | member | List memos                                    |
| POST   | `/api/meetings/:meetingId/transcript-segments`                    | yes  | member | Store transcript segment                      |
| GET    | `/api/meetings/:meetingId/transcript-segments`                    | yes  | member | List transcript segments                      |
| POST   | `/api/meetings/:meetingId/report-generation`                      | yes  | member | Request report workflow                       |
| POST   | `/api/meetings/:meetingId/report`                                 | yes  | member | Create/mock report                            |
| GET    | `/api/meeting-reports/:reportId`                                  | yes  | member | Report detail                                 |
| GET    | `/api/workspaces/:workspaceId/meeting-reports/recent`             | yes  | member | Recent report summaries                       |
| GET    | `/api/workspaces/:workspaceId/meeting-reports/canvas-entity-refs` | yes  | member | Canvas entity refs                            |
| POST   | `/api/meeting-reports/:reportId/action-items`                     | yes  | member | Create Action Item                            |
| GET    | `/api/meeting-reports/:reportId/action-items`                     | yes  | member | List Action Items                             |
| PATCH  | `/api/meeting-action-items/:actionItemId/approve`                 | yes  | member | Approve Action Item                           |
| PATCH  | `/api/meeting-action-items/:actionItemId/reject`                  | yes  | member | Reject Action Item                            |
| PATCH  | `/api/meeting-action-items/:actionItemId/convert`                 | yes  | member | Mark converted after Task success             |
| POST   | `/api/meeting-action-items/:actionItemId/task-draft`              | yes  | member | Request TaskDraft                             |
| POST   | `/api/workspaces/:workspaceId/meetings/:meetingId/voice-room`     | yes  | member | Create Voice room                             |
| GET    | `/api/workspaces/:workspaceId/meetings/:meetingId/voice-room`     | yes  | member | Read Voice room                               |
| GET    | `/api/voice-rooms/:voiceRoomId`                                   | yes  | member | Voice room detail                             |
| PATCH  | `/api/voice-rooms/:voiceRoomId/status`                            | yes  | member | Change Voice room status                      |
| POST   | `/api/voice-rooms/:voiceRoomId/sessions`                          | yes  | member | Join Voice session                            |
| GET    | `/api/voice-rooms/:voiceRoomId/sessions`                          | yes  | member | List Voice sessions                           |
| PATCH  | `/api/voice-sessions/:voiceSessionId/leave`                       | yes  | member | Leave Voice session                           |
| PATCH  | `/api/voice-sessions/:voiceSessionId/recording-status`            | yes  | member | Change recording/STT status                   |

Status rules:

- Current Meeting text input is `memos`, not the legacy `notes` name.
- Current report workflow request is `/api/meetings/:meetingId/report-generation`.
- Direct audio chunk upload, transcript correction, standalone report confirm,
  and one-step ActionItem-to-Task routes are Target/Deferred and need a follow-up
  contract/runtime PR before consumers call them.

### Meeting DTO

```json
{
  "id": "meeting-id",
  "workspaceId": "workspace-id",
  "title": "Sprint planning",
  "status": "in_progress",
  "voiceStatus": "idle",
  "startedAt": "2026-06-30T00:00:00.000Z",
  "endedAt": null,
  "participants": [
    {
      "userId": "user-id",
      "name": "User Name"
    }
  ]
}
```

### Voice Session DTO

```json
{
  "id": "voice-session-id",
  "meetingId": "meeting-id",
  "workspaceId": "workspace-id",
  "recordingStatus": "recording",
  "sttProvider": "openai",
  "startedByMemberId": "member-id",
  "startedAt": "2026-06-30T00:00:00.000Z",
  "endedAt": null,
  "error": null
}
```

### Submit Audio Chunk Request

```json
{
  "sequence": 12,
  "mimeType": "audio/webm",
  "audioBase64": "base64-encoded-audio",
  "capturedStartedAt": "2026-06-30T00:00:10.000Z",
  "capturedEndedAt": "2026-06-30T00:00:15.000Z"
}
```

### Transcript Segment DTO

```json
{
  "id": "transcript-segment-id",
  "meetingId": "meeting-id",
  "voiceSessionId": "voice-session-id",
  "speakerMemberId": "member-id|null",
  "speakerLabel": "Speaker 1",
  "source": "stt",
  "status": "confirmed",
  "text": "We decided to keep OAuth-only login.",
  "startedAt": "2026-06-30T00:00:10.000Z",
  "endedAt": "2026-06-30T00:00:15.000Z",
  "confidence": 0.87,
  "correctedByMemberId": null,
  "correctedAt": null
}
```

### Report DTO

```json
{
  "id": "report-id",
  "meetingId": "meeting-id",
  "workspaceId": "workspace-id",
  "status": "draft",
  "summary": "string",
  "discussion": ["string"],
  "decisions": [
    {
      "content": "Use OAuth-only login",
      "status": "decided"
    }
  ],
  "actionItems": [
    {
      "id": "action-item-id",
      "title": "Implement login callback",
      "description": "string",
      "recommendedAssigneeId": "user-id|null",
      "dueDate": "2026-07-03",
      "status": "draft",
      "createdTaskId": null
    }
  ],
  "createdAt": "2026-06-30T00:00:00.000Z",
  "updatedAt": "2026-06-30T00:00:00.000Z"
}
```

Enums:

```ts
type MeetingStatus = "scheduled" | "in_progress" | "ended" | "report_generated";
type VoiceRoomStatus = "active" | "inactive" | "archived";
type VoiceSessionRecordingStatus =
  | "not_recording"
  | "recording"
  | "processing"
  | "completed"
  | "failed";
type TranscriptSource = "text" | "stt";
type ReportStatus = "draft" | "confirmed";
type ActionItemStatus = "draft" | "approved" | "converted" | "rejected";
```

Rules:

- Voice/STT is included only for meeting transcript generation.
- Report generation uses transcript segments, explicit meeting notes, and related object IDs.
- Speaker attribution may be null when reliable speaker mapping is unavailable.
- Raw audio is used for STT processing and is not a long-term MVP document object.
- Voice command, call-word control, and automatic Task/Issue creation from speech are excluded.
- Action Item conversion creates Task through Task API.

## Code Review Room API

### Endpoints

| Method | Path                                                     | Auth | Role   | Description                     |
| ------ | -------------------------------------------------------- | ---- | ------ | ------------------------------- |
| POST   | `/api/pull-requests/:pullRequestId/review-room`          | yes  | member | Create or open Review Room      |
| GET    | `/api/code-review-rooms/:roomId`                         | yes  | member | Review Room detail              |
| POST   | `/api/pull-requests/:pullRequestId/analysis`             | yes  | member | Generate PR analysis            |
| GET    | `/api/pull-requests/:pullRequestId/analysis`             | yes  | member | PR analysis result              |
| GET    | `/api/pull-requests/:pullRequestId/analysis-summary`     | yes  | member | PR analysis summary             |
| GET    | `/api/pull-request-analyses/:analysisId/graph`           | yes  | member | Review graph                    |
| GET    | `/api/pull-request-analyses/:analysisId/canvas`          | yes  | member | Review internal canvas          |
| PATCH  | `/api/review-nodes/:nodeId/state`                        | yes  | member | Save internal review node state |
| POST   | `/api/code-review-rooms/:roomId/comments`                | yes  | member | Create review comment           |
| POST   | `/api/pull-request-analyses/:analysisId/checklist-items` | yes  | member | Create checklist item           |

### Review Room DTO

```json
{
  "id": "review-room-id",
  "workspaceId": "workspace-id",
  "pullRequestId": "github-pr-id",
  "analysisStatus": "completed",
  "summary": {
    "purpose": "string",
    "changeScope": "string",
    "recommendedReviewOrder": ["src/auth.ts"]
  },
  "nodes": [
    {
      "id": "review-node-id",
      "type": "file",
      "label": "src/auth.ts",
      "role": "OAuth callback handler",
      "changeReason": "Adds state validation",
      "reviewQuestions": ["Does this reject invalid state?"],
      "decision": "needs_discussion"
    }
  ],
  "edges": [
    {
      "fromNodeId": "review-node-id",
      "toNodeId": "review-node-id-2",
      "relation": "calls"
    }
  ],
  "checklist": [
    {
      "text": "Verify invalid OAuth state returns 401",
      "status": "open"
    }
  ]
}
```

Enums:

```ts
type ReviewAnalysisStatus =
  | "not_started"
  | "running"
  | "completed"
  | "failed"
  | "limit_exceeded";
type ReviewDecision = "no_issue" | "needs_discussion" | "unknown";
```

Diff limit policy:

```json
{
  "maxFiles": 50,
  "maxTotalChangedLines": 3000,
  "maxSingleFileChangedLines": 800
}
```

Rules:

- If the diff limit is exceeded, API returns `analysisStatus = "limit_exceeded"` and a partial summary.
- GitHub comments, approvals, change requests, and merge are excluded.

## Agent Runtime / Command Chat API

This section is the MVP Target surface. In current runtime, the Agent registry
and an internal deterministic service skeleton exist. The smaller Agent
Run/Action approval and execute surface is now exposed through an app-server
HTTP controller as Mock/In-memory Current Runtime.

Current Agent Run/Action runtime covers create run, read run, approve action,
reject action, and explicit execute for confirmed actions. Agent chat and
recommendation list routes stay Deferred follow-up targets unless a separate
contract PR changes that sequence.

### Endpoints

| Method | Path                                               | Auth | Role   | Description              |
| ------ | -------------------------------------------------- | ---- | ------ | ------------------------ |
| POST   | `/api/workspaces/:workspaceId/agent-runs`          | yes  | member | Create Agent run         |
  | GET    | `/api/agent-runs/:agentRunId`                      | yes  | member | Agent run detail         |
  | POST   | `/api/agent-actions/:actionId/approve`             | yes  | member | Approve Agent action     |
  | POST   | `/api/agent-actions/:actionId/reject`              | yes  | member | Reject Agent action      |
  | POST   | `/api/agent-actions/:actionId/execute`             | yes  | member | Execute confirmed action |
  | GET    | `/api/workspaces/:workspaceId/agent-chat/messages` | yes  | member | List Agent chat messages |
  | POST   | `/api/workspaces/:workspaceId/agent-chat/messages` | yes  | member | Send Agent command       |

### Agent Run Request

```json
{
  "workflowType": "task.draft.generate",
  "workflowVersion": "v1",
  "input": {
    "message": "Break login feature into tasks"
  },
  "contextRefs": [
    {
      "type": "task",
      "id": "task-id"
    }
  ]
}
```

### Agent Run Response

```json
{
  "id": "agent-run-id",
  "workspaceId": "workspace-id",
  "workflowType": "task.draft.generate",
  "workflowVersion": "v1",
  "status": "requires_confirmation",
  "actionRequired": true,
  "pendingActionCount": 1,
  "output": {
    "summary": "I found 3 task drafts."
  },
  "actions": [
    {
      "id": "agent-action-id",
      "type": "task.create.draft",
      "status": "waiting_confirmation",
      "payload": {
        "workspaceId": "workspace-id",
        "title": "Implement OAuth callback",
        "priority": "medium"
      }
    }
  ]
}
```

Enums:

```ts
type AgentWorkflowType =
  | "meeting.report.generate"
  | "review.analysis.generate"
  | "planning.generate"
  | "task.draft.generate"
  | "github.issue.draft.generate"
  | "orchestrator.run";
type AgentRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "requires_confirmation";
type AgentActionType =
  | "task.create.draft"
  | "task.update.status"
  | "github.issue.create"
  | "meeting.report.generate"
  | "review.analysis.generate"
  | "planning.approve";
type AgentActionStatus =
  | "draft"
  | "waiting_confirmation"
  | "confirmed"
  | "executed"
  | "rejected"
  | "failed";
```

Rules:

- Agent context is explicit. No RAG retrieval in MVP.
  - AgentAction execution delegates to owner domain API or, in current runtime,
    a clearly marked Mock/In-memory owner executor.
  - Approval does not bypass permission checks.
- `workflowType`, action `type`, and action `status` must match
  `docs/contracts/agent-actions.md` and
  `docs/contracts/schemas/pilo-public-contracts.schema.json`.
- Legacy names such as task suggestion workflows, generic create-task actions,
  or requires-approval statuses are not part of the current public contract.
  - Agent Run/Action HTTP APIs are Current Mock/In-memory runtime for create,
    read, approve, reject, and execute. Execute currently supports
    `task.create.draft` through a mock TaskDraft owner executor only.
  - Temporary mock member boundary. Not production auth.
  - `approve` stops at `confirmed`; `execute` is the explicit owner execution
    boundary.
  - Agent chat and recommendation routes remain Deferred.
- The registry service alone does not make a route Current Runtime; only the
  app-server controller plus global `/api` prefix does.

## Notification API

Notification is an MVP Target capability, but all Notification HTTP APIs are
Deferred in current runtime. The owner is DevOps/Common gatekeeper until a
specific implementation owner is assigned. Do not treat Minimal Notification as
a release-blocking Current API before that owner/runtime PR lands.

### Endpoints

| Method | Path                                                  | Auth | Role                  | Description                    |
| ------ | ----------------------------------------------------- | ---- | --------------------- | ------------------------------ |
| GET    | `/api/workspaces/:workspaceId/notifications`          | yes  | member                | My notifications in Workspace  |
| PATCH  | `/api/notifications/:notificationId/read`             | yes  | owner of notification | Mark as read                   |
| PATCH  | `/api/workspaces/:workspaceId/notifications/read-all` | yes  | member                | Mark all my notifications read |

### Notification DTO

```json
{
  "id": "notification-id",
  "workspaceId": "workspace-id",
  "recipientUserId": "user-id",
  "type": "agent_approval_required",
  "title": "Task creation needs approval",
  "body": "Agent suggested 3 Tasks.",
  "readAt": null,
  "relatedObject": {
    "type": "agent_action",
    "id": "agent-action-id"
  },
  "createdAt": "2026-06-30T00:00:00.000Z"
}
```

Enums:

```ts
type NotificationType =
  | "task_assigned"
  | "review_requested"
  | "agent_approval_required"
  | "report_created"
  | "github_sync_failed";
```

Rules:

- Notification executes no business action.
- Notification links to owner screen.
- Current runtime has no Notification controller. Consumers must use local UI
  badges, fixtures, or AgentAction state directly until the Deferred API lands.

## Basic Canvas API

Canvas is `Should`, not MVP release blocker. Unlike most Should items, a
workspace Canvas runtime currently exists; consumers must still treat it as
layout/reference storage only, not source-domain data ownership.

### Endpoints

| Method | Path                                          | Auth | Role   | Description                     |
| ------ | --------------------------------------------- | ---- | ------ | ------------------------------- |
| GET    | `/api/workspaces/:workspaceId/canvas-boards`  | yes  | member | List boards                     |
| POST   | `/api/workspaces/:workspaceId/canvas-boards`  | yes  | member | Create board                    |
| GET    | `/api/canvas-boards/:boardId`                 | yes  | member | Board detail                    |
| POST   | `/api/canvas-boards/:boardId/shapes`          | yes  | member | Create reference shape          |
| PATCH  | `/api/canvas-shapes/:shapeId`                 | yes  | member | Update shape display attributes |
| PUT    | `/api/canvas-shapes/:shapeId/position`        | yes  | member | Save shape position             |
| DELETE | `/api/canvas-shapes/:shapeId`                 | yes  | member | Delete Canvas shape only        |
| POST   | `/api/canvas-boards/:boardId/connections`     | yes  | member | Create connection               |
| DELETE | `/api/canvas-connections/:connectionId`       | yes  | member | Delete connection               |
| PUT    | `/api/canvas-boards/:boardId/view-settings`   | yes  | member | Save board viewport             |
| PUT    | `/api/canvas-boards/:boardId/filter-settings` | yes  | member | Save board filters              |

### Canvas Shape DTO

```json
{
  "id": "canvas-shape-id",
  "boardId": "board-id",
  "shapeType": "task",
  "entityType": "task",
  "entityId": "task-id",
  "displayTitle": "Login API implementation",
  "width": 240,
  "height": 120,
  "position": { "x": 120, "y": 80 }
}
```

Enums:

```ts
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
type CanvasConnectionType =
  | "related_to"
  | "created_from"
  | "blocks"
  | "references"
  | "implements"
  | "reviews";
```

Rules:

- Deleting a Canvas shape does not delete the original object.
- The current runtime and public schema use `shapes`/`connections`; `nodes`/`edges` are old target wording and must not be used for workspace Canvas APIs.
- `connectionType` is a strict public enum for current runtime/schema/SQL:
  `related_to`, `created_from`, `blocks`, `references`, `implements`, `reviews`.
- Freeform drawing/sticky/code/frame tldraw state is local-only MVP UI state
  unless a follow-up contract/runtime PR defines server persistence.
- Agent auto layout is excluded.

## Dashboard API

### Endpoint

| Method | Path                                     | Auth | Role   | Description                   |
| ------ | ---------------------------------------- | ---- | ------ | ----------------------------- |
| GET    | `/api/workspaces/:workspaceId/dashboard` | yes  | member | Read-only Workspace dashboard |

### Dashboard Response

```json
{
  "workspace": {
    "id": "workspace-id",
    "name": "PILO",
    "myRole": "owner"
  },
  "taskSummary": {
    "todo": 3,
    "inProgress": 4,
    "inReview": 2,
    "done": 10,
    "blocked": 1
  },
  "githubSummary": {
    "openIssues": 8,
    "openPullRequests": 2,
    "syncStatus": "synced"
  },
  "recentReports": [],
  "reviewRequests": [],
  "agentSuggestions": []
}
```

Rules:

- Dashboard is read-only.
- Dashboard must not mutate source domain data.

## Excluded API Surface

The following API categories must not be added in MVP:

- `/api/rag/*`
- `/api/embeddings/*`
- voice command or call-word API
- user-to-user realtime chat API
- service-side GitHub merge API
- GitHub review comment/approval API
- file drive upload/download API
- workspace role change API
- workspace delete/archive API
- multi-repository API

## Contract Validation Checklist

Before implementing an endpoint:

- [ ] It exists in this document or a contract PR updates this document first.
- [ ] Owner domain is clear.
- [ ] Workspace membership rule is clear.
- [ ] Request DTO is defined.
- [ ] Response DTO is defined.
- [ ] Error cases are defined.
- [ ] Side effects are listed.
- [ ] Agent approval requirement is listed if AI-generated data changes state.
- [ ] Tests cover success, permission failure, and conflict/error path.
