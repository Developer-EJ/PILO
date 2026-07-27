import type {
  CanvasPresenceEditingMode,
  CanvasPresencePoint,
  CanvasPresenceViewport,
  CanvasRemotePresenceState,
} from "@/shared/canvas-realtime/canvas-realtime-types";

export function parsePresenceTimestamp(updatedAt: string) {
  const time = new Date(updatedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPresencePoint(value: unknown): value is CanvasPresencePoint {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y)
  );
}

function isPresenceViewport(value: unknown): value is CanvasPresenceViewport {
  return (
    isRecord(value) &&
    typeof value.height === "number" &&
    typeof value.width === "number" &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.zoom === "number" &&
    Number.isFinite(value.height) &&
    Number.isFinite(value.width) &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.zoom)
  );
}

export function isPresenceEditingMode(
  value: unknown,
): value is CanvasPresenceEditingMode {
  return (
    value === "code" ||
    value === "draw" ||
    value === "hand" ||
    value === "move" ||
    value === "placement" ||
    value === "resize" ||
    value === "select" ||
    value === "text"
  );
}

export function normalizeRemotePresence(
  payload: unknown,
): CanvasRemotePresenceState | null {
  const source =
    isRecord(payload) && isRecord(payload.presence)
      ? payload.presence
      : payload;

  if (!isRecord(source)) {
    return null;
  }

  const nestedUser = isRecord(source.user) ? source.user : null;
  const userId =
    typeof source.userId === "string"
      ? source.userId
      : typeof nestedUser?.userId === "string"
        ? nestedUser.userId
        : "";
  const workspaceId =
    typeof source.workspaceId === "string"
      ? source.workspaceId
      : isRecord(payload) && typeof payload.workspaceId === "string"
        ? payload.workspaceId
        : "";
  const canvasId =
    typeof source.canvasId === "string"
      ? source.canvasId
      : isRecord(payload) && typeof payload.canvasId === "string"
        ? payload.canvasId
        : "";
  const selectedShapeIds = Array.isArray(source.selectedShapeIds)
    ? source.selectedShapeIds.filter((shapeId) => typeof shapeId === "string")
    : [];
  const editingShapeId =
    typeof source.editingShapeId === "string" && source.editingShapeId
      ? source.editingShapeId
      : null;
  const editingMode = isPresenceEditingMode(source.editingMode)
    ? source.editingMode
    : null;
  const cursor = source.cursor === null ? null : source.cursor;
  const updatedAt =
    typeof source.updatedAt === "string"
      ? source.updatedAt
      : new Date().toISOString();

  if (!userId || !workspaceId || !canvasId) {
    return null;
  }

  if (cursor !== null && !isPresencePoint(cursor)) {
    return null;
  }

  return {
    canvasId,
    cursor,
    displayName:
      typeof source.displayName === "string"
        ? source.displayName
        : typeof nestedUser?.displayName === "string"
          ? nestedUser.displayName
          : "PILO",
    editingMode,
    editingShapeId,
    selectedShapeIds,
    ...(typeof source.sentAt === "string" ? { sentAt: source.sentAt } : {}),
    updatedAt,
    userId,
    ...(isPresenceViewport(source.viewport) ? { viewport: source.viewport } : {}),
    workspaceId,
  };
}

export function normalizeRemotePresenceList(
  payloads: unknown,
): CanvasRemotePresenceState[] {
  if (!Array.isArray(payloads)) {
    return [];
  }

  return payloads.flatMap((payload) => {
    const normalizedPresence = normalizeRemotePresence(payload);

    return normalizedPresence ? [normalizedPresence] : [];
  });
}

export function filterOwnPresence(
  presence: CanvasRemotePresenceState[],
  currentUserId: string,
) {
  return presence.filter((entry) => entry.userId !== currentUserId);
}

export function upsertPresence(
  presence: CanvasRemotePresenceState[],
  nextPresence: CanvasRemotePresenceState,
) {
  const remainingPresence = presence.filter(
    (entry) => entry.userId !== nextPresence.userId,
  );

  return [...remainingPresence, nextPresence].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
}

function hasSameStringValues(
  previousValues: readonly string[],
  nextValues: readonly string[],
) {
  return (
    previousValues.length === nextValues.length &&
    previousValues.every((value, index) => value === nextValues[index])
  );
}

export function hasSameInteractionPresence(
  previousPresence: CanvasRemotePresenceState,
  nextPresence: CanvasRemotePresenceState,
) {
  return (
    previousPresence.displayName === nextPresence.displayName &&
    previousPresence.editingMode === nextPresence.editingMode &&
    previousPresence.editingShapeId === nextPresence.editingShapeId &&
    hasSameStringValues(
      previousPresence.selectedShapeIds,
      nextPresence.selectedShapeIds,
    )
  );
}

export function isSameCanvasRoom(
  payload: { canvasId: string; workspaceId: string },
  room: { canvasId: string; workspaceId: string },
) {
  return (
    payload.workspaceId === room.workspaceId && payload.canvasId === room.canvasId
  );
}
