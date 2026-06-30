import {
  buildWorkspaceApiUrl,
  defaultWorkspaceApiBaseUrl,
  WorkspaceApiError,
} from "./workspaceClient.mjs";
import {
  CANVAS_FREEFORM_SHAPES_STORAGE_SCOPE,
  deleteCanvasStorage,
  ensureCanvasMemoVisibleFilterSetting,
  normalizeCanvasFreeformShapes,
  readCanvasStorage,
  writeCanvasStorage,
} from "./canvasStorage.mjs";
import { workspaceCanvasBoardHref } from "./currentWorkspace.mjs";
import { workspaceDashboardFixture } from "./workspaceDashboardFixture.mjs";

const DEFAULT_CANVAS_MODE = "mock";
const defaultCanvasBoardId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const mockBoardListStorageScope = "mock-board-list";
const mockAiMemoShapesStorageScope = "mock-ai-memo-shapes";
const mockDeletedBoardIdsStorageScope = "mock-deleted-board-ids";
const canvasBoardLocalStorageScopes = [
  "shape-state",
  "filter-setting",
  "view-setting",
  CANVAS_FREEFORM_SHAPES_STORAGE_SCOPE,
];
const memoShapeColor = "#f4c950";
const stickyNoteColors = new Set([
  "butter",
  "lemon",
  "peach",
  "coral",
  "pink",
  "magenta",
  "sky",
  "violet",
  "cyan",
  "blue",
  "mint",
  "green",
  "lime",
  "grass",
  "white",
  "black",
]);

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

