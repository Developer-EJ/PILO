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
  "payload": {},
  "status": "draft",
  "confirmedByMemberId": null,
  "confirmedAt": null,
  "executedAt": null
}
```

## Supported Action Types

| Type | Target owner | Payload schema | Execution |
|---|---|---|---|
| `task.create.draft` | 주형 | `TaskCreateDraft` | 주형 Task draft/create API |
| `task.update.status` | 주형 | `TaskStatusUpdateAction` | 주형 Task status API |
| `github.issue.create` | 주형 | `GithubIssueCreateAction` | 주형 GitHub API |
| `meeting.report.generate` | 진호 | `MeetingReportGenerateAction` | 진호 Meeting workflow |
| `review.analysis.generate` | 은재 | `ReviewAnalysisGenerateAction` | 은재 Review workflow |
| `planning.approve` | 세인/주형 | `PlanningApproveAction` | 세인 approval, then 주형 Task/Milestone API |

## State Machine

```text
draft -> waiting_confirmation -> confirmed -> executed
draft -> rejected
waiting_confirmation -> rejected
confirmed -> failed
executed is terminal
rejected is terminal
failed is terminal
```

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

`output`은 `workflowType`별 contract를 따른다. `workflowType = "meeting.report.generate"`의 output shape과 meeting table 매핑 규칙은 `docs/contracts/meeting.md`의 `meeting.report.generate v1` 섹션을 따른다.

### Queue Rules

- `jobId`는 idempotency key로 사용한다.
- `runId`는 `agent_runs.id`와 같아야 한다.
- message에는 secret, OAuth token, raw private key를 넣지 않는다.
- AI Worker는 target domain DB를 직접 수정하지 않고 `actions`만 반환한다.
- App Server는 result를 받은 뒤 `agent_runs`, `agent_run_steps`, `agent_actions`, `agent_traces`를 갱신한다.
- 실패 결과는 `status = failed`, `error.message`, `error.code`를 포함한다.
- local 개발 queue URL은 `.env.example`의 `SQS_AGENT_JOBS_QUEUE_URL`, `SQS_AGENT_RESULTS_QUEUE_URL`을 따른다.

## Implementation Rules

- Agent는 target owner의 DB를 직접 수정하지 않는다.
- `requiresConfirmation = true`인 action은 사용자 확인 전 실행하지 않는다.
- 실행은 target owner API를 호출한다.
- payload는 `docs/contracts/schemas/pilo-public-contracts.schema.json`을 따른다.
- 실패하면 `agent_actions.status = failed`와 `agent_traces`에 이유를 남긴다.

## Required Tests

- action type별 payload validation
- confirmation 없이 실행되지 않는지
- target API 실패 시 `failed` 처리되는지
- 실행 후 trace가 남는지
