# Agent Actions Contract

## Owner

세인

## Scope

Agent action은 AI가 실제 데이터를 바꾸기 전에 생성하는 실행 제안이다. 모든 write action은 확인 가능한 payload와 상태를 가져야 한다.

## Owned Tables

- `agents`
- `agent_workflows`
- `agent_runs`
- `agent_run_steps`
- `agent_contexts`
- `agent_actions`
- `agent_traces`

## Common Action Shape

```json
{
  "id": "uuid",
  "runId": "uuid",
  "type": "task.create.draft",
  "source": "meeting",
  "requiresConfirmation": true,
  "payload": {
    "workspaceId": "uuid",
    "title": "OAuth callback 처리"
  },
  "status": "draft",
  "confirmedByMemberId": null,
  "confirmedAt": null,
  "executedAt": null
}
```

### Field Rules

| Field | Rule |
|---|---|
| `id` | 저장된 `agent_actions.id`다. local runner와 fixture는 스키마를 만족하는 deterministic mock UUID를 사용할 수 있다. |
| `runId` | `agent_runs.id`와 같아야 한다. |
| `type` | `docs/contracts/schemas/pilo-public-contracts.schema.json`의 `AgentActionCommon.type` enum 값만 사용한다. 신규 action은 가능하면 `domain.action.target` 형태를 사용한다. |
| `source` | action 후보를 만든 domain 또는 orchestrator를 적는다. |
| `requiresConfirmation` | 원본 데이터를 생성, 수정, 삭제하는 action은 `true`다. 확인 없이 실행 가능한 action은 `false`다. |
| `payload` | 아래 action type별 payload schema 중 하나와 일치해야 한다. |
| `status` | State Machine에 정의된 값만 사용한다. `requiresConfirmation = false`인 action은 `draft`와 `executed`만 사용하며 `waiting_confirmation`, `confirmed`, `rejected`, `failed`는 사용하지 않는다. |
| `confirmedByMemberId` | 승인 전에는 `null`, 승인 후에는 `workspace_members.id`다. `requiresConfirmation = false`인 action은 계속 `null`이다. |
| `confirmedAt` | 승인 전에는 `null`, 승인 시각은 ISO date-time이다. `requiresConfirmation = false`인 action은 계속 `null`이다. |
| `executedAt` | 실행 전에는 `null`, 실행 성공 시각은 ISO date-time이다. |

## Supported Action Types

| Type | Target owner | Payload schema | Execution |
|---|---|---|---|
| `task.create.draft` | 주형 | `TaskCreateDraft` | 주형 Task draft/create API |
| `task.update.status` | 주형 | `TaskStatusUpdateAction` | 주형 Task status API |
| `task.assign` | 주형 | `TaskAssignAction` | 주형 Task assignee update API |
| `github.issue.create` | 주형 | `GithubIssueCreateAction` | 주형 GitHub API |
| `meeting.report.generate` | 진호 | `MeetingReportGenerateAction` | 진호 Meeting workflow |
| `review.analysis.generate` | 은재 | `ReviewAnalysisGenerateAction` | 은재 Review workflow |
| `planning.approve` | 세인/주형 | `PlanningApproveAction` | 세인 approval, then 주형 Task/Milestone API |

## Payload Schemas

Payload field names must match `docs/contracts/schemas/pilo-public-contracts.schema.json`.

### TaskCreateDraft

Defined by `docs/contracts/task.md`.

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

### TaskStatusUpdateAction

```json
{
  "taskId": "uuid",
  "status": "in_progress",
  "reason": "PR이 생성되어 리뷰 대기로 전환한다."
}
```

### TaskAssignAction

```json
{
  "taskId": "uuid",
  "assigneeMemberId": "uuid"
}
```

### GithubIssueCreateAction

```json
{
  "workspaceId": "uuid",
  "repositoryId": "uuid",
  "taskId": "uuid",
  "title": "OAuth callback 처리",
  "body": "Task 내용과 완료 기준을 GitHub Issue로 생성한다.",
  "labels": ["backend", "auth"],
  "assignees": ["github-user"]
}
```

### MeetingReportGenerateAction

```json
{
  "workspaceId": "uuid",
  "meetingId": "uuid",
  "requestedByMemberId": "uuid"
}
```

### ReviewAnalysisGenerateAction

```json
{
  "pullRequestId": "uuid",
  "repositoryId": "uuid",
  "requestedByMemberId": "uuid"
}
```

### PlanningApproveAction

```json
{
  "workspaceId": "uuid",
  "projectPlanDraftId": "uuid",
  "approvedByMemberId": "uuid"
}
```

## State Machine

