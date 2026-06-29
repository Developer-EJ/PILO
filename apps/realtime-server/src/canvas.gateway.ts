import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import type { Socket } from "socket.io";
import {
  CANVAS_REALTIME_EVENTS,
  CANVAS_REALTIME_NAMESPACE,
  CanvasRealtimeAck,
  CanvasShapeMutationAck,
  createCanvasBoardRoomName,
  parseCanvasBoardRoomPayload,
  parseCanvasShapeMutationPayload,
} from "./canvas-realtime.contract";
import { CanvasRealtimeAccessGuard } from "./canvas-realtime-access.guard";
import { CanvasShapeStateStore } from "./canvas-shape-state.store";
import { createRealtimeCorsOptions } from "./cors.config";

@WebSocketGateway({
  namespace: CANVAS_REALTIME_NAMESPACE,
  cors: createRealtimeCorsOptions(),
})
export class CanvasGateway {
  constructor(
    private readonly accessGuard: CanvasRealtimeAccessGuard = new CanvasRealtimeAccessGuard(),
    private readonly shapeStateStore: CanvasShapeStateStore = new CanvasShapeStateStore(),
  ) {}

  @SubscribeMessage(CANVAS_REALTIME_EVENTS.boardJoin)
  async joinBoardRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<CanvasRealtimeAck> {
    const payload = parseCanvasBoardRoomPayload(body);

    if (!payload) {
      return createCanvasErrorAck(
        CANVAS_REALTIME_EVENTS.boardJoin,
        "invalid_payload",
        "Canvas board join payload must include boardId.",
      );
    }

    const access = this.accessGuard.requireBoardAccess(client, payload.boardId);

    if (!access.ok) {
      return createCanvasErrorAck(
        CANVAS_REALTIME_EVENTS.boardJoin,
        access.error,
        access.message,
      );
    }

    const room = createCanvasBoardRoomName(payload.boardId);
    await client.join(room);

    return {
      ok: true,
      event: CANVAS_REALTIME_EVENTS.boardJoin,
      room,
      currentMember: access.currentMember,
    };
  }

  @SubscribeMessage(CANVAS_REALTIME_EVENTS.boardLeave)
  async leaveBoardRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<CanvasRealtimeAck> {
    const payload = parseCanvasBoardRoomPayload(body);

    if (!payload) {
      return createCanvasErrorAck(
        CANVAS_REALTIME_EVENTS.boardLeave,
        "invalid_payload",
        "Canvas board leave payload must include boardId.",
      );
    }

    const access = this.accessGuard.requireBoardAccess(client, payload.boardId);

    if (!access.ok) {
      return createCanvasErrorAck(
        CANVAS_REALTIME_EVENTS.boardLeave,
        access.error,
        access.message,
      );
    }

    const room = createCanvasBoardRoomName(payload.boardId);
    await client.leave(room);

    return {
      ok: true,
      event: CANVAS_REALTIME_EVENTS.boardLeave,
      room,
      currentMember: access.currentMember,
    };
  }

  @SubscribeMessage(CANVAS_REALTIME_EVENTS.shapeChanged)
  async syncShapeMutation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<CanvasShapeMutationAck> {
    const payload = parseCanvasShapeMutationPayload(body);

    if (!payload) {
      return createCanvasShapeMutationErrorAck(
        "invalid_payload",
        "Canvas shape mutation payload is invalid.",
      );
    }

    const access = this.accessGuard.requireBoardAccess(
      client,
      payload.boardId,
      {
        minimumRole: "member",
      },
    );

    if (!access.ok) {
      return createCanvasShapeMutationErrorAck(access.error, access.message);
    }

    const result = this.shapeStateStore.applyShapeMutation(
      payload,
      access.currentMember.memberId,
    );

    if (!result.ok) {
      return {
        ok: false,
        event: CANVAS_REALTIME_EVENTS.shapeChanged,
        error: "conflict",
        message:
          "Canvas shape mutation baseVersion does not match server version.",
        currentVersion: result.currentVersion,
      };
    }

    const room = createCanvasBoardRoomName(payload.boardId);
    client.to(room).emit(CANVAS_REALTIME_EVENTS.shapeChanged, result.shape);

    return {
      ok: true,
      event: CANVAS_REALTIME_EVENTS.shapeChanged,
      room,
      currentMember: access.currentMember,
      shape: result.shape,
    };
  }
}

function createCanvasErrorAck(
  event: CanvasRealtimeAck["event"],
  error: Exclude<CanvasRealtimeAck, { ok: true }>["error"],
  message: string,
): CanvasRealtimeAck {
  return {
    ok: false,
    event,
    error,
    message,
  };
}

function createCanvasShapeMutationErrorAck(
  error: Exclude<CanvasRealtimeAck, { ok: true }>["error"],
  message: string,
): CanvasShapeMutationAck {
  return {
    ok: false,
    event: CANVAS_REALTIME_EVENTS.shapeChanged,
    error,
    message,
  };
}
