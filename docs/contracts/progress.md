# Progress Contract

## Owner

주형

## Scope

Progress는 Task와 Milestone 기준으로 진행률, 지연, blocked, review 대기 상태를 계산한다.
`milestoneId`가 있는 ProgressSummary는 주형 Task contract의 `MilestoneSummary`와 같은 Milestone을 기준으로 집계한다.

## Owned Tables

- `progress_snapshots`

## Current Runtime APIs

현재 `dev`에는 Progress HTTP controller가 없다. 아래 Progress API는 아직
runtime에서 호출하면 안 된다. 동현 Dashboard와 세인 Agent는 현재
`WorkspaceDashboardReadModel.progress` fixture 또는 owner-provided mock을 사용한다.

Progress is an MVP Target read model and 주형 implementation priority, but it is
not Current Runtime. Consumer UI may show fixture/mock progress only when the PR
explicitly marks that state and links the follow-up runtime API work.

## Deferred APIs

| Method | Path | 목적 | Consumer |
|---|---|---|---|
| `GET` | `/api/workspaces/:workspaceId/progress/summary` | 현재 진행률 요약 | 동현 Dashboard, 세인 Agent |
| `GET` | `/api/workspaces/:workspaceId/progress/history` | 진행률 스냅샷 히스토리 | 동현 Dashboard |
| `POST` | `/api/workspaces/:workspaceId/progress/snapshots` | 스냅샷 생성 | 주형, scheduled worker |

Canonical target path 후보는 `/api/workspaces/:workspaceId/progress/summary`다.
`/api/workspaces/:workspaceId/progress`는 public contract가 아니며, consumer는 사용하지 않는다.

## Read Models

### ProgressSummary

```json
{
  "workspaceId": "uuid",
  "milestoneId": "uuid",
  "totalTasks": 20,
  "doneTasks": 8,
  "blockedTasks": 2,
  "reviewTasks": 3,
  "delayedTasks": 1,
  "progressRate": 40,
  "capturedAt": "2026-06-27T12:00:00Z"
}
```

Calculation rules:

- Source rows are non-deleted `tasks` in the requested workspace.
- If `milestoneId` is provided, include only tasks whose `milestoneId` equals that value.
- `totalTasks`: included task count.
- `doneTasks`: included tasks with `status = "done"`.
- `blockedTasks`: included tasks with `status = "blocked"`.
- `reviewTasks`: included tasks with `status = "in_review"`.
- `delayedTasks`: included tasks whose `dueDate` is before the calculation date and whose status is not `done`.
- `progressRate`: `0` when `totalTasks = 0`; otherwise `(doneTasks / totalTasks) * 100`, rounded to two decimal places for API responses. Integer values such as `25` are valid JSON numbers.
- `capturedAt`: calculation timestamp. Snapshot history uses the snapshot creation time; live summary uses request handling time or the owner service's calculation time.

### ProgressSnapshotSummary

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "milestoneId": "uuid",
  "totalTasks": 20,
  "doneTasks": 8,
  "blockedTasks": 2,
  "reviewTasks": 3,
  "delayedTasks": 1,
  "progressRate": 40,
  "capturedAt": "2026-06-27T12:00:00Z"
}
```

## Events

- `progress.snapshot_created`
- `progress.delayed_task_detected`
- `progress.blocked_task_detected`

## Boundaries

- Progress는 Task 상태를 읽어 계산하지만 Task 상태를 직접 변경하지 않는다.
- Milestone 생성/수정과 Task-Milestone 연결은 Task contract의 Milestone/Task API가 소유한다.
- 동현 Dashboard는 `ProgressSummary`만 표시한다.
- 세인 Agent는 다음 액션 추천을 위해 `ProgressSummary`를 context로 소비한다.
