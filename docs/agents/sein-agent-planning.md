# 세인 Agent Brief: Agent Runtime / Orchestrator / Planning

## Mission

세인은 PILO의 AI 실행 기반을 만든다. 각 도메인 workflow가 같은 방식으로 실행되고, action이 승인된 뒤 owner API로 안전하게 전달되도록 runtime, trace, action contract, planning draft를 관리한다.

## Must Read

- `docs/contracts/agent-actions.md`
- `docs/contracts/planning.md`
- `docs/contracts/task.md`
- `docs/contracts/meeting.md`
- `docs/contracts/review.md`
- `docs/db/db-schema-by-owner.md`
- `docs/contracts/fixtures/agent-job.fixture.json`
- `docs/contracts/fixtures/agent-result.fixture.json`

## Owned Data

- `agents`
- `agent_workflows`
- `agent_runs`
- `agent_run_steps`
- `agent_contexts`
- `agent_actions`
- `agent_traces`
- `project_plan_drafts`
- `team_profiles`
- `plan_tech_stack_recommendations`
- `plan_feature_drafts`
- `role_assignments`
- `plan_role_assignment_drafts`
- `plan_milestone_drafts`
- `plan_risk_notes`

## Suggested Paths

- Frontend: `apps/frontend/app/(workspace)/agent`, `apps/frontend/app/(workspace)/planning`
- App Server: `apps/app-server/src/modules/agent`, `apps/app-server/src/modules/planning`
- AI Worker: `apps/ai-worker/app/runtime`, `apps/ai-worker/app/workflows/planning`
- Public adapters: `apps/app-server/src/modules/agent/public`, `apps/app-server/src/modules/planning/public`

## Implement First

1. Agent registry and workflow registry.
2. Agent run create/status/result.
3. Agent run step and trace logging.
4. Agent action draft, confirmation, execution status.
5. SQS job/result message contract with FastAPI worker.
6. Project plan draft and approval workflow.
7. Domain workflow adapter interfaces for meeting, task, review, planning.

## Public APIs To Provide

- `POST /agent-runs` starts workflow run.
- `GET /agent-runs/:runId` returns run detail.
- `GET /workspaces/:workspaceId/agent/actions` lists pending actions.
- `POST /agent/actions/:actionId/confirm` confirms action.
- `POST /agent/actions/:actionId/reject` rejects action.
- `POST /workspaces/:workspaceId/planning/drafts` creates planning draft.
- `POST /planning/drafts/:draftId/approve` approves draft and calls owner APIs.

## Provides To Others

- 동현: recommended next actions and project plan summary.
- 주형: task and GitHub action payloads.
- 진호: meeting report generation workflow runtime.
- 은재: PR analysis workflow runtime.

## Consumes From Others

- 동현: Workspace/member identity.
- 주형: Task, milestone, GitHub executable APIs.
- 진호: meeting transcript/report context.
- 은재: PR analysis context and review result adapter.

## Mock Rule

외부 LLM 또는 worker가 준비되지 않았으면 deterministic local runner를 둔다. local runner도 `agent_runs`, `agent_actions`, `agent_traces` 형태는 동일하게 남긴다.

## Do Not Touch

- 각 도메인의 원본 업무 table을 직접 write하지 않는다.
- Canvas UI layout을 소유하지 않는다.
- GitHub token refresh나 repository sync를 소유하지 않는다.
- PR diff parser의 도메인 판단을 은재 영역 밖에서 확정하지 않는다.

## Done

- 모든 Agent action은 승인 전 원본 데이터를 바꾸지 않는다.
- SQS job/result queue 계약이 문서화되어 있다.
- 실패한 run은 error와 trace로 재현 가능하다.
- planning draft 승인 후 실제 Task/Milestone 생성은 주형 API를 호출한다.
- 도메인 workflow가 runtime 없이 독자 실행 로직을 만들 필요가 없다.
