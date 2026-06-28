export const CANVAS_REALTIME_NAMESPACE = "/canvas" as const;

export const CANVAS_REALTIME_EVENTS = {
  boardJoin: "canvas:board:join",
  boardLeave: "canvas:board:leave",
  shapeChanged: "canvas:shape:changed",
  viewChanged: "canvas:view:changed",
  presenceUpdate: "canvas:presence:update",
} as const;

export type CanvasRealtimeEventName =
  (typeof CANVAS_REALTIME_EVENTS)[keyof typeof CANVAS_REALTIME_EVENTS];

export type CanvasRealtimeAuthContext = {
  workspaceId: string;
  memberId: string;
  userId: string;
  displayName: string | null;
};

export type CanvasBoardRoomPayload = {
  boardId: string;
};

export type CanvasShapeEventPayload = {
  boardId: string;
  shapeId: string;
  revision: number;
  changeType: "created" | "updated" | "deleted" | "moved" | "resized";
};

export type CanvasViewEventPayload = {
  boardId: string;
  zoom: number;
  viewportX: number;
  viewportY: number;
};

export type CanvasPresenceEventPayload = {
  boardId: string;
  cursorX: number;
  cursorY: number;
  tool: "select" | "hand" | "shape" | "text" | "connector" | "unknown";
};

export type CanvasRealtimeAck =
  | {
      ok: true;
      event: CanvasRealtimeEventName;
      room: string;
      currentMember: CanvasRealtimeAuthContext;
    }
  | {
      ok: false;
      event: CanvasRealtimeEventName;
      error: "auth_required" | "invalid_payload";
      message: string;
    };

export function createCanvasBoardRoomName(boardId: string) {
  return `canvas:board:${boardId}`;
}

export function parseCanvasBoardRoomPayload(
  payload: unknown,
): CanvasBoardRoomPayload | null {
  const record = asRecord(payload);
  const boardId = parseNonEmptyString(record?.boardId);

  return boardId ? { boardId } : null;
}

export function parseCanvasShapeEventPayload(
  payload: unknown,
): CanvasShapeEventPayload | null {
  const record = asRecord(payload);
  const boardId = parseNonEmptyString(record?.boardId);
  const shapeId = parseNonEmptyString(record?.shapeId);
  const revision = parsePositiveInteger(record?.revision);
  const changeType = parseShapeChangeType(record?.changeType);

  if (!boardId || !shapeId || revision === null || !changeType) {
    return null;
  }

  return {
    boardId,
    shapeId,
    revision,
    changeType,
  };
}

export function parseCanvasViewEventPayload(
  payload: unknown,
): CanvasViewEventPayload | null {
  const record = asRecord(payload);
  const boardId = parseNonEmptyString(record?.boardId);
  const zoom = parseFiniteNumber(record?.zoom);
  const viewportX = parseFiniteNumber(record?.viewportX);
  const viewportY = parseFiniteNumber(record?.viewportY);

  if (!boardId || zoom === null || viewportX === null || viewportY === null) {
    return null;
  }

  return {
    boardId,
    zoom,
    viewportX,
    viewportY,
  };
}

export function parseCanvasPresenceEventPayload(
  payload: unknown,
): CanvasPresenceEventPayload | null {
  const record = asRecord(payload);
  const boardId = parseNonEmptyString(record?.boardId);
  const cursorX = parseFiniteNumber(record?.cursorX);
  const cursorY = parseFiniteNumber(record?.cursorY);
  const tool = parsePresenceTool(record?.tool);

  if (!boardId || cursorX === null || cursorY === null || !tool) {
    return null;
  }

  return {
    boardId,
    cursorX,
    cursorY,
    tool,
  };
}

export function parseCanvasRealtimeAuthContext(
  value: unknown,
): CanvasRealtimeAuthContext | null {
  const record = asRecord(value);
  const workspaceId = parseNonEmptyString(record?.workspaceId);
  const memberId = parseNonEmptyString(record?.memberId);
  const userId = parseNonEmptyString(record?.userId);

  if (!workspaceId || !memberId || !userId) {
    return null;
  }

  return {
    workspaceId,
    memberId,
    userId,
    displayName:
      typeof record?.displayName === "string" ? record.displayName : null,
  };
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parsePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function parseShapeChangeType(
  value: unknown,
): CanvasShapeEventPayload["changeType"] | null {
  if (
    value === "created" ||
    value === "updated" ||
    value === "deleted" ||
    value === "moved" ||
    value === "resized"
  ) {
    return value;
  }

  return null;
}

function parsePresenceTool(value: unknown) {
  if (
    value === "select" ||
    value === "hand" ||
    value === "shape" ||
    value === "text" ||
    value === "connector" ||
    value === "unknown"
  ) {
    return value;
  }

  return null;
}
