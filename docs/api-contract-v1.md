# PILO API Contract v1

이 문서는 PILO MVP의 public API 목표 계약을 정의한다.
현재 `dev`에 이미 구현된 runtime path와 다를 수 있다.
지금 당장 호출 가능한 API는 `docs/contracts/*`의 `Current Runtime APIs`를 우선한다.
새 API 추가와 rebaseline은 이 문서의 `/api` prefix 목표 계약에 맞춘다.

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

| Status | Meaning |
| --- | --- |
| 400 | Invalid request |
| 401 | Not authenticated |
| 403 | Not allowed or not Workspace member |
| 404 | Resource not found |
| 409 | State conflict or external integration needs recovery |
| 422 | Request is valid JSON but cannot be applied |
| 500 | Server error |

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

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/auth/providers` | no | Supported OAuth providers |
| GET | `/api/auth/:provider/start` | no | Start OAuth login |
| GET | `/api/auth/:provider/callback` | no | OAuth callback |
| GET | `/api/auth/me` | yes | Current user |
| POST | `/api/auth/logout` | yes | Revoke current session |

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

| Method | Path | Auth | Role | Description |
| --- | --- | --- | --- | --- |
| GET | `/api/workspaces` | yes | user | List my Workspaces |
| POST | `/api/workspaces` | yes | user | Create Workspace |
| GET | `/api/workspaces/:workspaceId/summary` | yes | member | Workspace Summary |
| GET | `/api/workspaces/:workspaceId/members` | yes | member | Member list |
| POST | `/api/workspaces/:workspaceId/invites` | yes | owner | Create invite link |
| POST | `/api/workspace-invites/:inviteToken/accept` | yes | user | Accept invite |
| GET | `/api/workspaces/:workspaceId/dashboard` | yes | member | Read-only dashboard summary |

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
- Workspace edit/archive/delete endpoints are excluded.

## Project Start / Planning Runtime

Project start is implemented through the Agent Runtime API with
`workflowType: "planning.generate"`. Do not add or call separate
Project Start routes in the current MVP runtime.

### Runtime Endpoints

| Method | Path | Auth | Role | Description |
| --- | --- | --- | --- | --- |
| POST | `/api/workspaces/:workspaceId/agent-runs` | yes | member | Run `planning.generate` |
| GET | `/api/agent-runs/:agentRunId` | yes | member | Read planning run detail |
| GET | `/api/workspaces/:workspaceId/agent-actions` | yes | member | List approval-gated Agent actions |
| POST | `/api/agent-actions/:actionId/approve` | yes | member | Approve planning action |
| POST | `/api/agent-actions/:actionId/reject` | yes | member | Reject planning action |
| GET | `/api/workspaces/:workspaceId/task-drafts` | yes | member | List generated Task drafts |
| POST | `/api/workspaces/:workspaceId/task-drafts` | yes | member | Create Task draft |
| POST | `/api/task-drafts/:draftId/approve` | yes | member | Approve draft into Task |
| POST | `/api/task-drafts/:draftId/reject` | yes | member | Reject draft |

### Project Start Run Request

Use the Agent Run request shape from the Agent Runtime section:

```json
{
  "workflowType": "planning.generate",
  "workflowVersion": "v1",
  "input": {
    "goal": "Launch PILO MVP",
    "targetUser": "Small MVP team",
    "problem": "Planning context is split across tools.",
    "duration": "4 weeks",
    "outputGoal": "A reviewable MVP plan with owner-action drafts"
  },
  "contextRefs": []
}
```

### Project Start Run Response

The response is `AgentRunDetail.output.planDraft.detail`. It contains the
ProjectBrief-equivalent summary, tech stack recommendation, feature drafts,
role drafts, milestone drafts, risk notes, first agenda draft, and approval
state. Task candidates are represented as Task Drafts or Agent actions, not as
a separate Task Candidate API.

Rules:

- `planning.generate` is deterministic in the local MVP runtime.
- Agent approval creates or confirms owner-action drafts; it does not bypass
  Task owner validation.
- Rejected Agent actions or Task drafts must not create Tasks.
- Separate Project Start and Task Candidate routes are not current MVP runtime
  routes.

## Task API

### Endpoints

| Method | Path | Auth | Role | Description |
| --- | --- | --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/tasks` | yes | member | List Tasks |
| POST | `/api/workspaces/:workspaceId/tasks` | yes | member | Create Task |
| GET | `/api/tasks/:taskId` | yes | member | Task detail |
| PATCH | `/api/tasks/:taskId` | yes | member | Update Task fields |
| PATCH | `/api/tasks/:taskId/status` | yes | member | Change Task status |
| DELETE | `/api/tasks/:taskId` | yes | member | Soft-delete Task |
| GET | `/api/workspaces/:workspaceId/task-drafts` | yes | member | List Task drafts |
| POST | `/api/workspaces/:workspaceId/task-drafts` | yes | member | Create Task draft |
| POST | `/api/task-drafts/:draftId/approve` | yes | member | Approve draft into Task |
| POST | `/api/task-drafts/:draftId/reject` | yes | member | Reject draft |

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
type TaskStatus = "todo" | "in_progress" | "review" | "done" | "blocked";
type TaskPriority = "low" | "medium" | "high";
type TaskType = "development" | "planning" | "meeting" | "review" | "document" | "bug" | "etc";
type TaskSourceType = "manual" | "agent" | "meeting" | "github";
```

Rules:

- `blocked` is a status, not a separate boolean.
- `blockedReason` may be added later, but is not required for MVP.
- Development Task may be linked to GitHub Issue, but it is not required.

## GitHub Integration API

### Endpoints

| Method | Path | Auth | Role | Description |
| --- | --- | --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/github/connections` | yes | member | Connection status |
| POST | `/api/workspaces/:workspaceId/github/connections` | yes | owner | Start/connect GitHub integration |
| DELETE | `/api/workspaces/:workspaceId/github/connections/:connectionId` | yes | owner | Disconnect integration |
| GET | `/api/workspaces/:workspaceId/github/repositories` | yes | member | List connected repos |
| GET | `/api/repositories/:repositoryId/issues` | yes | member | List Issues |
| POST | `/api/tasks/:taskId/github-issues` | yes | member | Create Issue from Task |
| POST | `/api/github/issues/:issueId/link-task` | yes | member | Link existing Issue to Task |
| GET | `/api/repositories/:repositoryId/pull-requests` | yes | member | List PRs |
| POST | `/api/tasks/:taskId/pull-requests/:pullRequestId` | yes | member | Link PR to Task from Task context |
| POST | `/api/github/pull-requests/:pullRequestId/link-task` | yes | member | Link PR to Task |
| POST | `/api/github/pull-requests/:pullRequestId/link-issue` | yes | member | Link PR to Issue |

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
  "baseBranch": "dev",
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
type GitHubPullRequestState = "open" | "draft" | "review_requested" | "changes_requested" | "approved" | "merged" | "closed";
type GitHubSyncStatus = "synced" | "syncing" | "partial_failure" | "failed" | "auth_required" | "broken_reference";
```

Rules:

- Sync is manual in MVP.
- Sync updates GitHub metadata only.
- Sync does not update Task status automatically.
- Tokens are never returned by API.

## Meeting / Report API

### Endpoints

| Method | Path | Auth | Role | Description |
| --- | --- | --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/meetings` | yes | member | List meetings |
| POST | `/api/workspaces/:workspaceId/meetings` | yes | member | Start meeting |
| GET | `/api/meetings/:meetingId` | yes | member | Meeting detail |
| POST | `/api/meetings/:meetingId/notes` | yes | member | Add text note |
| POST | `/api/meetings/:meetingId/voice-sessions/start` | yes | member | Start Voice/STT session |
| POST | `/api/voice-sessions/:voiceSessionId/audio-chunks` | yes | member | Submit audio chunk for STT |
| POST | `/api/voice-sessions/:voiceSessionId/end` | yes | member | End Voice/STT session |
| GET | `/api/meetings/:meetingId/transcript-segments` | yes | member | List transcript segments |
| PATCH | `/api/transcript-segments/:segmentId` | yes | member | Correct transcript text |
| POST | `/api/meetings/:meetingId/end` | yes | member | End meeting |
| POST | `/api/meetings/:meetingId/report-draft` | yes | member | Generate ReportDraft |
| PATCH | `/api/reports/:reportId` | yes | member | Edit ReportDraft |
| POST | `/api/reports/:reportId/confirm` | yes | member | Confirm Report |
| POST | `/api/action-items/:actionItemId/convert-to-task` | yes | member | Create Task from ActionItem |

