# PILO Contracts Index

이 폴더는 AGENT가 독립적으로 구현할 때 반드시 지켜야 하는 도메인 간 인터페이스 계약을 모아둔다.

## Status Vocabulary

이 폴더의 route 표는 아래 의미로 읽는다.

| Label | 의미 |
| --- | --- |
| Current Runtime APIs | 현재 `dev` app-server controller에 존재해 호출 가능한 path |
| Deferred APIs | DTO/schema/fixture 후보는 있지만 현재 runtime controller가 없는 path |
| MVP Target APIs | `docs/api-contract-v1.md`에 정의된 목표 path. 현재 runtime과 다를 수 있음 |

규칙:

1. 구현 중 호출해야 하는 API는 각 도메인 문서의 `Current Runtime APIs`만 사용한다.
2. `Deferred APIs`는 mock/fixture 또는 후속 contract PR 전용이다.
3. 새 API를 추가할 때는 `docs/api-contract-v1.md`의 `/api` prefix 원칙을 따른다.
4. app-server uses the global `api` prefix. New public HTTP APIs must be exposed as `/api/...`.

## 읽는 순서

1. `agent.md`
2. `docs/README.md`
3. `docs/mvp-scope-v1.md`
4. `docs/domain-boundary-v1.md`
5. `docs/api-contract-v1.md`
6. `docs/db/mvp-db-schema-v1.md`
7. `docs/collaboration-v1.md`
8. `docs/agents/README.md`
9. `docs/contracts/interface-contract-guide.md`
10. 본인이 구현할 도메인 contract
11. 본인이 소비하는 외부 도메인 contract
12. `docs/contracts/schemas/pilo-public-contracts.schema.json`
13. `docs/contracts/fixtures`

## 담당자별 contract

| 담당자 | 소유 contract | 소비자가 의존해도 되는 것 |
|---|---|---|
| 동현 | `auth.md`, `workspace.md`, `canvas.md` | CurrentUser, WorkspaceMemberSummary, CanvasEntityRef |
| 주형 | `task.md`, `github.md`, `progress.md` | TaskSummary, TaskDetail, TaskChecklistItemSummary, TaskCommentSummary, TaskActivityLogSummary, TaskDependencySummary, TaskDraft, TaskDraftSummary, MilestoneSummary, GithubConnectionSummary, GithubRepositorySummary, GithubIssueSummary, PullRequestSummary, PullRequestChangedFileSummary, ProgressSummary |
| 진호 | `meeting.md`, `voice.md` | MeetingAgenda, MeetingReportSummary, MeetingDecisionSummary, MeetingReportRiskSummary, MeetingReportNextAgenda, MeetingReportCanvasEntityRef, MeetingActionItem, VoiceRoom, VoiceSession |
| 은재 | `review.md` | CodeReviewRoomSummary, PRAnalysisSummary, ReviewNodeSummary, ReviewRiskSummary |
| 세인 | `agent-actions.md`, `planning.md` | AgentAction, ProjectPlanDraftSummary, ProjectPlanDraftDetail, ProjectPlanTechStackRecommendation, ProjectPlanFeatureDraft, ProjectPlanRoleDraft, ProjectPlanMilestoneDraft, ProjectPlanRiskNote, ProjectPlanFirstAgendaDraft, ProjectPlanApprovalState, PlanningOwnerApiResult |
| DevOps/공통 Backend | `common-system.md` | NotificationCreateRequest, SharedFileRef |

## 구현 전 필수 확인

- 내가 수정하는 데이터의 owner가 나인가?
- 외부 도메인의 write API를 직접 호출해야 하는가, Agent action으로 요청해야 하는가?
- 내가 필요한 read model이 contract에 정의되어 있는가?
- contract에 없는 필드가 필요하다면 구현 PR 전에 contract PR을 먼저 올렸는가?
- mock/stub을 쓴다면 후속 실제 연동 Issue를 만들었는가?
- provider domain이 미구현이면 `docs/contracts/fixtures`로 임시 구현할 수 있는가?

## Public Contract 변경 절차

1. `docs/contracts/*.md`와 `docs/contracts/schemas/*.json`을 먼저 수정한다.
2. 영향을 받는 담당자를 reviewer로 지정한다.
3. breaking change라면 deprecated 필드와 migration plan을 적는다.
4. Contract PRs are merged into `dev` before implementation branches depend on them.
5. 구현 브랜치는 최신 `dev`를 반영한 뒤 작업한다.