export function buildCanvasApiUrl(
  path,
  baseUrl = defaultWorkspaceApiBaseUrl(),
) {
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
      body: entity.body,
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
    title: "프로젝트 맵",
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
      enabledEntityTypes: ["task", "meeting_report", "pull_request", "memo"],
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

function defaultCanvasFilterSetting() {
  return {
    enabledEntityTypes: ["task", "meeting_report", "pull_request", "memo"],
    assigneeMemberId: null,
    showDelayedOnly: false,
    showRiskOnly: false,
    filters: {},
  };
}

function defaultCanvasViewSetting() {
  return {
    zoom: 1,
    viewportX: 0,
    viewportY: 0,
  };
}

function readMockBoards(workspaceId) {
  const boards = readCanvasStorage(mockBoardListStorageScope, workspaceId);

  return Array.isArray(boards) ? boards.filter(isRecord) : [];
}

function writeMockBoards(workspaceId, boards) {
  writeCanvasStorage(mockBoardListStorageScope, workspaceId, boards);
}

function upsertMockBoard(workspaceId, board) {
  const boards = readMockBoards(workspaceId);
  const nextBoards = [board, ...boards.filter((item) => item.id !== board.id)];

  writeMockBoards(workspaceId, nextBoards);
}

function readMockAiMemoShapes(boardId) {
  const shapes = readCanvasStorage(mockAiMemoShapesStorageScope, boardId);

  return Array.isArray(shapes) ? shapes.filter(isRecord) : [];
}

function writeMockAiMemoShapes(boardId, shapes) {
  return writeCanvasStorage(mockAiMemoShapesStorageScope, boardId, shapes);
}

function upsertMockAiMemoShape(boardId, shape) {
  const shapes = readMockAiMemoShapes(boardId);
  const nextShapes = [shape, ...shapes.filter((item) => item.id !== shape.id)];

  return writeMockAiMemoShapes(boardId, nextShapes);
}

function mergeMockAiMemoShapes(board) {
  if (!board?.id || !Array.isArray(board.shapes)) return board;

  const memoShapes = readMockAiMemoShapes(board.id);
  if (!memoShapes.length) return board;

  const existingShapeIds = new Set(board.shapes.map((shape) => shape.id));
  const nextMemoShapes = memoShapes.filter(
    (shape) => shape.id && !existingShapeIds.has(shape.id),
  );

  if (!nextMemoShapes.length) return board;

  return {
    ...board,
    shapes: [...board.shapes, ...nextMemoShapes],
    shapeCount: board.shapes.length + nextMemoShapes.length,
    filterSetting: ensureCanvasMemoVisibleFilterSetting(
      board.filterSetting,
      board.filterSetting,
    ),
  };
}

function persistMemoVisibleFilterSetting(board) {
  if (!board?.id || !board?.filterSetting) return;

  const storedFilterSetting = readCanvasStorage("filter-setting", board.id);
  const nextFilterSetting = ensureCanvasMemoVisibleFilterSetting(
    storedFilterSetting,
    board.filterSetting,
  );

  writeCanvasStorage("filter-setting", board.id, nextFilterSetting);
  deleteCanvasStorage("view-setting", board.id);
}

function readMockDeletedBoardIds(workspaceId) {
  const boardIds = readCanvasStorage(mockDeletedBoardIdsStorageScope, workspaceId);

  return Array.isArray(boardIds)
    ? boardIds.filter((boardId) => typeof boardId === "string")
    : [];
}

function writeMockDeletedBoardIds(workspaceId, boardIds) {
  writeCanvasStorage(mockDeletedBoardIdsStorageScope, workspaceId, boardIds);
}

export function clearCanvasBoardLocalStorage(boardId) {
  for (const scope of canvasBoardLocalStorageScopes) {
    deleteCanvasStorage(scope, boardId);
  }
  deleteCanvasStorage(mockAiMemoShapesStorageScope, boardId);
}

function createMockBlankBoard(workspaceId, title) {
  const now = new Date().toISOString();

  return {
    id: `local-canvas-board-${Date.now()}`,
    workspaceId,
    title: title?.trim() || "제목 없는 캔버스",
    boardType: "custom",
    shapeCount: 0,
    connectionCount: 0,
    updatedAt: now,
    shapes: [],
    connections: [],
    viewSetting: defaultCanvasViewSetting(),
    filterSetting: defaultCanvasFilterSetting(),
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

function createMemoId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `local-canvas-memo-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function normalizeMemoText(value) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : "AI가 만든 메모";
}

function normalizeMemoTitle(value, text) {
  const source = typeof value === "string" && value.trim() ? value.trim() : text;

  return source.length > 80 ? `${source.slice(0, 77)}...` : source;
}

function normalizeMemoPosition(value, fallback) {
  return isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
    ? { x: value.x, y: value.y }
    : fallback;
}

function normalizeStickyNoteColor(value) {
  return typeof value === "string" && stickyNoteColors.has(value)
    ? value
    : "butter";
}

function createCanvasFreeformShapeId(seed) {
  const safeSeed = String(seed ?? createMemoId())
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 72);

  return `shape:pilo-sticky-ai-${safeSeed || Date.now()}`;
}

function buildCanvasMemoFreeformShape(memoShapeBody, shape) {
  const width = 156;
  const height = 148;

  return {
    id: createCanvasFreeformShapeId(shape?.id ?? memoShapeBody.entityId),
    type: "pilo-sticky-note",
    x: memoShapeBody.position.x - width / 2,
    y: memoShapeBody.position.y - height / 2,
    props: {
      w: width,
      h: height,
      color: normalizeStickyNoteColor(memoShapeBody.color),
      text: memoShapeBody.body,
    },
  };
}

function upsertCanvasMemoFreeformShape(boardId, freeformShape) {
  const currentShapes = normalizeCanvasFreeformShapes(
    readCanvasStorage(CANVAS_FREEFORM_SHAPES_STORAGE_SCOPE, boardId),
  );
  const nextShapes = [
    ...currentShapes.filter((shape) => shape.id !== freeformShape.id),
    freeformShape,
  ];

  writeCanvasStorage(
    CANVAS_FREEFORM_SHAPES_STORAGE_SCOPE,
    boardId,
    nextShapes,
  );

  return freeformShape;
}

function buildCanvasMemoShapeBody(input, board) {
  const text = normalizeMemoText(input.text ?? input.body ?? input.content);
  const title = normalizeMemoTitle(input.title ?? input.displayTitle, text);
  const createdAt =
    typeof input.createdAt === "string" && input.createdAt.trim()
      ? input.createdAt
      : new Date().toISOString();
  const position = normalizeMemoPosition(input.position, {
    x: 180 + (board.shapes.length % 4) * 84,
    y: 180 + (board.shapes.length % 5) * 62,
  });

  return {
    shapeType: "memo",
    entityType: "memo",
    entityId: input.memoId ?? input.entityId ?? createMemoId(),
    displayTitle: title,
    body: text,
    width: typeof input.width === "number" ? input.width : 288,
    height: typeof input.height === "number" ? input.height : 164,
    color:
      typeof input.color === "string" && input.color.trim()
        ? input.color
        : memoShapeColor,
    position,
    createdAt,
    authorId:
      typeof input.authorId === "string" && input.authorId.trim()
        ? input.authorId
        : null,
    authorName:
      typeof input.authorName === "string" && input.authorName.trim()
        ? input.authorName
        : null,
    createdByMemberId:
      typeof input.createdByMemberId === "string" &&
      input.createdByMemberId.trim()
        ? input.createdByMemberId
        : typeof input.authorId === "string" && input.authorId.trim()
          ? input.authorId
          : null,
  };
}

async function resolveTargetCanvasBoard(client, workspaceId, boardId) {
  const boards = await client.listBoards(workspaceId);
  const targetBoard =
    (boardId ? boards.find((board) => board.id === boardId) : null) ??
    boards.find((board) => board.boardType === "project_map") ??
    boards[0] ??
    (await client.createBoard(workspaceId, {
      title: "프로젝트 맵",
      boardType: "project_map",
    }));

  return client.getBoardDetail(targetBoard.id, { workspaceId });
}

export function createCanvasApiClient({
  baseUrl = defaultWorkspaceApiBaseUrl(),
  fetcher = fetch,
} = {}) {
  const requestOptions = { baseUrl, fetcher };

  return {
    async listBoards(workspaceId) {
      const path = `/api/workspaces/${encodeURIComponent(workspaceId)}/canvas-boards`;
      const boards = await requestCanvasJson(path, undefined, requestOptions);

      return Array.isArray(boards) ? boards : [];
    },

    async createBoard(workspaceId, body) {
      return requestCanvasJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/canvas-boards`,
        withJsonBody(body, { method: "POST" }),
        requestOptions,
      );
    },

    async deleteBoard(boardId) {
      return requestCanvasJson(
        `/api/canvas-boards/${encodeURIComponent(boardId)}`,
        { method: "DELETE" },
        requestOptions,
      );
    },

    async getBoardDetail(boardId, { workspaceId } = {}) {
      const path = `/api/canvas-boards/${encodeURIComponent(boardId)}`;
      const board = await requestCanvasJson(path, undefined, requestOptions);

      return normalizeCanvasBoardDetail(board, { workspaceId });
    },

    async createShape(boardId, body) {
      return requestCanvasJson(
        `/api/canvas-boards/${encodeURIComponent(boardId)}/shapes`,
        withJsonBody(body, { method: "POST" }),
        requestOptions,
      );
    },

    async updateShape(shapeId, body) {
      return requestCanvasJson(
        `/api/canvas-shapes/${encodeURIComponent(shapeId)}`,
        withJsonBody(body, { method: "PATCH" }),
        requestOptions,
      );
    },

    async deleteShape(shapeId) {
      return requestCanvasJson(
        `/api/canvas-shapes/${encodeURIComponent(shapeId)}`,
        { method: "DELETE" },
        requestOptions,
      );
    },

    async updateShapePosition(shapeId, body) {
      return requestCanvasJson(
        `/api/canvas-shapes/${encodeURIComponent(shapeId)}/position`,
        withJsonBody(body, { method: "PUT" }),
        requestOptions,
      );
    },

    async createConnection(boardId, body) {
      return requestCanvasJson(
        `/api/canvas-boards/${encodeURIComponent(boardId)}/connections`,
        withJsonBody(body, { method: "POST" }),
        requestOptions,
      );
    },

    async deleteConnection(connectionId) {
      return requestCanvasJson(
        `/api/canvas-connections/${encodeURIComponent(connectionId)}`,
        { method: "DELETE" },
        requestOptions,
      );
    },

    async updateViewSetting(boardId, body) {
      return requestCanvasJson(
        `/api/canvas-boards/${encodeURIComponent(boardId)}/view-settings`,
        withJsonBody(body, { method: "PUT" }),
        requestOptions,
      );
    },

    async updateFilterSetting(boardId, body) {
      return requestCanvasJson(
        `/api/canvas-boards/${encodeURIComponent(boardId)}/filter-settings`,
        withJsonBody(body, { method: "PUT" }),
        requestOptions,
      );
    },
  };
}