### Meeting DTO

```json
{
  "id": "meeting-id",
  "workspaceId": "workspace-id",
  "title": "Sprint planning",
  "status": "active",
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
  "status": "recording",
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
type MeetingStatus = "active" | "ended" | "report_created";
type VoiceSessionStatus = "recording" | "processing" | "completed" | "failed" | "cancelled";
type TranscriptSource = "stt" | "manual";
type TranscriptStatus = "draft" | "confirmed" | "corrected";
type ReportStatus = "draft" | "confirmed";
type ActionItemStatus = "draft" | "approved" | "converted_to_task" | "rejected";
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

| Method | Path | Auth | Role | Description |
| --- | --- | --- | --- | --- |
| POST | `/api/pull-requests/:pullRequestId/review-room` | yes | member | Create or open Review Room; optional body may include `PullRequestSummary` |
| GET | `/api/code-review-rooms/:reviewRoomId` | yes | member | Review Room detail |
| POST | `/api/pull-requests/:pullRequestId/analysis` | yes | member | Request PR analysis |
| GET | `/api/pull-requests/:pullRequestId/analysis` | yes | member | PR analysis lifecycle result |
| GET | `/api/pull-requests/:pullRequestId/analysis-summary` | yes | member | PR analysis summary for Dashboard/Canvas |
| GET | `/api/pull-request-analyses/:analysisId/canvas` | yes | member | Review graph canvas |
| GET | `/api/pull-request-analyses/:analysisId/changed-files` | yes | member | Review-owned changed files and changed functions |
| PATCH | `/api/review-nodes/:reviewNodeId/state` | yes | member | Save internal review node state |
| POST | `/api/code-review-rooms/:reviewRoomId/comments` | yes | member | Save review comment |
| POST | `/api/pull-request-analyses/:analysisId/checklist-items` | yes | member | Upsert merge/review checklist item |

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
type ReviewAnalysisStatus = "not_started" | "running" | "completed" | "failed" | "limit_exceeded";
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

## Agent Runtime API

### Endpoints

| Method | Path | Auth | Role | Description |
| --- | --- | --- | --- | --- |
| POST | `/api/workspaces/:workspaceId/agent-runs` | yes | member | Create local MVP Agent run |
| GET | `/api/agent-runs/:agentRunId` | yes | member | Agent run detail |
| GET | `/api/workspaces/:workspaceId/agent-actions` | yes | member | Workspace Agent actions |
| POST | `/api/agent-actions/:actionId/approve` | yes | member | Approve Agent action |
| POST | `/api/agent-actions/:actionId/reject` | yes | member | Reject Agent action |

### Agent Run Request

```json
{
  "workflowType": "planning.generate",
  "workflowVersion": "v1",
  "input": {
    "goal": "Launch PILO MVP",
    "targetUser": "Small MVP team",
    "problem": "Planning context is split across tools.",
    "duration": "4 weeks",
    "outputGoal": "A reviewable MVP plan with owner-action drafts"
  },
  "contextRefs": []
}
```

### Agent Run Detail

```json
{
  "id": "agent-run-id",
  "workflowId": "workflow-id",
  "workflowType": "planning.generate",
  "workflowVersion": "v1",
  "workspaceId": "workspace-id",
  "actorMemberId": "workspace-member-id",
  "status": "requires_confirmation",
  "actionRequired": true,
  "pendingActionCount": 2,
  "input": {},
  "output": {
    "summary": "Drafted MVP plan.",
    "planDraft": {}
  },
  "steps": [],
  "actions": [
    {
      "id": "agent-action-id",
      "runId": "agent-run-id",
      "type": "planning.approve",
      "source": "planning",
      "requiresConfirmation": true,
      "payload": {},
      "status": "waiting_confirmation",
      "confirmedByMemberId": null,
      "confirmedAt": null,
      "executedAt": null
    }
  ],
  "trace": []
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
- AgentAction execution delegates to owner domain API.
- Approval does not bypass permission checks.
- Local MVP runtime currently executes `planning.generate` deterministically.
- `approve` only accepts `waiting_confirmation` actions. `reject` only accepts `draft` or `waiting_confirmation` actions.
- `confirmed`, `executed`, `rejected`, and `failed` actions cannot be changed by user approval/rejection endpoints.

## Notification API

Notification storage and read-state APIs are Common/System runtime APIs in the
MVP. The current implementation uses an in-memory repository, so it is suitable
for local MVP flow validation but not durable production delivery yet.

Notification is read-model support only. It may navigate the user to an owner
domain screen, but it must not execute Task, Review, Agent, GitHub, Meeting, or
Canvas business actions by itself.

### Endpoints

| Method | Path | Auth | Role | Description |
| --- | --- | --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/notifications` | yes | member | My notifications in Workspace |
| PATCH | `/api/notifications/:notificationId/read` | yes | owner of notification | Mark as read |
| PATCH | `/api/workspaces/:workspaceId/notifications/read-all` | yes | member | Mark all my notifications read |

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
type NotificationType = "task_assigned" | "review_requested" | "agent_approval_required" | "report_created" | "github_sync_failed";
```

Rules:

- Notification executes no business action.
- Notification links to owner screen.
- Notification read state belongs to the current authenticated user only.
- Workspace membership is required before listing or mutating read state.
- MVP runtime stores notification read state in memory until the DB-backed
  Common/System repository is promoted.

## Basic Canvas API

Canvas is `Should`, not MVP release blocker.

### Endpoints

| Method | Path | Auth | Role | Description |
| --- | --- | --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/canvas-boards` | yes | member | List boards |
| POST | `/api/workspaces/:workspaceId/canvas-boards` | yes | member | Create board |
| GET | `/api/canvas-boards/:boardId` | yes | member | Board detail |
| POST | `/api/canvas-boards/:boardId/nodes` | yes | member | Create memo/reference node |
| PATCH | `/api/canvas-nodes/:nodeId` | yes | member | Update node position/content |
| DELETE | `/api/canvas-nodes/:nodeId` | yes | member | Delete Canvas node only |
| POST | `/api/canvas-boards/:boardId/edges` | yes | member | Create edge |
| DELETE | `/api/canvas-edges/:edgeId` | yes | member | Delete edge |

### Canvas Node DTO

```json
{
  "id": "canvas-node-id",
  "boardId": "board-id",
  "type": "task_ref",
  "position": {
    "x": 120,
    "y": 80
  },
  "size": {
    "width": 240,
    "height": 120
  },
  "content": {
    "text": "Memo text"
  },
  "reference": {
    "objectType": "task",
    "objectId": "task-id"
  }
}
```

Enums:

```ts
type CanvasNodeType = "memo" | "task_ref" | "report_ref" | "github_issue_ref" | "github_pr_ref";
type CanvasEdgeType = "related_to" | "depends_on" | "blocks" | "implements" | "references";
```

Rules:

- Deleting a Canvas node does not delete the original object.
- File/code reference nodes are excluded.
- Agent auto layout is excluded.

## Dashboard API

### Endpoint

| Method | Path | Auth | Role | Description |
| --- | --- | --- | --- | --- |
| GET | `/api/workspaces/:workspaceId/dashboard` | yes | member | Read-only Workspace dashboard |

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
    "review": 2,
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
