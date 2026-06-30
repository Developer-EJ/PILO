# Canvas Contract

## Owner

동현

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
| 주형         | `TaskSummary`, `GithubIssueSummary`, `PullRequestSummary`, `ProgressSummary` |
| 진호         | `MeetingReportSummary`, `MeetingReportCanvasEntityRef`                       |
| 은재         | `PRAnalysisSummary`, `ReviewRiskSummary`                                     |
| 세인         | `AgentRecommendation`, `ProjectPlanDraftSummary`                             |
| Common       | `SharedFileRef`                                                              |

## Current Runtime APIs

The Canvas controller is exposed through the app-server global prefix as `/api/...`.

| Method   | Path                                      | Purpose                           |
| -------- | ----------------------------------------- | --------------------------------- |
| `GET`    | `/api/workspaces/:workspaceId/canvas-boards`  | List Canvas boards                |
| `POST`   | `/api/workspaces/:workspaceId/canvas-boards`  | Create Canvas board               |
| `GET`    | `/api/canvas-boards/:boardId`                 | Read board + shapes + connections |
| `POST`   | `/api/canvas-boards/:boardId/shapes`          | Create shape                      |
| `PATCH`  | `/api/canvas-shapes/:shapeId`                 | Update shape display attributes   |
| `PUT`    | `/api/canvas-shapes/:shapeId/position`        | Save shape position               |
| `DELETE` | `/api/canvas-shapes/:shapeId`                 | Delete shape                      |
| `POST`   | `/api/canvas-boards/:boardId/connections`     | Create shape connection           |
| `DELETE` | `/api/canvas-connections/:connectionId`       | Delete connection                 |
| `PUT`    | `/api/canvas-boards/:boardId/view-settings`   | Save zoom/viewport                |
| `PUT`    | `/api/canvas-boards/:boardId/filter-settings` | Save filters                      |

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

## Terminology Policy

Current runtime and public schema use `shapes` and `connections`:

- DB tables: `canvas_shapes`, `canvas_connections`
- HTTP paths: `/api/canvas-boards/:boardId/shapes`,
  `/api/canvas-boards/:boardId/connections`, `/api/canvas-shapes/:shapeId`,
  `/api/canvas-connections/:connectionId`
- Read model fields: `CanvasBoardDetail.shapes`, `CanvasBoardDetail.connections`

`nodes` and `edges` are deprecated for the workspace Canvas contract. They may
appear in old target docs or in 은재 Review's internal review graph/canvas, but
they must not be used for 동현 Canvas runtime routes, fixtures, or schema fields.

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

### Enum / Freeform Storage Policy

Current app-server parsing treats `connectionType` as a non-empty string and
`filterSetting.filters` as a freeform extension object. The SQL baseline still
contains a candidate enum check for `canvas_connections.connection_type`.
This PR does not change runtime validation or DB constraints. A follow-up
contract/spec PR must decide one policy before new connection types are added:

- strict enum in schema, app-server validation, and SQL; or
- freeform string in schema/runtime with SQL relaxed accordingly.

Until that follow-up lands, producers should use the documented examples
(`related_to`, `created_from`, `blocks`, `references`, `implements`, `reviews`)
and must not rely on new freeform values being portable.

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

Saves the current member's viewport state for a board.

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
- The update API returns the saved `CanvasViewSetting`.

### CanvasFilterSettingRequest

Saves the current member's board filter state.

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
- Settings are scoped by `boardId + memberId`.
- The update API returns the saved `CanvasFilterSetting`.

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
      "connectionType": "implements",
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
- `boardType` uses `project_map`, `meeting`, `review`, or `custom`.
- `connectionType` uses `related_to`, `created_from`, `blocks`, `references`, `implements`, or `reviews`.
- `shapeCount` and `connectionCount` count non-deleted rows only.
- `viewSetting` and `filterSetting` are member-scoped. If no row exists, the defaults above are returned.

## Realtime Event Contract

Canvas realtime events use the Socket.IO namespace `/canvas`.

### Room Events

| Event                | Direction        | Purpose                         |
| -------------------- | ---------------- | ------------------------------- |
| `canvas:board:join`  | client -> server | Join a board room by `boardId`  |
| `canvas:board:leave` | client -> server | Leave a board room by `boardId` |

Room payload:

```json
{
  "boardId": "uuid"
}
```

Room name format is `canvas:board:{boardId}`.

The realtime auth connection point expects `session`, `currentMember`, and a
board access adapter result in the Socket.IO handshake auth. The default local
adapter reads `canvasBoards` from the handshake; production can replace that
adapter with DB/app-server lookup without changing the event payload.

```json
{
  "auth": {
    "session": {
      "authenticated": true,
      "userId": "uuid",
      "expiresAt": "2026-06-28T12:00:00.000Z"
    },
    "currentMember": {
      "workspaceId": "uuid",
      "memberId": "uuid",
      "userId": "uuid",
      "role": "member",
      "displayName": "동현"
    },
    "canvasBoards": [
      {
        "boardId": "uuid",
        "workspaceId": "uuid"
      }
    ]
  }
}
```

Room join/leave is rejected when:

- `session` or `currentMember` is missing or malformed.
- `session.userId` and `currentMember.userId` do not match.
- `session.expiresAt` is expired.
- `boardId` has no board access context.
- the board's `workspaceId` differs from `currentMember.workspaceId`.

### Broadcast Payloads

Shape event payload:

```json
{
  "boardId": "uuid",
  "shapeId": "uuid",
  "baseVersion": 0,
  "x": 120,
  "y": 140,
  "width": 280,
  "height": 160
}
```

- Event: `canvas:shape:changed`
- Direction: client -> server, server -> room broadcast
- `baseVersion` is the last server accepted shape version known by the client.
- `x` and `y` are required finite numbers.
- `width` and `height` are nullable. Use `null` for move-only updates.
- Server policy: the realtime server accepts the mutation only when
  `baseVersion` matches the current server version for `boardId + shapeId`.
  Accepted mutations increment `version` by 1 and broadcast the final state.
- Conflict policy: stale `baseVersion` is rejected with `error = "conflict"`
  and `currentVersion`. The client should refresh from the latest board
  snapshot or retry against the returned version.

View event payload:

```json
{
  "boardId": "uuid",
  "zoom": 1,
  "viewportX": 0,
  "viewportY": 0
}
```

Presence event payload:

```json
{
  "boardId": "uuid",
  "cursorX": 120,
  "cursorY": 140,
  "tool": "select"
}
```

- `tool`: `select`, `hand`, `shape`, `text`, `connector`, `unknown`

## Boundaries

- 동현 Canvas domain만 Canvas DB tables를 write한다.
- Other domains provide only entity ids and summary read models for Canvas display.
- `entityType/entityId` points to the actual owner domain data.
- Canvas must not change Task status, run PR analysis, create meeting reports, execute Agent workflows, or write to another owner domain.

## Mock Rule

If another owner domain is not ready yet, Canvas can use mock shapes with only
`entityType`, `entityId`, and `displayTitle`. The PR must clearly mark the mock
usage and link a real integration issue.
