import { createCanvasRoomName } from "../socket/room-names";
import type {
  CanvasAccessContext,
  CanvasAccessService,
} from "./canvas-access.service";
import type { CanvasJoinedPayload, CanvasJoinPayload } from "./canvas-types";
import type { CanvasPresenceService } from "./canvas-presence.service";
import type { CanvasShapeLockService } from "./canvas-shape-lock.service";
import type { CanvasShapePreviewService } from "./canvas-shape-preview.service";

export type CanvasRoomJoinResult =
  | {
      joined: false;
      reason: "forbidden";
    }
  | {
      joined: true;
      payload: CanvasJoinedPayload;
      roomName: string;
    };

export type CanvasRoomService = {
  joinCanvasRoom: (
    context: CanvasAccessContext,
    payload: CanvasJoinPayload,
  ) => Promise<CanvasRoomJoinResult>;
};

export function createCanvasRoomService({
  accessService,
  presenceService,
  shapeLockService,
  shapePreviewService,
}: {
  accessService: CanvasAccessService;
  presenceService: CanvasPresenceService;
  shapeLockService: CanvasShapeLockService;
  shapePreviewService: CanvasShapePreviewService;
}): CanvasRoomService {
  return {
    async joinCanvasRoom(context, payload) {
      const canJoin = await accessService.canJoinCanvas(context, payload);

      if (!canJoin) {
        return { joined: false, reason: "forbidden" };
      }

      const latestOpSeq = 0;

      return {
        joined: true,
        payload: {
          canvasId: payload.canvasId,
          latestOpSeq,
          previews: await shapePreviewService.getRoomPreviews(payload),
          presence: presenceService.getPresence(payload),
          shapeLocks: await shapeLockService.getRoomLocks(payload),
          syncRequired: (payload.lastSeenOpSeq ?? 0) < latestOpSeq,
          workspaceId: payload.workspaceId,
        },
        roomName: createCanvasRoomName(payload),
      };
    },
  };
}