/**
 * @param {object} input
 * @param {string} input.workspaceId
 * @param {string | null} [input.boardId]
 * @param {string} input.text
 * @param {string} [input.title]
 * @param {{ x: number, y: number } | null} [input.position]
 * @param {string} [input.authorId]
 * @param {string} [input.authorName]
 * @param {string} [input.createdAt]
 * @param {string} [input.color]
 * @param {object} [options]
 * @param {ReturnType<typeof createCanvasClient>} [options.client]
 */
export async function createCanvasMemo(
  {
    workspaceId,
    boardId = null,
    text,
    title,
    position,
    authorId,
    authorName,
    createdAt,
    color,
  },
  { client = createCanvasClient() } = {},
) {
  const board = await resolveTargetCanvasBoard(client, workspaceId, boardId);
  const memoShapeBody = buildCanvasMemoShapeBody(
    {
      text,
      title,
      position,
      authorId,
      authorName,
      createdAt,
      color,
    },
    board,
  );
  const createdShape = await client.createShape(
    board.id,
    {
      shapeType: memoShapeBody.shapeType,
      entityType: memoShapeBody.entityType,
      entityId: memoShapeBody.entityId,
      displayTitle: memoShapeBody.displayTitle,
      width: memoShapeBody.width,
      height: memoShapeBody.height,
      color: memoShapeBody.color,
      body: memoShapeBody.body,
      position: memoShapeBody.position,
      createdAt: memoShapeBody.createdAt,
      authorId: memoShapeBody.authorId,
      authorName: memoShapeBody.authorName,
      createdByMemberId: memoShapeBody.createdByMemberId,
    },
    { workspaceId },
  );
  const positionedShape = await client.updateShapePosition(
    createdShape.id,
    memoShapeBody.position,
    { workspaceId },
  );
  const shape = {
    ...createdShape,
    ...positionedShape,
    ...memoShapeBody,
    id: positionedShape?.id ?? createdShape.id,
    position: positionedShape?.position ?? memoShapeBody.position,
  };
  const freeformShape = upsertCanvasMemoFreeformShape(
    board.id,
    buildCanvasMemoFreeformShape(memoShapeBody, shape),
  );

  return {
    workspaceId,
    boardId: board.id,
    boardTitle: board.title,
    shape,
    freeformShape,
    href: workspaceCanvasBoardHref(workspaceId, board.id),
  };
}

