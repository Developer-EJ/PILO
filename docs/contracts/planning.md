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
| `POST` | `/workspaces/:workspaceId/project-plan-drafts` | 계획 초안 생성 |
| `GET` | `/project-plan-drafts/:draftId` | 계획 초안 상세 |
| `POST` | `/project-plan-drafts/:draftId/recommend-tech-stack` | 기술스택 추천 |
| `POST` | `/project-plan-drafts/:draftId/breakdown-features` | 기능 분해 |
| `POST` | `/project-plan-drafts/:draftId/assign-roles` | 역할 배정 초안 |
| `POST` | `/project-plan-drafts/:draftId/approve` | 계획 승인 |

## Read Models

### ProjectPlanDraftSummary

Dashboard, Canvas, onboarding result 목록이 쓰는 요약 read model이다.

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
  "createdAt": "2026-06-27T12:00:00Z"
}
```

### ProjectPlanDraftDetail

`GET /project-plan-drafts/:draftId`의 응답 read model이다. 온보딩 결과 화면은 이 응답 하나로 기술스택, 기능 초안, 역할 초안, 마일스톤 초안, 리스크, 첫 회의 agenda 초안, 승인 결과를 표시한다.

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "goal": "AI 협업 도구 MVP 구현",
  "targetUser": "부트캠프 팀 프로젝트",
  "problem": "팀별 역할 분배와 진행 현황 공유가 흩어져 있다.",
  "duration": "4 weeks",
  "outputGoal": "협업 가능한 MVP와 발표 자료",
  "status": "approved",
  "createdByMemberId": "uuid",
  "techStack": {
    "id": "uuid",
    "draftId": "uuid",
    "frontend": "Next.js",
    "backend": "NestJS",
    "databaseName": "PostgreSQL",
    "ai": "OpenAI API",
    "deploy": "AWS ECS",
    "reason": "팀원이 TypeScript 기반으로 빠르게 나눠 개발할 수 있다.",
    "difficulty": "medium",
    "alternatives": ["FastAPI", "Supabase"],
    "createdAt": "2026-06-27T12:05:00Z"
  },
  "featureDrafts": [
    {
      "id": "uuid",
      "draftId": "uuid",
      "title": "Agent 실행 상태 조회",
      "description": "workflow 실행 상태와 pending action 수를 표시한다.",
      "scope": "mvp",
      "reason": "긴 작업의 상태를 사용자가 확인해야 한다.",
      "sortOrder": 0,
      "createdAt": "2026-06-27T12:10:00Z"
    }
  ],
  "roleDrafts": [
    {
      "id": "uuid",
      "draftId": "uuid",
      "member": {
        "memberId": "uuid",
        "name": "세인"
      },
      "suggestedRole": "Agent Runtime / Planning",
      "reason": "Agent contract와 planning workflow를 담당한다.",
      "sortOrder": 0,
      "createdAt": "2026-06-27T12:12:00Z"
    }
  ],
  "milestoneDrafts": [
    {
      "id": "uuid",
      "draftId": "uuid",
      "title": "MVP contract freeze",
      "startDate": "2026-07-01",
      "endDate": "2026-07-05",
      "sortOrder": 0,
      "createdAt": "2026-06-27T12:14:00Z"
    }
  ],
  "riskNotes": [
    {
      "id": "uuid",
      "draftId": "uuid",
      "content": "공통 contract가 늦어지면 각 도메인 UI가 fixture에 오래 머문다.",
      "severity": "medium",
      "sortOrder": 0,
      "createdAt": "2026-06-27T12:16:00Z"
    }
  ],
  "firstAgendaDraft": {
    "id": "uuid",
    "draftId": "uuid",
    "title": "MVP kickoff",
    "objective": "역할과 첫 주 contract 우선순위를 확정한다.",
    "agendaItems": ["계약 우선순위 확인", "owner API 경계 확인"],
    "attendeeMemberIds": ["uuid"],
    "durationMinutes": 45,
    "createdAt": "2026-06-27T12:18:00Z"
  },
  "approval": {
    "status": "executed",
    "actionId": "uuid",
    "requestedAt": "2026-06-27T12:20:00Z",
    "confirmedAt": "2026-06-27T12:25:00Z",
    "executedAt": "2026-06-27T12:26:00Z",
    "ownerApiResults": [
      {
        "owner": "task",
        "operation": "task.create",
        "sourceDraftType": "feature",
        "sourceDraftId": "uuid",
        "status": "succeeded",
        "targetEntityId": "uuid",
        "errorMessage": null
      }
    ]
  },
  "createdAt": "2026-06-27T12:00:00Z",
  "updatedAt": "2026-06-27T12:26:00Z"
}
```

### Detail Field Rules

- `status`는 planning draft 자체의 상태다. 허용 값은 `draft`, `reviewing`, `approved`, `rejected`다.
- 승인 전 후보 데이터는 `techStack`, `featureDrafts`, `roleDrafts`, `milestoneDrafts`, `riskNotes`, `firstAgendaDraft`에만 둔다.
- 승인 후 주형 Task/Milestone API 호출 결과는 `approval.ownerApiResults`에만 둔다.
- `ownerApiResults[].targetEntityId`는 호출 성공 시 생성된 owner domain entity id다. 실패, 대기, 미요청 상태에서는 `null`이다.
- Planning detail은 Task/Milestone 원본 필드를 복제하지 않고, owner API 결과 id만 참조한다.
- `firstAgendaDraft`는 세인이 소유하는 planning draft 후보이며, 진호 Meeting 원본 DB에 직접 저장하지 않는다. Meeting API가 준비되기 전까지는 Planning detail 안의 후보 데이터로만 유지한다.

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
- 첫 회의 agenda 후보는 Meeting 생성 요청이 아니라 planning-owned draft다. 실제 Meeting 원본 저장은 진호 Meeting API가 담당한다.

## Mock Rule

Task API가 없으면 approve flow는 `approval.status = waiting_confirmation` 또는 `confirmed`에서 멈춘다. owner API 호출을 시도했지만 실패한 경우에는 `approval.ownerApiResults[].status = failed`와 `errorMessage`로 표현하고, `ProjectPlanDraftDetail.status`에 owner API 실행 상태를 섞지 않는다.

