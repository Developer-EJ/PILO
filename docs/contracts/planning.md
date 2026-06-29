# Planning Contract

## Owner

세인

## Scope

Project Planning은 온보딩 질문, 프로젝트 계획 초안, 기술스택 추천, 기능 분해, 역할 배정 초안, 마일스톤 초안, 리스크 초안을 담당한다.

## Owned Tables

- `project_plan_drafts`
- `team_profiles`
- `plan_tech_stack_recommendations`
- `plan_feature_drafts`
- `role_assignments`
- `plan_role_assignment_drafts`
- `plan_milestone_drafts`
- `plan_risk_notes`

## Provided APIs

| Method | Path | 목적 |
|---|---|---|
| `GET` | `/workspaces/:workspaceId/planning/drafts` | Paginated planning draft summary list |
| `POST` | `/workspaces/:workspaceId/planning/drafts` | 계획 초안 생성 |
| `GET` | `/planning/drafts/:draftId` | 계획 초안 상세 |
| `POST` | `/planning/drafts/:draftId/recommend-tech-stack` | 기술스택 추천 |
| `POST` | `/planning/drafts/:draftId/breakdown-features` | 기능 분해 |
| `POST` | `/planning/drafts/:draftId/assign-roles` | 역할 배정 초안 |
| `POST` | `/planning/drafts/:draftId/approve` | 계획 승인 |

## Read Models

### ProjectPlanDraftSummary

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "goal": "AI 협업 도구 MVP 구현",
  "targetUser": "부트캠프 팀 프로젝트",
  "status": "draft",
  "featureDraftCount": 12,
  "milestoneDraftCount": 4,
  "riskCount": 3,
  "createdAt": "2026-06-27T12:00:00Z",
  "updatedAt": "2026-06-27T12:30:00Z"
}
```

`GET /workspaces/:workspaceId/planning/drafts` returns `ProjectPlanDraftSummaryPage`.

`featureDraftCount`, `milestoneDraftCount`, `riskCount`, `createdAt`, and `updatedAt` are required fields in every `ProjectPlanDraftSummary`. `goal` and `targetUser` may be `null` when the draft is still being collected.

## Events

- `planning.draft_created`
- `planning.tech_stack_recommended`
- `planning.features_drafted`
- `planning.roles_drafted`
- `planning.approved`

## Boundaries

- 세인은 승인 전 draft 데이터를 소유한다.
- 승인 후 실제 Task/Milestone 생성은 주형 API를 호출한다.
- 동현은 온보딩 화면과 결과 표시를 담당하지만 planning draft 원본을 직접 수정하지 않는다.

## Mock Rule

Task API가 없으면 approve flow는 `waiting_confirmation` 또는 `approved_pending_task_creation` 상태로 멈춘다.