export function createMockCanvasClient() {
  return {
    async listBoards(workspaceId) {
      const deletedBoardIds = new Set(readMockDeletedBoardIds(workspaceId));
      const storedBoards = readMockBoards(workspaceId);
      const generatedDefaultBoard = createMockCanvasBoardDetail(workspaceId);
      const storedDefaultBoard = storedBoards.find(
        (board) => board.id === generatedDefaultBoard.id,
      );
      const defaultBoard = mergeMockAiMemoShapes(
        storedDefaultBoard ?? generatedDefaultBoard,
      );
      const defaultBoards = deletedBoardIds.has(defaultBoard.id)
        ? []
        : [toBoardSummary(defaultBoard)];

      return [
        ...defaultBoards,
        ...storedBoards
          .filter((board) => board.id !== defaultBoard.id)
          .filter((board) => !deletedBoardIds.has(board.id))
          .map(mergeMockAiMemoShapes)
          .map(toBoardSummary),
      ];
    },

    async createBoard(workspaceId, body = {}) {
      const boards = readMockBoards(workspaceId);
      const board = createMockBlankBoard(workspaceId, body.title);

      writeMockBoards(workspaceId, [board, ...boards]);

      return toBoardSummary(board);
    },

    async deleteBoard(boardId, { workspaceId } = {}) {
      const deletedBoardIds = new Set(readMockDeletedBoardIds(workspaceId));
      const boards = readMockBoards(workspaceId);
      const defaultBoard = createMockCanvasBoardDetail(workspaceId);
      const nextBoards = boards.filter((board) => board.id !== boardId);
      const boardExists =
        boardId === defaultBoard.id || nextBoards.length !== boards.length;

      if (!boardExists) {
        throw new CanvasApiError("Canvas board not found", {
          status: 404,
          path: `/api/canvas-boards/${boardId}`,
        });
      }

      deletedBoardIds.add(boardId);
      writeMockBoards(workspaceId, nextBoards);
      writeMockDeletedBoardIds(workspaceId, Array.from(deletedBoardIds));
      clearCanvasBoardLocalStorage(boardId);

      return {
        id: boardId,
        deleted: true,
      };
    },

    async getBoardDetail(boardId, { workspaceId } = {}) {
      const defaultBoard = createMockCanvasBoardDetail(workspaceId);
      const deletedBoardIds = new Set(readMockDeletedBoardIds(workspaceId));

      if (boardId && deletedBoardIds.has(boardId)) {
        throw new CanvasApiError("Canvas board not found", {
          status: 404,
          path: `/api/canvas-boards/${boardId}`,
        });
      }

      const storedBoard = readMockBoards(workspaceId).find(
        (board) => board.id === boardId,
      );

      if (storedBoard) {
        return mergeMockAiMemoShapes(
          normalizeCanvasBoardDetail(storedBoard, { workspaceId }),
        );
      }

      if (!boardId || boardId === defaultBoard.id) {
        return mergeMockAiMemoShapes(defaultBoard);
      }

      return {
        ...createMockBlankBoard(workspaceId, "제목 없는 캔버스"),
        id: boardId,
      };
    },

    async createShape(boardId, body, { workspaceId } = {}) {
      const resolvedWorkspaceId = workspaceId ?? body?.workspaceId;
      const board = await this.getBoardDetail(boardId, {
        workspaceId: resolvedWorkspaceId,
      });
      const now = new Date().toISOString();
      const shape = {
        id: `local-canvas-shape-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        isCollapsed: false,
        zIndex: board.shapes.length + 1,
        position: normalizeMemoPosition(body?.position, {
          x: 160 + (board.shapes.length % 4) * 72,
          y: 180 + (board.shapes.length % 5) * 54,
        }),
        createdAt: body?.createdAt ?? now,
        updatedAt: now,
        ...body,
      };
      const nextBoard = {
        ...board,
        shapes: [...board.shapes, shape],
        shapeCount: board.shapes.length + 1,
        updatedAt: now,
        filterSetting:
          shape.entityType === "memo"
            ? ensureCanvasMemoVisibleFilterSetting(
                board.filterSetting,
                board.filterSetting,
              )
            : {
                ...board.filterSetting,
                enabledEntityTypes: Array.from(
                  new Set([
                    ...board.filterSetting.enabledEntityTypes,
                    shape.entityType,
                  ]),
                ),
              },
      };

      upsertMockBoard(nextBoard.workspaceId, nextBoard);
      if (shape.entityType === "memo") {
        upsertMockAiMemoShape(nextBoard.id, shape);
        persistMemoVisibleFilterSetting(nextBoard);
      }

      return shape;
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

    async updateShapePosition(shapeId, body, { workspaceId } = {}) {
      const workspaceIds = workspaceId
        ? [workspaceId]
        : [
            workspaceDashboardFixture.workspace.id,
            ...readMockBoards(workspaceDashboardFixture.workspace.id).map(
              (board) => board.workspaceId,
            ),
          ];

      for (const workspaceId of new Set(workspaceIds)) {
        const boards = readMockBoards(workspaceId);
        const board = boards.find((candidate) =>
          candidate.shapes?.some((shape) => shape.id === shapeId),
        );

        if (!board) continue;

        const nextBoard = {
          ...board,
          shapes: board.shapes.map((shape) =>
            shape.id === shapeId ? { ...shape, position: body } : shape,
          ),
          updatedAt: new Date().toISOString(),
        };

        upsertMockBoard(workspaceId, nextBoard);
        const memoShapes = readMockAiMemoShapes(board.id);
        if (memoShapes.some((shape) => shape.id === shapeId)) {
          writeMockAiMemoShapes(
            board.id,
            memoShapes.map((shape) =>
              shape.id === shapeId ? { ...shape, position: body } : shape,
            ),
          );
        }
        break;
      }

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
