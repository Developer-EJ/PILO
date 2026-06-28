# 은재 Agent Brief: Code Review Room / PR Analysis

## Mission

은재는 GitHub PR 원본을 받아 리뷰어가 이해하기 쉽게 분석한다. PR 원본 연결은 주형이 소유하고, 은재는 PR 선택 이후의 분석 결과, AI review canvas, node detail diff, node review state, risks, checklist를 소유한다.

## Must Read

- `docs/contracts/review.md`
- `docs/contracts/github.md`
- `docs/contracts/task.md`
- `docs/contracts/agent-actions.md`
- `docs/db/db-schema-by-owner.md`

## Owned Data

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

## Suggested Paths

- Frontend: `apps/frontend/app/(workspace)/reviews`, `apps/frontend/components/review`
- App Server: `apps/app-server/src/modules/review`
- AI Worker: `apps/ai-worker/app/workflows/review`
- Public adapters: `apps/app-server/src/modules/review/public`

## Implement First

1. Review room create/open by pull request id.
2. PR analysis status lifecycle.
3. Changed files and changed functions storage.
4. AI가 판단한 리뷰 순서와 위험도 기반 Review canvas.
5. Node detail diff, 역할/수정 이유/작은 기능 단위 변경 설명.
6. Node review state per reviewer.
7. Review comments, questions, risks, checklist.
8. PR analysis summary for PR list, Dashboard, Canvas.

## Public APIs To Provide

- `POST /pull-requests/:pullRequestId/review-room` creates or returns room.
- `GET /code-review-rooms/:roomId` returns room detail.
- `POST /pull-requests/:pullRequestId/analysis` requests analysis workflow.
- `GET /pull-requests/:pullRequestId/analysis-summary` returns `PRAnalysisSummary`.
- `GET /pull-request-analyses/:analysisId/canvas` returns AI review order and canvas nodes.
- `GET /review-nodes/:nodeId/detail` returns side-by-side diff and node explanation.
- `PATCH /review-nodes/:nodeId/state` updates reviewer state.
- `POST /code-review-rooms/:roomId/comments` creates review comment.

## Provides To Others

- 동현: PR analysis summary, review-needed PR cards, risk summary.
- 주형: optional analysis status for PR list decoration.
- 세인: PR analysis workflow contract and result payload.

## Consumes From Others

- 주형: `PullRequestSummary`, `PullRequestChangedFileSummary`, Task-PR links.
- 동현: Workspace/member identity.
- 세인: Agent runtime for PR analysis.

## Mock Rule

주형의 GitHub PR sync가 없으면 `PullRequestSummary`와 `PullRequestChangedFileSummary` fixture로 review room과 changed file/function 저장 흐름을 먼저 검증한다. PR 본문에는 실제 GitHub diff 연동 Issue를 연결한다.

## Do Not Touch

- GitHub repository connection, webhook, issue/PR sync.
- Task CRUD or Task-PR mapping writes.
- 전체 프로젝트 Canvas layout. 은재는 code review room 내부 캔버스만 다룬다.
- Meeting report.
- Agent runtime 공통 action schema.

## Done

- PR 원본 id만 있으면 review room을 열 수 있다.
- 분석 중, 성공, 실패 상태가 화면과 API에 반영된다.
- review canvas는 PR 내부 분석용이며 전체 Canvas와 분리된다.
- 노드 색상은 리뷰 필요성/위험도에 따라 달라져야 한다.
- 노드 상세 화면은 diff, 역할, 수정 이유, 작은 변경 단위, `[코드 보기]` 이동 지점을 제공한다.
- Dashboard와 Canvas가 쓸 PR analysis summary를 제공한다.
- 주형이 제공한 PR 원본 데이터를 직접 변경하지 않는다.
