import type {
  PiloCanvasFreeformShape,
  PiloCanvasViewportBounds,
} from "../canvas-engine-types";
import { DEFAULT_VIEWPORT_SHAPE_LOAD_MARGIN } from "./canvas-runtime-utils";

export type LoadedViewportShapeBounds = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export const MAX_LOADED_VIEWPORT_BOUNDS = 24;

export function shouldLoadFrameChildren(
  shape: PiloCanvasFreeformShape,
): shape is PiloCanvasFreeformShape & { id: string; type: "frame" } {
  return shape.type === "frame" && typeof shape.id === "string";
}

export function isPersistedShapeRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readPersistedRevision(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

export function readPersistedContentHash(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

export function createViewportShapeLoadBounds(
  bounds: PiloCanvasViewportBounds,
): LoadedViewportShapeBounds {
  return {
    bottom: bounds.y + bounds.height + DEFAULT_VIEWPORT_SHAPE_LOAD_MARGIN,
    left: bounds.x - DEFAULT_VIEWPORT_SHAPE_LOAD_MARGIN,
    right: bounds.x + bounds.width + DEFAULT_VIEWPORT_SHAPE_LOAD_MARGIN,
    top: bounds.y - DEFAULT_VIEWPORT_SHAPE_LOAD_MARGIN,
  };
}

export function doesLoadedViewportCoverBounds(
  loadedBounds: LoadedViewportShapeBounds,
  viewportBounds: PiloCanvasViewportBounds,
) {
  return (
    loadedBounds.left <= viewportBounds.x &&
    loadedBounds.top <= viewportBounds.y &&
    loadedBounds.right >= viewportBounds.x + viewportBounds.width &&
    loadedBounds.bottom >= viewportBounds.y + viewportBounds.height
  );
}
