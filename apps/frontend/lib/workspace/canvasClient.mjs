import {
  buildWorkspaceApiUrl,
  defaultWorkspaceApiBaseUrl,
  WorkspaceApiError,
} from "./workspaceClient.mjs";
import { workspaceDashboardFixture } from "./workspaceDashboardFixture.mjs";

const DEFAULT_CANVAS_MODE = "mock";
const defaultCanvasBoardId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

const fallbackPositions = [
  { x: 120, y: 140 },
  { x: 520, y: 180 },
  { x: 340, y: 430 },
  { x: 760, y: 360 },
  { x: 660, y: 560 },
];

function defaultCanvasMode() {
  return (
    process.env.NEXT_PUBLIC_PILO_CANVAS_MODE ??
    process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE ??
    DEFAULT_CANVAS_MODE
  );
}

export function resolveCanvasClientMode(mode = defaultCanvasMode()) {
  return mode === "api" ? "api" : "mock";
}

export class CanvasApiError extends WorkspaceApiError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "CanvasApiError";
  }
}

export function buildCanvasApiUrl(path, baseUrl = defaultWorkspaceApiBaseUrl()) {
  return buildWorkspaceApiUrl(path, baseUrl);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readCanvasJson(response, path) {
  if (response.status === 204) {
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    throw new CanvasApiError("Canvas API returned invalid JSON", {
      status: response.status,
      path,
    });
  }
}

async function requestCanvasJson(path, init, { baseUrl, fetcher }) {
  const response = await fetcher(buildCanvasApiUrl(path, baseUrl), {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new CanvasApiError("Canvas API request failed", {
      status: response.status,
      path,
    });
  }

  return readCanvasJson(response, path);
}

function withJsonBody(body, init = {}) {
  return {
    ...init,
    body: JSON.stringify(body),
  };
}

export function createMockCanvasBoardDetail(
  workspaceId = workspaceDashboardFixture.workspace.id,
) {
  const shapes = workspaceDashboardFixture.canvasEntities
    .slice(0, 5)
    .map((entity, index) => ({
      id: `mock-canvas-shape-${index + 1}`,
      shapeType: entity.shapeType,
      entityType: entity.entityType,
      entityId: entity.entityId,
      displayTitle: entity.displayTitle,
      width: entity.entityType === "pull_request" ? 300 : 280,
      height: entity.entityType === "pull_request" ? 172 : 160,
      color: entity.entityType === "pull_request" ? "#2e9e5b" : "#6d5bd6",
      isCollapsed: false,
      zIndex: index + 1,
      position: fallbackPositions[index] ?? {
        x: 120 + index * 80,
        y: 140 + index * 64,
      },
    }));

  return {
    id: defaultCanvasBoardId,
    workspaceId,
    title: "Project Map",
    boardType: "project_map",
    shapeCount: shapes.length,
    connectionCount: Math.max(0, shapes.length - 1),
    updatedAt: "2026-06-28T00:00:00.000Z",
    shapes,
    connections: shapes.slice(1).map((shape, index) => ({
      id: `mock-canvas-connection-${index + 1}`,
      sourceShapeId: shapes[index].id,
      targetShapeId: shape.id,
      connectionType: "related_to",
      label: null,
    })),
    viewSetting: {
      zoom: 1,
      viewportX: 0,
      viewportY: 0,
    },
    filterSetting: {
      enabledEntityTypes: ["task", "meeting_report", "pull_request"],
      assigneeMemberId: null,
      showDelayedOnly: false,
      showRiskOnly: false,
      filters: {},
    },
  };
}

function toBoardSummary(board) {
  return {
    id: board.id,
    workspaceId: board.workspaceId,
    title: board.title,
    boardType: board.boardType,
    shapeCount: board.shapeCount,
    connectionCount: board.connectionCount,
    updatedAt: board.updatedAt,
  };
}

export function normalizeCanvasBoardDetail(rawBoard, { workspaceId } = {}) {
  if (!isRecord(rawBoard)) {
    return createMockCanvasBoardDetail(workspaceId);
  }

  const fallback = createMockCanvasBoardDetail(
    workspaceId ?? rawBoard.workspaceId,
  );

  return {
    ...fallback,
    ...rawBoard,
    workspaceId: rawBoard.workspaceId ?? fallback.workspaceId,
    shapes: Array.isArray(rawBoard.shapes) ? rawBoard.shapes : fallback.shapes,
    connections: Array.isArray(rawBoard.connections)
      ? rawBoard.connections
      : fallback.connections,
    viewSetting: isRecord(rawBoard.viewSetting)
      ? rawBoard.viewSetting
      : fallback.viewSetting,
    filterSetting: isRecord(rawBoard.filterSetting)
      ? rawBoard.filterSetting
      : fallback.filterSetting,
  };
}

export function createCanvasApiClient({
  baseUrl = defaultWorkspaceApiBaseUrl(),
  fetcher = fetch,
} = {}) {
  const requestOptions = { baseUrl, fetcher };

  return {
    async listBoards(workspaceId) {
      const path = `/workspaces/${encodeURIComponent(workspaceId)}/canvas-boards`;
      const boards = await requestCanvasJson(path, undefined, requestOptions);

      return Array.isArray(boards) ? boards : [];
    },

    async getBoardDetail(boardId, { workspaceId } = {}) {
      const path = `/canvas-boards/${encodeURIComponent(boardId)}`;
      const board = await requestCanvasJson(path, undefined, requestOptions);

      return normalizeCanvasBoardDetail(board, { workspaceId });
    },

    async createShape(boardId, body) {
      return requestCanvasJson(
        `/canvas-boards/${encodeURIComponent(boardId)}/shapes`,
        withJsonBody(body, { method: "POST" }),
        requestOptions,
      );
    },

    async updateShape(shapeId, body) {
      return requestCanvasJson(
        `/canvas-shapes/${encodeURIComponent(shapeId)}`,
        withJsonBody(body, { method: "PATCH" }),
        requestOptions,
      );
    },

    async deleteShape(shapeId) {
      return requestCanvasJson(
        `/canvas-shapes/${encodeURIComponent(shapeId)}`,
        { method: "DELETE" },
        requestOptions,
      );
    },

    async updateShapePosition(shapeId, body) {
      return requestCanvasJson(
        `/canvas-shapes/${encodeURIComponent(shapeId)}/position`,
        withJsonBody(body, { method: "PUT" }),
        requestOptions,
      );
    },

    async createConnection(boardId, body) {
      return requestCanvasJson(
        `/canvas-boards/${encodeURIComponent(boardId)}/connections`,
        withJsonBody(body, { method: "POST" }),
        requestOptions,
      );
    },

    async deleteConnection(connectionId) {
      return requestCanvasJson(
        `/canvas-connections/${encodeURIComponent(connectionId)}`,
        { method: "DELETE" },
        requestOptions,
      );
    },

    async updateViewSetting(boardId, body) {
      return requestCanvasJson(
        `/canvas-boards/${encodeURIComponent(boardId)}/view-settings`,
        withJsonBody(body, { method: "PUT" }),
        requestOptions,
      );
    },

    async updateFilterSetting(boardId, body) {
      return requestCanvasJson(
        `/canvas-boards/${encodeURIComponent(boardId)}/filter-settings`,
        withJsonBody(body, { method: "PUT" }),
        requestOptions,
      );
    },
  };
}

export function createMockCanvasClient() {
  return {
    async listBoards(workspaceId) {
      return [toBoardSummary(createMockCanvasBoardDetail(workspaceId))];
    },

    async getBoardDetail(_boardId, { workspaceId } = {}) {
      return createMockCanvasBoardDetail(workspaceId);
    },

    async createShape(_boardId, body) {
      return {
        id: "mock-canvas-shape-created",
        isCollapsed: false,
        zIndex: 1,
        position: { x: 0, y: 0 },
        ...body,
      };
    },

    async updateShape(shapeId, body) {
      return {
        id: shapeId,
        ...body,
      };
    },

    async deleteShape(shapeId) {
      return {
        id: shapeId,
        deleted: true,
      };
    },

    async updateShapePosition(shapeId, body) {
      return {
        id: shapeId,
        position: body,
      };
    },

    async createConnection(_boardId, body) {
      return {
        id: "mock-canvas-connection-created",
        ...body,
      };
    },

    async deleteConnection(connectionId) {
      return {
        id: connectionId,
        deleted: true,
      };
    },

    async updateViewSetting(_boardId, body) {
      return body;
    },

    async updateFilterSetting(_boardId, body) {
      return body;
    },
  };
}

export function createCanvasClient(options = {}) {
  const mode = resolveCanvasClientMode(options.mode);

  if (mode === "api") {
    return createCanvasApiClient(options);
  }

  return createMockCanvasClient();
}