```text
draft -> waiting_confirmation -> confirmed -> executed
draft -> executed
draft -> rejected
waiting_confirmation -> rejected
confirmed -> failed
executed is terminal
rejected is terminal
failed is terminal
```

### State Rules

- `draft`: workflow가 action 후보를 만들었지만 아직 사용자에게 확인 요청을 띄우지 않은 상태다.
- `waiting_confirmation`: 사용자 확인이 필요한 상태다.
- `confirmed`: 사용자가 실행을 승인했지만 target owner API 호출이 끝나지 않은 상태다.
- `executed`: target owner API 호출이 성공한 terminal 상태다.
- `rejected`: 사용자가 거절한 terminal 상태다.
- `failed`: 사용자가 승인한 action의 target owner API 실행 실패 terminal 상태다.
- workflow 또는 result 처리 실패는 action `failed`가 아니라 `AgentResultMessage.status = failed`와 `error`, `trace`로 표현한다.
- `requiresConfirmation = false`인 action은 `draft`와 `executed`만 사용한다.
- 이 경우 `confirmedByMemberId`, `confirmedAt`는 계속 `null`이어야 하며, 상태는 `draft -> executed`로만 진행한다.
- `executed`, `rejected`, `failed` 상태는 다른 상태로 되돌리지 않는다.

## SQS Message Contract

Agent 실행은 app-server가 job queue에 요청을 넣고, ai-worker가 처리한 뒤 result queue로 결과를 돌려주는 구조다.

| Queue | Producer | Consumer | Purpose |
|---|---|---|---|
| `pilo-agent-jobs` | App Server | AI Worker | workflow 실행 요청 |
| `pilo-agent-results` | AI Worker | App Server | workflow 실행 결과와 action 후보 반환 |

### AgentJobMessage

```json
{
  "jobId": "uuid",
  "runId": "uuid",
  "workflowType": "meeting.report.generate",
  "workflowVersion": "v1",
  "workspaceId": "uuid",
  "actorMemberId": "uuid",
  "input": {},
  "contextRefs": [
    {
      "type": "meeting",
      "id": "uuid"
    }
  ],
  "requestedAt": "2026-06-27T10:00:00.000Z"
}
```

### AgentResultMessage

```json
{
  "jobId": "uuid",
  "runId": "uuid",
  "status": "succeeded",
  "output": {},
  "actions": [],
  "trace": [],
  "error": null,
  "finishedAt": "2026-06-27T10:01:00.000Z"
}
```

### Queue Rules

- `jobId`는 idempotency key로 사용한다.
- `runId`는 `agent_runs.id`와 같아야 한다.
- `workflowType`은 `AgentJobMessage` schema에 정의된 workflow name만 사용한다.
- 허용 값은 `meeting.report.generate`, `review.analysis.generate`, `planning.generate`, `task.draft.generate`, `github.issue.draft.generate`, `orchestrator.run`이다.
- `workflowType`과 Agent action `type`의 1:1 대응은 보장하지 않는다.
- `contextRefs`는 원본 payload를 넣지 않고 `{ "type": "owner-domain entity type", "id": "entity uuid" }` 구조로 참조한다.
- `contextRefs.type`은 owner domain의 entity 종류를 나타내고, `contextRefs.id`는 해당 entity id를 가리킨다.
- message에는 secret, OAuth token, raw private key를 넣지 않는다.
- AI Worker는 target domain DB를 직접 수정하지 않고 `actions`만 반환한다.
- App Server는 result를 받은 뒤 `agent_runs`, `agent_run_steps`, `agent_actions`, `agent_traces`를 갱신한다.
- 실패 결과는 `status = failed`여야 한다. `error` field는 schema를 따르며, error object를 보낼 때 `message`는 필수이고 `code`는 선택/nullable이다.
- local 개발 queue URL은 `.env.example`의 `SQS_AGENT_JOBS_QUEUE_URL`, `SQS_AGENT_RESULTS_QUEUE_URL`을 따른다.

## Implementation Rules

- Agent는 target owner의 DB를 직접 수정하지 않는다.
- `requiresConfirmation = true`인 action은 사용자 확인 전 실행하지 않는다.
- 실행은 target owner API를 호출한다.
- payload는 `docs/contracts/schemas/pilo-public-contracts.schema.json`을 따른다.
- 승인된 action의 target API 실행이 실패하면 `agent_actions.status = failed`와 `agent_traces`에 이유를 남긴다.

## Required Tests

- action type별 payload validation
- confirmation 없이 실행되지 않는지
- target API 실패 시 `failed` 처리되는지
- 실행 후 trace가 남는지
