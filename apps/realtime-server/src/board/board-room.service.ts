import { createBoardRoomName } from "../socket/board/board-room-names";
import type {
  BoardAccessContext,
  BoardAccessService,
} from "./board-access.service";
import type { BoardJoinedPayload, BoardJoinPayload } from "./board-types";

export type BoardRoomJoinResult =
  | {
      joined: false;
      reason: "forbidden";
    }
  | {
      joined: true;
      payload: BoardJoinedPayload;
      roomName: string;
    };

export type BoardRoomService = {
  joinBoardRoom: (
    context: BoardAccessContext,
    payload: BoardJoinPayload,
  ) => Promise<BoardRoomJoinResult>;
};

export function createBoardRoomService({
  accessService,
}: {
  accessService: BoardAccessService;
}): BoardRoomService {
  return {
    async joinBoardRoom(context, payload) {
      const canJoin = await accessService.canJoinBoard(context, payload);

      if (!canJoin) {
        return { joined: false, reason: "forbidden" };
      }

      return {
        joined: true,
        payload: {
          boardId: payload.boardId,
          workspaceId: payload.workspaceId,
        },
        roomName: createBoardRoomName(payload),
      };
    },
  };
}
