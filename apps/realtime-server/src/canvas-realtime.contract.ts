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
  role: "owner" | "member" | "viewer";
  displayName: string | null;
};

export type CanvasRealtimeSessionContext = {
  authenticated: true;
  userId: string;
  expiresAt: string | null;
};

export type CanvasRealtimeBoardAccessContext = {
  boardId: string;
  workspaceId: string;
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

export type CanvasShapeMutationPayload = {
  boardId: string;
  shapeId: string;
  baseVersion: number;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
};

export type CanvasShapeServerState = CanvasShapeMutationPayload & {
  version: number;
  updatedByMemberId: string;
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
      error:
        | "auth_required"
        | "auth_expired"
        | "conflict"
        | "invalid_payload"
        | "board_not_found"
        | "forbidden";
      message: string;
    };

export type CanvasShapeMutationAck =
  | {
      ok: true;
      event: typeof CANVAS_REALTIME_EVENTS.shapeChanged;
      room: string;
      currentMember: CanvasRealtimeAuthContext;
      shape: CanvasShapeServerState;
    }
  | {
      ok: false;
      event: typeof CANVAS_REALTIME_EVENTS.shapeChanged;
      error: Exclude<CanvasRealtimeAck, { ok: true }>["error"];
      message: string;
      currentVersion?: number;
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

export function parseCanvasShapeMutationPayload(
  payload: unknown,
): CanvasShapeMutationPayload | null {
  const record = asRecord(payload);
  const boardId = parseNonEmptyString(record?.boardId);
  const shapeId = parseNonEmptyString(record?.shapeId);
  const baseVersion = parseNonNegativeInteger(record?.baseVersion);
  const x = parseFiniteNumber(record?.x);
  const y = parseFiniteNumber(record?.y);
  const width = parseOptionalPositiveNumber(record?.width);
  const height = parseOptionalPositiveNumber(record?.height);

  if (
    !boardId ||
    !shapeId ||
    baseVersion === null ||
    x === null ||
    y === null ||
    width === undefined ||
    height === undefined
  ) {
    return null;
  }

  return {
    boardId,
    shapeId,
    baseVersion,
    x,
    y,
    width,
    height,
  };
}

export function parseCanvasRealtimeAuthContext(
  value: unknown,
): CanvasRealtimeAuthContext | null {
  const record = asRecord(value);
  const workspaceId = parseNonEmptyString(record?.workspaceId);
  const memberId = parseNonEmptyString(record?.memberId);
  const userId = parseNonEmptyString(record?.userId);
  const role = parseWorkspaceMemberRole(record?.role);

  if (!workspaceId || !memberId || !userId || !role) {
    return null;
  }

  return {
    workspaceId,
    memberId,
    userId,
    role,
    displayName:
      typeof record?.displayName === "string" ? record.displayName : null,
  };
}

export function parseCanvasRealtimeSessionContext(
  value: unknown,
): CanvasRealtimeSessionContext | null {
  const record = asRecord(value);
  const userId = parseNonEmptyString(record?.userId);
  const expiresAt = parseOptionalString(record?.expiresAt);

  if (record?.authenticated !== true || !userId || expiresAt === undefined) {
    return null;
  }

  return {
    authenticated: true,
    userId,
    expiresAt,
  };
}

export function parseCanvasRealtimeBoardAccessContext(
  value: unknown,
): CanvasRealtimeBoardAccessContext | null {
  const record = asRecord(value);
  const boardId = parseNonEmptyString(record?.boardId);
  const workspaceId = parseNonEmptyString(record?.workspaceId);

  return boardId && workspaceId ? { boardId, workspaceId } : null;
}

export function parseCanvasRealtimeBoardAccessList(
  value: unknown,
): CanvasRealtimeBoardAccessContext[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const access = parseCanvasRealtimeBoardAccessContext(item);

    return access ? [access] : [];
  });
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

function parseOptionalString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  return parseNonEmptyString(value) ?? undefined;
}

function parseFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parsePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function parseNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function parseOptionalPositiveNumber(
  value: unknown,
): number | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = parseFiniteNumber(value);

  if (parsed === null || parsed <= 0) {
    return undefined;
  }

  return parsed;
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

function parseWorkspaceMemberRole(value: unknown) {
  if (value === "owner" || value === "member" || value === "viewer") {
    return value;
  }

  return null;
}
