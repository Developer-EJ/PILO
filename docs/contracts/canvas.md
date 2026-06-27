# Canvas Contract

## Owner

동현

## Scope

Canvas는 프로젝트 객체를 시각적으로 배치하고 관계를 표시한다. 실제 업무 데이터는 소유하지 않는다.

## Owned Tables

- `canvas_boards`
- `canvas_shapes`
- `canvas_connections`
- `canvas_node_positions`
- `canvas_view_settings`
- `canvas_filter_settings`

## Consumed Read Models

| Source owner | Read model |
|---|---|
| 주형 | `TaskSummary`, `GithubIssueSummary`, `PullRequestSummary`, `ProgressSummary` |
| 진호 | `MeetingReportSummary`, `MeetingDecisionSummary` |
| 은재 | `PRAnalysisSummary`, `ReviewRiskSummary` |
| 세인 | `AgentRecommendation`, `ProjectPlanDraftSummary` |
| Common | `SharedFileRef` |

## Provided APIs

| Method | Path | 목적 |
|---|---|---|
| `GET` | `/workspaces/:workspaceId/canvas-boards` | Canvas board 목록 |
| `POST` | `/workspaces/:workspaceId/canvas-boards` | Canvas board 생성 |
| `GET` | `/canvas-boards/:boardId` | board + shapes + connections 조회 |
| `POST` | `/canvas-boards/:boardId/shapes` | shape 생성 |
| `PATCH` | `/canvas-shapes/:shapeId` | shape 표시 속성 수정 |
| `PUT` | `/canvas-shapes/:shapeId/position` | shape 위치 저장 |
| `DELETE` | `/canvas-shapes/:shapeId` | shape 제거 |
| `POST` | `/canvas-boards/:boardId/connections` | shape 연결 생성 |
| `DELETE` | `/canvas-connections/:connectionId` | 연결 제거 |
| `PUT` | `/canvas-boards/:boardId/view-settings` | zoom/viewport 저장 |
| `PUT` | `/canvas-boards/:boardId/filter-settings` | filter 저장 |

## Write DTOs

### CanvasShapeRequest

```json
{
  "shapeType": "task",
  "entityType": "task",
  "entityId": "uuid",
  "displayTitle": "OAuth callback 구현",
  "width": 280,
  "height": 160,
  "color": "#6d5bd6"
}
```

### CanvasConnectionRequest

```json
{
  "sourceShapeId": "uuid",
  "targetShapeId": "uuid",
  "connectionType": "created_from",
  "label": "회의록에서 생성"
}
```

## Read Models

### CanvasBoardDetail

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "title": "Project Map",
  "shapes": [],
  "connections": [],
  "viewSetting": {
    "zoom": 1,
    "viewportX": 0,
    "viewportY": 0
  },
  "filterSetting": {
    "enabledEntityTypes": ["task", "meeting_report", "pull_request"],
    "showDelayedOnly": false,
    "showRiskOnly": false
  }
}
```

## Boundaries

- 동현만 Canvas DB를 수정한다.
- 다른 도메인은 Canvas에 표시할 entity id와 summary read model만 제공한다.
- `entityType/entityId`의 실제 존재 여부는 owner API 또는 contract test에서 검증한다.
- Canvas에서 Task 상태 변경, PR 분석 실행, 회의록 생성 같은 업무 write를 수행하지 않는다.

## Mock Rule

외부 도메인이 미구현이면 `entityType`, `entityId`, `displayTitle`만 가진 mock shape로 UI를 구현한다. mock 사용 PR에는 후속 real integration Issue를 연결한다.

