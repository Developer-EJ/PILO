# PILO Interface Contract Guide

이 문서는 여러 담당자가 겹치는 기능을 구현할 때 어떤 인터페이스 규약으로 연결하고, 실제 코드에서는 어떻게 처리할지 정의한다.

## 핵심 원칙

- 원본 데이터 owner는 항상 한 명이다.
- 다른 담당자는 owner의 DB, repository, service를 직접 수정하지 않는다.
- 도메인 간 연결은 API, read model, event, Agent action, public contract 중 하나로 처리한다.
- Public contract 변경은 구현 PR보다 먼저 별도 PR로 올린다.
- 아직 상대 도메인이 구현되지 않았으면 consumer는 mock/read model stub으로 진행하고, 실제 연결은 contract가 merge된 뒤 붙인다.
- 권한과 담당자 판단은 가능한 한 `users`가 아니라 `workspace_members` 기준으로 처리한다.

## Contract 종류

| 종류 | 목적 | 예시 | 구현 위치 |
|---|---|---|---|
| API Contract | 다른 도메인의 기능 호출 | Task 생성, PR 분석 요청 | `docs/contracts/*.md`, 추후 OpenAPI |
| Read Model | 다른 도메인 화면 표시용 조회 모델 | TaskSummary, PRAnalysisSummary | owner API response DTO |
| Event Contract | 상태 변경 알림 | `task.status_changed`, `pr.synced` | 추후 event schema |
| Agent Action Contract | Agent가 실제 변경을 제안/실행 | `task.create.draft` | `agent_actions.payload` schema |
| UI Slot Contract | 상대 화면이 없을 때 자리만 예약 | Canvas panel, Review sidebar | frontend shared type 또는 mock |

## 구현 규칙

1. Owner 도메인은 자기 DB table, repository, service, write API를 소유한다.
2. Consumer 도메인은 owner가 제공한 DTO/read model만 사용한다.
3. Consumer가 owner 도메인 데이터를 변경해야 하면 write API 또는 Agent action을 호출한다.
4. Consumer가 임시 구현이 필요하면 `mock`, `stub`, `fixture`라고 명시하고 실제 table을 만들지 않는다.
5. Public DTO 필드는 제거하지 않고 deprecated 기간을 둔다.
6. 같은 데이터를 각자 DB에 복제하지 않는다. 캐시나 summary가 필요하면 owner와 read model 이름을 합의한다.
7. PR 본문에 `Contract Used`, `Owner`, `Consumers`, `Mock/Real` 여부를 적는다.

## 겹치는 기능별 처리

| 겹치는 기능 | 원본 owner | 소비자 | 인터페이스 | 구현 방식 |
|---|---|---|---|---|
| 로그인 사용자 정보 | 동현 Auth | 주형/진호/은재/세인 | `CurrentUser`, `AuthSessionState` | 모든 API는 인증 후 `currentMember` 또는 `currentUser`를 주입받는다 |
| GitHub 로그인 vs GitHub Repository 연동 | 동현 Auth / 주형 GitHub | 동현/주형 | `OAuthAccount`, `GitHubConnection` | 로그인 OAuth와 Repository 권한 scope를 분리한다 |
| Workspace 멤버/권한 | 동현 Workspace | 주형/진호/은재/세인 | `WorkspaceMemberSummary` | 담당자/작성자/리뷰어는 `workspace_member_id`를 우선 사용한다 |
| Dashboard 요약 | 주형/진호/은재/세인 | 동현 Dashboard | `TaskSummary`, `MeetingReportSummary`, `PRAnalysisSummary`, `AgentRecommendation` | 동현은 원본 DB를 읽지 않고 각 owner의 summary API를 호출한다 |
| Canvas 카드 | 동현 Canvas | 주형/진호/은재/세인 | `CanvasEntityRef`, `CanvasShapeRequest` | 외부 도메인은 표시할 entity id/read model만 제공하고 shape 생성은 동현이 한다 |
| Meeting Action Item -> Task | 진호 Meeting / 주형 Task | 진호/주형/세인 | `MeetingActionItem`, `TaskCreateDraft` | 진호는 후보를 만들고, 주형 API 또는 세인 Agent action으로 Task를 생성한다 |
| Task -> GitHub Issue | 주형 GitHub | 동현/세인 | `TaskGithubIssueLink` | Issue 생성/동기화는 주형만 수행한다 |
| Task -> PR -> Review | 주형 GitHub / 은재 Review | 동현/주형/은재 | `PullRequestSummary`, `PRAnalysisSummary` | 주형은 PR 원본, 은재는 분석 결과를 소유한다 |
| PR 분석 Agent | 은재 Review / 세인 Agent | 은재/세인 | `review.analysis.generate` | 은재가 분석 workflow 요구사항을 정의하고 세인 runtime으로 실행한다 |
| 회의록 Agent | 진호 Meeting / 세인 Agent | 진호/세인/주형 | `meeting.report.generate`, `task.create.draft` | 진호가 회의록 결과를 만들고 Task 전환은 주형 contract를 탄다 |
| 프로젝트 계획 -> Task/Milestone | 세인 Planning / 주형 Task | 세인/주형/동현 | `ProjectPlanDraft`, `TaskCreateDraft`, `MilestoneDraft` | 세인은 초안만 소유하고 승인 후 주형 API로 실제 저장한다 |
| 파일/문서 노드 | Common/동현 협의 | 동현/진호/은재/세인 | `SharedFileRef` | 파일 메타데이터는 `shared_files`, Canvas 표시는 동현 shape로 처리한다 |
| 알림 | Common/System | 동현/주형/진호/은재/세인 | `NotificationCreateRequest` | 각 도메인은 알림 생성을 요청하고 알림 저장은 공통 owner가 담당한다 |

