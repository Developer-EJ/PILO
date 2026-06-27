# Review Contract

## Owner

은재

## Scope

PR 리뷰룸, PR 분석 결과, 변경 파일/함수, 리뷰 그래프/노드, 리뷰어 상태, 질문, 리스크, 체크리스트를 담당한다.

## Owned Tables

- `code_review_rooms`
- `pull_request_analyses`
- `review_graphs`
- `changed_files`
- `changed_functions`
- `review_nodes`
- `node_review_states`
- `review_comments`
- `review_questions`
- `review_risks`
- `review_checklist_items`

## Consumed Contracts

- 주형 `PullRequestSummary`
- 주형 `TaskSummary`
- 세인 `review.analysis.generate`
- 동현 `WorkspaceMemberSummary`

## Provided APIs

| Method | Path | 목적 |
|---|---|---|
| `POST` | `/pull-requests/:pullRequestId/review-room` | 리뷰룸 생성 |
| `GET` | `/code-review-rooms/:roomId` | 리뷰룸 상세 |
| `POST` | `/pull-requests/:pullRequestId/analysis` | PR 분석 요청 |
| `GET` | `/pull-requests/:pullRequestId/analysis` | PR 분석 결과 조회 |
| `GET` | `/pull-requests/:pullRequestId/analysis-summary` | Dashboard/Canvas용 PR 분석 요약 조회 |
| `GET` | `/pull-request-analyses/:analysisId/graph` | 리뷰 그래프 조회 |
| `PATCH` | `/review-nodes/:nodeId/state` | 노드별 리뷰 상태 저장 |
| `POST` | `/code-review-rooms/:roomId/comments` | 리뷰 코멘트 작성 |
| `POST` | `/pull-request-analyses/:analysisId/checklist-items` | 체크리스트 항목 생성 |

## Read Models

### PRAnalysisSummary

```json
{
  "id": "uuid",
  "pullRequestId": "uuid",
  "purposeSummary": "Task API와 Progress 계산을 추가했다.",
  "impactSummary": "Task, Progress, Dashboard summary에 영향이 있다.",
  "testRecommendation": "Task API smoke test와 Progress regression test를 확인한다.",
  "riskLevel": "medium",
  "analysisStatus": "succeeded",
  "okCount": 6,
  "discussCount": 2,
  "riskCount": 1,
  "conclusion": "리뷰 후 merge 가능"
}
```

### ReviewNodeSummary

```json
{
  "id": "uuid",
  "analysisId": "uuid",
  "nodeType": "file",
  "label": "tasks.service.ts",
  "filePath": "apps/app-server/src/modules/task/task.service.ts",
  "functionName": null,
  "riskLevel": "medium",
  "status": "discuss"
}
```

### ReviewRiskSummary

```json
{
  "id": "uuid",
  "analysisId": "uuid",
  "title": "Progress 계산 변경 영향",
  "description": "Task 상태 enum 변경이 ProgressSummary count에 영향을 줄 수 있다.",
  "riskLevel": "medium",
  "status": "open",
  "affectedNodeIds": ["uuid"],
  "recommendation": "ProgressSummary contract fixture를 함께 검증한다."
}
```

## Public Adapter Rules

- `PRAnalysisSummary`는 Dashboard와 Canvas가 원본 review DB를 읽지 않기 위한 public read model이다.
- 내부 DB row가 null을 반환해도 `riskLevel = low`, `analysisStatus = pending`, count 필드는 `0`을 기본값으로 보장한다.
- `ReviewNodeSummary`는 PR 내부 review graph 표시용이며 전체 Canvas layout이나 shape 저장 모델이 아니다.
- `ReviewRiskSummary`는 Dashboard/Canvas가 위험 PR을 표시하기 위한 read model이며 review risk 원본 수정 API가 아니다.

## Events

- `review.room_created`
- `review.analysis_requested`
- `review.analysis_completed`
- `review.node_state_changed`
- `review.comment_created`

## Agent Actions Consumed

- `review.analysis.generate`

## Boundaries

- 은재는 PR 분석 결과를 소유한다.
- GitHub PR 원본 동기화는 주형이 소유한다.
- 은재는 GitHub API token이나 webhook을 직접 구현하지 않는다.
- 동현 Dashboard/Canvas는 `PRAnalysisSummary`, `ReviewRiskSummary`만 표시한다.

## Mock Rule

주형의 PR sync가 없으면 `PullRequestSummary` fixture로 리뷰 화면과 분석 결과 UI를 구현한다. 실제 PR 원본 table을 은재 도메인에 만들지 않는다.
