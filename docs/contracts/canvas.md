# Canvas Contract

## Owner

Donghyun

## Scope

Canvas visualizes project objects on a Miro/FigJam-like board. Canvas owns only
board layout, shapes, connections, positions, view settings, and filter settings.
It does not own or mutate the original business data from Task, Meeting,
GitHub, Review, Agent, or Common domains.

## Owned Tables

- `canvas_boards`
- `canvas_shapes`
- `canvas_connections`
- `canvas_node_positions`
- `canvas_view_settings`
- `canvas_filter_settings`

## Consumed Read Models

| Source owner | Read model                                                                   |
| ------------ | ---------------------------------------------------------------------------- |
| Joohyung     | `TaskSummary`, `GithubIssueSummary`, `PullRequestSummary`, `ProgressSummary` |
| Jinho        | `MeetingReportSummary`, `MeetingDecisionSummary`                             |
| Daeun        | `PRAnalysisSummary`, `ReviewRiskSummary`                                     |
| Yejin        | `AgentRecommendation`, `ProjectPlanDraftSummary`                             |
| Common       | `SharedFileRef`                                                              |

## Provided APIs

| Method   | Path                                      | Purpose                           |
| -------- | ----------------------------------------- | --------------------------------- |
| `GET`    | `/workspaces/:workspaceId/canvas-boards`  | List Canvas boards                |
| `POST`   | `/workspaces/:workspaceId/canvas-boards`  | Create Canvas board               |
| `GET`    | `/canvas-boards/:boardId`                 | Read board + shapes + connections |
| `POST`   | `/canvas-boards/:boardId/shapes`          | Create shape                      |
| `PATCH`  | `/canvas-shapes/:shapeId`                 | Update shape display attributes   |
| `PUT`    | `/canvas-shapes/:shapeId/position`        | Save shape position               |
| `DELETE` | `/canvas-shapes/:shapeId`                 | Delete shape                      |
| `POST`   | `/canvas-boards/:boardId/connections`     | Create shape connection           |
| `DELETE` | `/canvas-connections/:connectionId`       | Delete connection                 |
| `PUT`    | `/canvas-boards/:boardId/view-settings`   | Save zoom/viewport                |
| `PUT`    | `/canvas-boards/:boardId/filter-settings` | Save filters                      |

## Entity Types

`CanvasEntityType` is shared by `entityType` and `shapeType`.

- `task`
- `meeting_report`
- `pull_request`
- `github_issue`
- `document`
- `file`
- `code`
- `decision`
- `risk`

## Write DTOs

### CanvasShapeRequest

Creates a visual shape that points to another owner's read model. Canvas stores
layout/display fields only; it must not copy the owner domain object.

```json
{
  "shapeType": "task",
  "entityType": "task",
  "entityId": "uuid",
  "displayTitle": "OAuth callback",
  "width": 280,
  "height": 160,
  "color": "#6d5bd6"
}
```

- required: `shapeType`, `entityType`, `entityId`, `displayTitle`, `width`, `height`, `color`
- `shapeType` and `entityType` use `CanvasEntityType`.
- Initial position is saved separately through the position API. If no position exists yet, readers return `{ "x": 0, "y": 0 }`.

### CanvasConnectionRequest

Creates a relationship between two shapes in the same board.

```json
{
  "sourceShapeId": "uuid",
  "targetShapeId": "uuid",
  "connectionType": "created_from",
  "label": "Meeting to Task"
}
```

- required: `sourceShapeId`, `targetShapeId`, `connectionType`, `label`
- `label` is nullable. Use `null` when the connection should render without text.
- `sourceShapeId` and `targetShapeId` must point to different shapes in the same board.
- Duplicate connections are rejected by `boardId + sourceShapeId + targetShapeId + connectionType`.
- Deleting a connection soft-deletes it. A second delete for the same connection returns not found.
- The create API returns `CanvasConnectionSummary`; the delete API returns `{ "id": "uuid", "deleted": true }`.

### CanvasPositionRequest

Saves the latest position for a shape after drag.

```json
{
  "x": 120,
  "y": 140
}
```

- required: `x`, `y`
- Both coordinates must be finite numbers.
- Server policy: last write wins per `shapeId`; repeated requests update the same `canvas_node_positions` row.
- Client policy: drag interactions should debounce or batch position writes at 150-300ms intervals, then flush the final position on drag end.
- The API returns the updated `CanvasShapeSummary`.

### CanvasViewSettingRequest

```json
{
  "zoom": 1,
  "viewportX": 0,
  "viewportY": 0
}
```

- required: `zoom`, `viewportX`, `viewportY`
- default: `{ "zoom": 1, "viewportX": 0, "viewportY": 0 }`
- Settings are scoped by `boardId + memberId`.

### CanvasFilterSettingRequest

```json
{
  "enabledEntityTypes": ["task", "meeting_report", "pull_request"],
  "assigneeMemberId": null,
  "showDelayedOnly": false,
  "showRiskOnly": false,
  "filters": {}
}
```

- required: `enabledEntityTypes`, `assigneeMemberId`, `showDelayedOnly`, `showRiskOnly`, `filters`
- default: `{ "enabledEntityTypes": ["task", "meeting_report", "pull_request"], "assigneeMemberId": null, "showDelayedOnly": false, "showRiskOnly": false, "filters": {} }`
- `assigneeMemberId` is nullable and refers to `workspace_members.member_id`.
- `filters` is an extension object for non-breaking filter additions.

## Read Models

### CanvasBoardSummary

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "title": "Project Map",
  "boardType": "project_map",
  "shapeCount": 2,
  "connectionCount": 1,
  "updatedAt": "2026-06-28T00:00:00.000Z"
}
```

### CanvasBoardDetail

```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "title": "Project Map",
  "boardType": "project_map",
  "shapeCount": 2,
  "connectionCount": 1,
  "updatedAt": "2026-06-28T00:00:00.000Z",
  "shapes": [
    {
      "id": "uuid",
      "shapeType": "task",
      "entityType": "task",
      "entityId": "uuid",
      "displayTitle": "OAuth callback",
      "width": 280,
      "height": 160,
      "color": "#6d5bd6",
      "isCollapsed": false,
      "zIndex": 1,
      "position": {
        "x": 120,
        "y": 140
      }
    }
  ],
  "connections": [
    {
      "id": "uuid",
      "sourceShapeId": "uuid",
      "targetShapeId": "uuid",
      "connectionType": "implemented_by",
      "label": "Task to PR"
    }
  ],
  "viewSetting": {
    "zoom": 1,
    "viewportX": 0,
    "viewportY": 0
  },
  "filterSetting": {
    "enabledEntityTypes": ["task", "meeting_report", "pull_request"],
    "assigneeMemberId": null,
    "showDelayedOnly": false,
    "showRiskOnly": false,
    "filters": {}
  }
}
```

- `CanvasBoardDetail` extends `CanvasBoardSummary` with `shapes`, `connections`, `viewSetting`, and `filterSetting`.
- `shapeCount` and `connectionCount` count non-deleted rows only.
- `viewSetting` and `filterSetting` are member-scoped. If no row exists, the defaults above are returned.

## Boundaries

- Only Donghyun's Canvas domain writes Canvas DB tables.
- Other domains provide only entity ids and summary read models for Canvas display.
- `entityType/entityId` points to the actual owner domain data.
- Canvas must not change Task status, run PR analysis, create meeting reports, execute Agent workflows, or write to another owner domain.

## Mock Rule

If another owner domain is not ready yet, Canvas can use mock shapes with only
`entityType`, `entityId`, and `displayTitle`. The PR must clearly mark the mock
usage and link a real integration issue.
