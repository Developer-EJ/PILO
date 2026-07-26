import { hasCanvasFreeformShapeChanged } from "@/features/canvas/persistence/canvas-shape-sync";
import type {
  PiloCanvasFreeformShape,
  PiloCanvasViewportBounds,
} from "../canvas-engine-types";
import type { CanvasViewSetting } from "./canvas-runtime-types";

export const DEFAULT_VIEWPORT_SHAPE_LOAD_DEBOUNCE_MS = 700;
export const DEFAULT_VIEWPORT_SHAPE_LOAD_MARGIN = 320;
export const CANVAS_VIEWPORT_SHAPE_QUERY_GRID_SIZE = 1_000;
export const CANVAS_VIEWPORT_SHAPE_STALE_TIME_MS = 5_000;

export function clampZoom(value: number) {
  return Math.min(8, Math.max(0.12, Math.round(value * 100) / 100));
}

export function areViewSettingsEqual(
  current: CanvasViewSetting,
  next: CanvasViewSetting,
) {
  return (
    current.zoom === next.zoom &&
    current.viewportX === next.viewportX &&
    current.viewportY === next.viewportY
  );
}

export function getFreeformShapeId(shape: PiloCanvasFreeformShape) {
  return typeof shape.id === "string" ? shape.id : null;
}

export function buildFreeformShapeMap(shapes: PiloCanvasFreeformShape[]) {
  const shapeMap = new Map<string, PiloCanvasFreeformShape>();

  shapes.forEach((shape) => {
    const shapeId = getFreeformShapeId(shape);

    if (!shapeId) return;

    shapeMap.set(shapeId, shape);
  });

  return shapeMap;
}

export function readFreeformShapeMap(
  shapeMap: ReadonlyMap<string, PiloCanvasFreeformShape>,
) {
  return Array.from(shapeMap.values());
}

export function replaceFreeformShapeMap(
  shapeMap: Map<string, PiloCanvasFreeformShape>,
  shapes: PiloCanvasFreeformShape[],
) {
  shapeMap.clear();

  shapes.forEach((shape) => {
    const shapeId = getFreeformShapeId(shape);

    if (shapeId) {
      shapeMap.set(shapeId, shape);
    }
  });
}

export function getChangedFreeformShapeIds(
  currentShapes: PiloCanvasFreeformShape[],
  nextShapes: PiloCanvasFreeformShape[],
  candidateShapeIds?: Iterable<string>,
) {
  const currentShapeMap = buildFreeformShapeMap(currentShapes);
  const nextShapeMap = buildFreeformShapeMap(nextShapes);
  const changedShapeIds = new Set<string>();
  const candidates = candidateShapeIds
    ? Array.from(new Set(candidateShapeIds))
    : new Set([...currentShapeMap.keys(), ...nextShapeMap.keys()]);

  candidates.forEach((shapeId) => {
    const currentShape = currentShapeMap.get(shapeId);
    const nextShape = nextShapeMap.get(shapeId);

    if (!currentShape && !nextShape) return;
    if (!currentShape || !nextShape) {
      changedShapeIds.add(shapeId);
      return;
    }
    if (hasCanvasFreeformShapeChanged(currentShape, nextShape)) {
      changedShapeIds.add(shapeId);
    }
  });

  return changedShapeIds;
}

export function mergeFreeformShapesById(
  currentShapes: PiloCanvasFreeformShape[],
  nextShapes: PiloCanvasFreeformShape[],
) {
  const mergedShapeMap = new Map<string, PiloCanvasFreeformShape>();
  const orderedShapeIds: string[] = [];

  currentShapes.forEach((shape) => {
    const shapeId = getFreeformShapeId(shape);

    if (!shapeId) return;

    mergedShapeMap.set(shapeId, shape);
    orderedShapeIds.push(shapeId);
  });

  nextShapes.forEach((shape) => {
    const shapeId = getFreeformShapeId(shape);

    if (!shapeId) return;

    if (!mergedShapeMap.has(shapeId)) {
      orderedShapeIds.push(shapeId);
    }

    mergedShapeMap.set(shapeId, shape);
  });

  return orderedShapeIds
    .map((shapeId) => mergedShapeMap.get(shapeId))
    .filter((shape): shape is PiloCanvasFreeformShape => Boolean(shape));
}

export function mergeLocalFreeformShapeChanges({
  changedShapeIds,
  currentShapes,
  deletedShapeIds,
  snapshotShapes,
}: {
  changedShapeIds: Iterable<string>;
  currentShapes: PiloCanvasFreeformShape[];
  deletedShapeIds: Iterable<string>;
  snapshotShapes: PiloCanvasFreeformShape[];
}) {
  const changedShapeIdSet = new Set(changedShapeIds);
  const deletedShapeIdSet = new Set(deletedShapeIds);
  const currentShapeMap = buildFreeformShapeMap(currentShapes);
  const orderedShapeIds = currentShapes.flatMap((shape) => {
    const shapeId = getFreeformShapeId(shape);

    return shapeId ? [shapeId] : [];
  });

  deletedShapeIdSet.forEach((shapeId) => {
    currentShapeMap.delete(shapeId);
  });

  snapshotShapes.forEach((shape) => {
    const shapeId = getFreeformShapeId(shape);

    if (!shapeId || !changedShapeIdSet.has(shapeId)) return;

    if (!currentShapeMap.has(shapeId)) {
      orderedShapeIds.push(shapeId);
    }

    currentShapeMap.set(shapeId, shape);
  });

  return Array.from(new Set(orderedShapeIds))
    .map((shapeId) => currentShapeMap.get(shapeId))
    .filter((shape): shape is PiloCanvasFreeformShape => Boolean(shape));
}

export function buildViewportShapeQueryKey({
  boardId,
  bounds,
  workspaceId,
}: {
  boardId: string;
  bounds: PiloCanvasViewportBounds;
  workspaceId: string;
}) {
  const toGrid = (value: number) =>
    Math.floor(value / CANVAS_VIEWPORT_SHAPE_QUERY_GRID_SIZE);
  const zoomBucket = Math.round(bounds.zoom * 4) / 4;
  const queryLeft = bounds.x - DEFAULT_VIEWPORT_SHAPE_LOAD_MARGIN;
  const queryTop = bounds.y - DEFAULT_VIEWPORT_SHAPE_LOAD_MARGIN;
  const queryRight =
    bounds.x + bounds.width + DEFAULT_VIEWPORT_SHAPE_LOAD_MARGIN;
  const queryBottom =
    bounds.y + bounds.height + DEFAULT_VIEWPORT_SHAPE_LOAD_MARGIN;

  return [
    "canvas",
    workspaceId,
    boardId,
    "viewport-shapes",
    toGrid(queryLeft),
    toGrid(queryTop),
    toGrid(queryRight),
    toGrid(queryBottom),
    zoomBucket,
    DEFAULT_VIEWPORT_SHAPE_LOAD_MARGIN,
  ] as const;
}

export function buildFrameChildrenQueryKey({
  boardId,
  frameId,
  workspaceId,
}: {
  boardId: string;
  frameId: string;
  workspaceId: string;
}) {
  return ["canvas", workspaceId, boardId, "frame-children", frameId] as const;
}