## Canvas 구현 규약

Canvas는 실제 업무 데이터를 소유하지 않는다.

```json
{
  "entityType": "task",
  "entityId": "uuid",
  "displayTitle": "GitHub Repository 연결 구현",
  "shapeType": "task"
}
```

- `entityType/entityId`는 실제 owner 도메인의 데이터를 가리킨다.
- 동현은 `canvas_shapes`, `canvas_connections`, `canvas_node_positions`, `canvas_view_settings`, `canvas_filter_settings`만 직접 수정한다.
- 주형/진호/은재/세인은 Canvas DB를 직접 수정하지 않는다.
- Canvas에 표시할 데이터가 필요하면 각 owner가 `*Summary` read model을 제공한다.
- 상대 도메인이 미구현이면 동현은 mock node로 UI를 구현하고, mock임을 PR에 표시한다.

## Agent Action 구현 규약

Agent는 다른 도메인 DB를 직접 변경하지 않는다.

```json
{
  "type": "task.create.draft",
  "source": "meeting",
  "requiresConfirmation": true,
  "payload": {
    "workspaceId": "uuid",
    "title": "OAuth callback 처리",
    "assigneeMemberId": "uuid",
    "priority": "high"
  }
}
```

- 세인은 `agent_runs`, `agent_actions`, `agent_traces`를 소유한다.
- 실제 실행은 target owner의 API를 호출한다.
- 예: `task.create.draft` 승인 후 주형의 Task API 호출.
- payload schema는 `docs/contracts/agent-actions.md` 또는 domain contract에 정의한다.

## 상대 기능이 아직 없을 때

| 상황 | 처리 |
|---|---|
| 동현이 Canvas에 Task 공간이 필요한데 주형 Task API가 없음 | `TaskSummary` mock fixture로 UI 구현, 실제 DB 저장 금지 |
| 은재가 PR 리뷰 화면이 필요한데 주형 PR 동기화가 없음 | `PullRequestSummary` mock으로 리뷰 화면 구현 |
| 진호가 Action Item을 Task로 바꾸고 싶은데 주형 API가 없음 | `TaskCreateDraft` contract만 작성하고 변환 버튼은 pending 상태 처리 |
| 세인이 Agent action을 만들었는데 target API가 없음 | `agent_actions.status = waiting_confirmation`까지만 구현 |
| 공통 타입이 필요함 | owner contract 문서에 DTO를 먼저 정의하고 consumer는 그 타입만 사용 |

## PR 체크리스트

- 내 PR이 다른 도메인 DB/service/repository를 직접 수정하지 않는가?
- Public contract가 바뀐다면 `docs/contracts/*`를 먼저 수정했는가?
- Consumer가 있는 contract 변경이라면 관련 owner를 reviewer로 지정했는가?
- mock/stub을 사용했다면 PR 본문에 명시했는가?
- breaking change라면 deprecated 기간과 migration plan을 적었는가?
- read model 이름과 owner가 문서에 명확한가?

## Contract 문서 템플릿

```md
## Owner
주형 Task

## Provided Read Models
- TaskSummary

## Provided APIs
- GET /workspaces/:workspaceId/tasks/summary
- POST /workspaces/:workspaceId/tasks/drafts

## Consumed By
- 동현 Dashboard
- 동현 Canvas
- 진호 Meeting
- 세인 Agent

## Events
- task.created
- task.status_changed

## Breaking Change Policy
- 필드 제거 전 deprecated 표시
- consumer PR merge 후 제거
```
