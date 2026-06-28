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

- 주형 `PullRequestChangedFileSummary`

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
  "nodeType": "file",
  "label": "tasks.service.ts",
  "filePath": "apps/app-server/src/modules/task/task.service.ts",
  "riskLevel": "medium",
  "status": "discuss"
}
```

## Events

- `review.room_created`
- `review.analysis_requested`
- `review.analysis_completed`
- `review.node_state_changed`
- `review.comment_created`

## Agent Actions Consumed

- `review.analysis.generate`

## Boundaries

- Review creates and owns `changed_files` from `PullRequestChangedFileSummary`; it does not own GitHub PR source sync. Review derives `changed_functions` only from changed files with non-null `patch` or from a separate Review-owned analysis source.

- 은재는 PR 분석 결과를 소유한다.
- GitHub PR 원본 동기화는 주형이 소유한다.
- 은재는 GitHub API token이나 webhook을 직접 구현하지 않는다.
- 동현 Dashboard/Canvas는 `PRAnalysisSummary`만 표시한다.

## Mock Rule

주형의 PR sync가 없으면 `PullRequestSummary`와 `PullRequestChangedFileSummary` fixture로 리뷰 화면, changed file 저장 흐름, non-null `patch` 기반 changed function 저장 흐름, 분석 결과 UI를 구현한다. 실제 PR 원본 table을 은재 도메인에 만들지 않는다.
