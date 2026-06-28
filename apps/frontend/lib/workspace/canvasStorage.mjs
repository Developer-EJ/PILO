export const CANVAS_FILTER_ENTITY_TYPES = [
  "task",
  "meeting_report",
  "pull_request",
  "github_issue",
  "document",
  "file",
  "code",
  "decision",
  "risk",
];

export function canvasStorageKey(boardId, scope) {
  return `pilo:canvas:${boardId}:${scope}`;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function readCanvasStorage(
  scope,
  boardId,
  storage = globalThis.localStorage,
) {
  try {
    const rawValue = storage?.getItem(canvasStorageKey(boardId, scope));

    return rawValue ? JSON.parse(rawValue) : null;
  } catch (error) {
    return null;
  }
}

export function writeCanvasStorage(
  scope,
  boardId,
  value,
  storage = globalThis.localStorage,
) {
  try {
    storage?.setItem(canvasStorageKey(boardId, scope), JSON.stringify(value));
  } catch (error) {
    return false;
  }

  return true;
}

export function normalizeCanvasShapeState(value) {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([shapeId, state]) => {
      if (!isRecord(state)) return [];

      const x = isFiniteNumber(state.x) ? state.x : null;
      const y = isFiniteNumber(state.y) ? state.y : null;
      const width = isFiniteNumber(state.width) ? state.width : null;
      const height = isFiniteNumber(state.height) ? state.height : null;

      if (x === null || y === null) return [];

      return [
        [
          shapeId,
          {
            x,
            y,
            ...(width === null ? {} : { width }),
            ...(height === null ? {} : { height }),
          },
        ],
      ];
    }),
  );
}

export function applyCanvasShapeState(shapes, shapeStateById) {
  return shapes.map((shape) => {
    const savedState = shapeStateById[shape.id];

    if (!savedState) return shape;

    return {
      ...shape,
      width: savedState.width ?? shape.width,
      height: savedState.height ?? shape.height,
      position: {
        x: savedState.x,
        y: savedState.y,
      },
    };
  });
}

export function normalizeCanvasFilterSetting(value, fallback) {
  const source = isRecord(value) ? value : {};
  const enabledEntityTypes = Array.isArray(source.enabledEntityTypes)
    ? source.enabledEntityTypes.filter((type) =>
        CANVAS_FILTER_ENTITY_TYPES.includes(type),
      )
    : fallback.enabledEntityTypes;

  return {
    ...fallback,
    ...source,
    enabledEntityTypes: enabledEntityTypes.length
      ? enabledEntityTypes
      : fallback.enabledEntityTypes,
    assigneeMemberId:
      typeof source.assigneeMemberId === "string"
        ? source.assigneeMemberId
        : null,
    showDelayedOnly: source.showDelayedOnly === true,
    showRiskOnly: source.showRiskOnly === true,
    filters: isRecord(source.filters) ? source.filters : {},
  };
}

export function matchesCanvasFilter(shape, filterSetting, dashboard) {
  if (!filterSetting.enabledEntityTypes.includes(shape.entityType)) {
    return false;
  }

  if (filterSetting.showDelayedOnly) {
    const linkedTask = dashboard.tasks.find(
      (task) => task.id === shape.entityId,
    );

    if (!linkedTask?.isDelayed) return false;
  }

  if (filterSetting.showRiskOnly) {
    if (shape.entityType === "risk") return true;

    if (shape.entityType === "meeting_report") {
      const linkedReport = dashboard.meetingReports.find(
        (report) => report.id === shape.entityId,
      );

      return Boolean(linkedReport?.riskCount);
    }

    if (shape.entityType === "pull_request") {
      return dashboard.prAnalyses.some(
        (analysis) =>
          analysis.pullRequestId === shape.entityId &&
          (analysis.riskCount > 0 || analysis.riskLevel === "high"),
      );
    }

    return false;
  }

  return true;
}

export function filterCanvasBoard(board, filterSetting, dashboard) {
  const shapes = board.shapes.filter((shape) =>
    matchesCanvasFilter(shape, filterSetting, dashboard),
  );
  const visibleShapeIds = new Set(shapes.map((shape) => shape.id));
  const connections = board.connections.filter(
    (connection) =>
      visibleShapeIds.has(connection.sourceShapeId) &&
      visibleShapeIds.has(connection.targetShapeId),
  );

  return {
    ...board,
    shapes,
    connections,
    shapeCount: shapes.length,
    connectionCount: connections.length,
    filterSetting,
  };
}
