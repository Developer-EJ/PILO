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

| Method  | Path                                                 | 목적                                 |
| ------- | ---------------------------------------------------- | ------------------------------------ |
| `POST`  | `/pull-requests/:pullRequestId/review-room`          | 리뷰룸 생성                          |
| `GET`   | `/code-review-rooms/:roomId`                         | 리뷰룸 상세                          |
| `POST`  | `/pull-requests/:pullRequestId/analysis`             | PR 분석 요청                         |
| `GET`   | `/pull-requests/:pullRequestId/analysis`             | PR 분석 결과 조회                    |
| `GET`   | `/pull-requests/:pullRequestId/analysis-summary`     | Dashboard/Canvas용 PR 분석 요약 조회 |
| `GET`   | `/pull-request-analyses/:analysisId/canvas`          | AI 리뷰 캔버스 조회                  |
| `GET`   | `/review-nodes/:nodeId/detail`                       | 노드별 diff와 상세 분석 조회         |
| `PATCH` | `/review-nodes/:nodeId/state`                        | 노드별 리뷰 상태 저장                |
| `POST`  | `/code-review-rooms/:roomId/comments`                | 리뷰 코멘트 작성                     |
| `POST`  | `/pull-request-analyses/:analysisId/checklist-items` | 체크리스트 항목 생성                 |

## Read Models

### CodeReviewRoomSummary

리뷰룸은 주형이 제공하는 `PullRequestSummary`를 참조한다. 성공 응답에서는 `pullRequest`가 항상 포함되어야 하며, 은재 도메인은 GitHub PR 원본 table을 별도로 만들지 않는다.

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "pullRequestId": "uuid",
  "status": "open",
  "createdByMemberId": "uuid",
  "createdAt": "2026-06-27T10:00:00.000Z",
  "updatedAt": "2026-06-27T10:00:00.000Z",
  "pullRequest": {
    "id": "uuid",
    "repositoryId": "uuid",
    "number": 7,
    "title": "Add OAuth callback shell",
    "authorLogin": "Developer-EJ",
    "state": "review_requested",
    "branch": "feature/donghyun/auth-login",
    "baseBranch": "dev",
    "url": "https://github.com/example/pilo/pull/7",
    "changedFilesCount": 4,
    "additions": 180,
    "deletions": 12,
    "linkedTaskIds": [],
    "syncedAt": "2026-06-27T10:00:00.000Z"
  }
}
```

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

### ReviewCanvasSummary

Code review 탭에서 PR을 선택하면 AI가 PR의 의도와 리뷰 순서를 판단하고, 변경 파일을 캔버스 노드로 배치한다. 왼쪽은 사용자가 메모나 추가 코드를 붙일 수 있는 캔버스이고, 오른쪽은 PR의 전체 의도를 간략히 설명한다.

```json
{
  "id": "uuid",
  "analysisId": "uuid",
  "pullRequestId": "uuid",
  "intentSummary": "로그인 callback 진입점을 만들고 provider error 상태를 사용자에게 보여준다.",
  "reviewStrategy": "라우트 진입점, callback 상태 해석, redirect 영향 순서로 확인한다.",
  "nodes": [
    {
      "id": "uuid",
      "analysisId": "uuid",
      "nodeType": "file",
      "label": "apps/frontend/app/auth/callback/page.tsx",
      "filePath": "apps/frontend/app/auth/callback/page.tsx",
      "functionName": null,
      "riskLevel": "medium",
      "status": "discuss",
      "reviewOrder": 1,
      "roleSummary": "OAuth callback query를 읽어 결과 화면으로 연결한다.",
      "reviewReason": "로그인 실패와 redirect 처리가 사용자 흐름에 직접 영향을 준다.",
      "position": { "x": 120, "y": 96 }
    }
  ],
  "edges": [
    {
      "id": "uuid",
      "sourceNodeId": "uuid",
      "targetNodeId": "uuid",
      "label": "callback result"
    }
  ]
}
```

### ReviewNodeDetail

노드를 누르면 이전 코드와 변경 코드를 좌우 diff로 보여주고, 오른쪽 패널에 이 노드의 역할, PR에서 수정한 이유, 작은 기능 단위의 실제 수정 부분을 제공한다. 각 수정 항목의 `newStartLine`은 `[코드 보기]` 이동과 하이라이트 기준이다.

```json
{
  "id": "uuid",
  "analysisId": "uuid",
  "nodeId": "uuid",
  "filePath": "apps/frontend/app/auth/callback/page.tsx",
  "roleSummary": "OAuth callback 화면에서 provider와 error query를 읽는다.",
  "modificationReason": "기존 placeholder만으로는 로그인 성공/실패 맥락을 설명할 수 없었다.",
  "changeGroups": [
    {
      "id": "uuid",
      "title": "callback query 해석",
      "summary": "provider와 error query parameter를 결과 컴포넌트로 넘긴다.",
      "newStartLine": 12,
      "newEndLine": 18
    }
  ],
  "diffHunks": [
    {
      "id": "uuid",
      "oldStartLine": 10,
      "newStartLine": 12,
      "oldCode": "return <div>Loading...</div>;",
      "newCode": "const provider = searchParams.get('provider');",
      "highlightLines": [12]
    }
  ]
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

- `PRAnalysisSummary`는 PR list와 Canvas가 원본 review DB를 읽지 않기 위한 public read model이다.
- 내부 DB row가 null을 반환해도 `riskLevel = low`, `analysisStatus = pending`, count 필드는 `0`을 기본값으로 보장한다.
- `ReviewCanvasSummary`는 AI가 판단한 리뷰 순서, 노드 위험도, 캔버스 좌표를 포함한다.
- `ReviewNodeDetail`은 diff와 설명 패널을 위한 read model이며 merge 기능은 MVP 범위에 포함하지 않는다.
- `ReviewRiskSummary`는 PR list/Canvas가 위험 PR을 표시하기 위한 read model이며 review risk 원본 수정 API가 아니다.

## Events

- `review.room_created`
- `review.analysis_requested`
- `review.analysis_completed`
- `review.node_state_changed`
- `review.comment_created`

### review.room_created

```json
{
  "eventType": "review.room_created",
  "roomId": "uuid",
  "pullRequestId": "uuid",
  "workspaceId": "uuid",
  "createdByMemberId": "uuid",
  "occurredAt": "2026-06-27T10:00:00.000Z"
}
```

## Agent Actions Consumed

- `review.analysis.generate`

## Boundaries

- 은재는 PR 분석 결과를 소유한다.
- GitHub PR 원본 동기화는 주형이 소유한다.
- 은재는 GitHub API token이나 webhook을 직접 구현하지 않는다.
- 동현 Dashboard/Canvas는 `PRAnalysisSummary`, `ReviewRiskSummary`만 표시한다. 은재의 code review room 내부 캔버스는 `ReviewCanvasSummary`를 사용한다.

## Mock Rule

주형의 PR sync가 없으면 `PullRequestSummary` fixture로 리뷰 화면과 분석 결과 UI를 구현한다. 실제 PR 원본 table을 은재 도메인에 만들지 않는다.
