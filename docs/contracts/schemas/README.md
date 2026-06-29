# Contract Schemas

이 폴더는 public contract의 기계 검증용 JSON Schema를 둔다.

## 현재 기준

- `pilo-public-contracts.schema.json`: 핵심 read model, action payload, 공통 DTO 정의
  - 주형 Task/GitHub/Progress 기준: `TaskSummary`, `TaskDetail`, `TaskChecklistItemSummary`, `TaskCommentSummary`, `TaskActivityLogSummary`, `TaskDependencySummary`, `TaskDraft`, `MilestoneSummary`, `TaskStatusUpdateAction`, `GithubConnectionSummary`, `GithubRepositorySummary`, `GithubIssueSummary`, `GithubIssueCreateAction`, `PullRequestSummary`, `PullRequestChangedFileSummary`, `ProgressSummary`, `ProgressSnapshotSummary`
  - 진호 Meeting/Voice 기준: `MeetingAgenda`, `MeetingReportSummary`, `MeetingDecisionSummary`, `MeetingReportRiskSummary`, `MeetingReportNextAgenda`, `MeetingReportCanvasEntityRef`, `MeetingActionItem`, `VoiceScaffoldResponse`, `VoiceRoom`, `VoiceSession`
  - 세인 Planning 기준: `ProjectPlanDraftSummary`, `ProjectPlanDraftDetail`, `ProjectPlanTechStackRecommendation`, `ProjectPlanFeatureDraft`, `ProjectPlanRoleDraft`, `ProjectPlanMilestoneDraft`, `ProjectPlanRiskNote`, `ProjectPlanFirstAgendaDraft`, `ProjectPlanApprovalState`, `PlanningOwnerApiResult`
  - Auth: `CurrentUser`, `AuthSessionState`, `AuthProvidersResponse`, `AuthErrorResponse`

## 사용 규칙

- Public DTO 필드를 추가/변경/삭제하면 MD contract와 schema를 함께 수정한다.
- schema 변경 PR은 관련 owner와 consumer가 리뷰한다.
- 구현 코드는 가능하면 이 schema에서 TypeScript/Python type을 생성해서 사용한다.
- schema에 없는 필드를 consumer가 임의로 의존하지 않는다.
- provider domain이 아직 없으면 `docs/contracts/fixtures`의 fixture를 schema 기준 mock으로 사용한다.
