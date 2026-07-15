import { createCanvasRoomName } from "../socket/room-names";
import type {
  CanvasLoadedViewportBounds,
  CanvasRoomLoadedRegion,
  CanvasRoomRef,
} from "./canvas-types";

const MAX_ROOM_LOADED_REGIONS = 64;
const MAX_ROOM_CACHED_SHAPES = 2_000;

type CachedRoomShape = {
  cachedAt: string;
  shape: Record<string, unknown>;
};

export type CanvasRoomStateService = {
  getCachedShapes: (room: CanvasRoomRef) => Record<string, unknown>[];
  getLoadedRegions: (room: CanvasRoomRef) => CanvasRoomLoadedRegion[];
  recordLoadedViewport: (
    room: CanvasRoomRef,
    bounds: CanvasLoadedViewportBounds,
    shapes?: Record<string, unknown>[],
  ) => CanvasRoomLoadedRegion[];
};

function isCoveringRegion(
  region: CanvasRoomLoadedRegion,
  bounds: CanvasLoadedViewportBounds,
) {
  const left = bounds.x - bounds.margin;
  const top = bounds.y - bounds.margin;
  const right = bounds.x + bounds.width + bounds.margin;
  const bottom = bounds.y + bounds.height + bounds.margin;

  return (
    region.left <= left &&
    region.top <= top &&
    region.right >= right &&
    region.bottom >= bottom
  );
}

function createLoadedRegion(
  room: CanvasRoomRef,
  bounds: CanvasLoadedViewportBounds,
): CanvasRoomLoadedRegion {
  const left = bounds.x - bounds.margin;
  const top = bounds.y - bounds.margin;
  const right = bounds.x + bounds.width + bounds.margin;
  const bottom = bounds.y + bounds.height + bounds.margin;

  return {
    bottom,
    id: `${room.workspaceId}:${room.canvasId}:${Math.round(left)}:${Math.round(top)}:${Math.round(right)}:${Math.round(bottom)}`,
    left,
    loadedAt: new Date().toISOString(),
    right,
    top,
  };
}

export function createCanvasRoomStateService(): CanvasRoomStateService {
  const loadedRegionsByRoom = new Map<string, CanvasRoomLoadedRegion[]>();
  const shapesByRoom = new Map<string, Map<string, CachedRoomShape>>();

  function getRoomShapeCache(roomName: string) {
    let shapeCache = shapesByRoom.get(roomName);

    if (!shapeCache) {
      shapeCache = new Map<string, CachedRoomShape>();
      shapesByRoom.set(roomName, shapeCache);
    }

    return shapeCache;
  }

  function upsertRoomShapes(roomName: string, shapes: Record<string, unknown>[]) {
    if (!shapes.length) return;

    const shapeCache = getRoomShapeCache(roomName);
    const cachedAt = new Date().toISOString();

    shapes.forEach((shape) => {
      const shapeId = typeof shape.id === "string" ? shape.id.trim() : "";

      if (!shapeId) return;
      shapeCache.set(shapeId, { cachedAt, shape });
    });

    if (shapeCache.size <= MAX_ROOM_CACHED_SHAPES) return;

    const staleShapeIds = Array.from(shapeCache.entries())
      .sort(([, left], [, right]) => left.cachedAt.localeCompare(right.cachedAt))
      .slice(0, shapeCache.size - MAX_ROOM_CACHED_SHAPES)
      .map(([shapeId]) => shapeId);

    staleShapeIds.forEach((shapeId) => {
      shapeCache.delete(shapeId);
    });
  }

  return {
    getCachedShapes(room) {
      const shapeCache = shapesByRoom.get(createCanvasRoomName(room));

      return shapeCache ? Array.from(shapeCache.values(), ({ shape }) => shape) : [];
    },

    getLoadedRegions(room) {
      return loadedRegionsByRoom.get(createCanvasRoomName(room)) ?? [];
    },

    recordLoadedViewport(room, bounds, shapes = []) {
      const roomName = createCanvasRoomName(room);
      const currentRegions = loadedRegionsByRoom.get(roomName) ?? [];

      upsertRoomShapes(roomName, shapes);

      if (currentRegions.some((region) => isCoveringRegion(region, bounds))) {
        return currentRegions;
      }

      const nextRegions = [...currentRegions, createLoadedRegion(room, bounds)]
        .sort((left, right) => left.loadedAt.localeCompare(right.loadedAt))
        .slice(-MAX_ROOM_LOADED_REGIONS);

      loadedRegionsByRoom.set(roomName, nextRegions);
      return nextRegions;
    },
  };
}
