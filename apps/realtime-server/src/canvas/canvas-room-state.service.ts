import { createCanvasRoomName } from "../socket/room-names";
import type {
  CanvasLoadedViewportBounds,
  CanvasRoomLoadedRegion,
  CanvasRoomRef,
} from "./canvas-types";

const MAX_ROOM_LOADED_REGIONS = 64;

export type CanvasRoomStateService = {
  getLoadedRegions: (room: CanvasRoomRef) => CanvasRoomLoadedRegion[];
  recordLoadedViewport: (
    room: CanvasRoomRef,
    bounds: CanvasLoadedViewportBounds,
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

  return {
    getLoadedRegions(room) {
      return loadedRegionsByRoom.get(createCanvasRoomName(room)) ?? [];
    },

    recordLoadedViewport(room, bounds) {
      const roomName = createCanvasRoomName(room);
      const currentRegions = loadedRegionsByRoom.get(roomName) ?? [];

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
