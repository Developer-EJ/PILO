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
  createCanvasBoardRoomName,
  parseCanvasBoardRoomPayload,
  parseCanvasRealtimeAuthContext,
} from "./canvas-realtime.contract";

@WebSocketGateway({
  namespace: CANVAS_REALTIME_NAMESPACE,
  cors: {
    origin: process.env.CORS_ORIGIN === "*" ? true : process.env.CORS_ORIGIN,
    credentials: true,
  },
})
export class CanvasGateway {
  @SubscribeMessage(CANVAS_REALTIME_EVENTS.boardJoin)
  async joinBoardRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<CanvasRealtimeAck> {
    const currentMember = this.resolveCurrentMember(client);
    const payload = parseCanvasBoardRoomPayload(body);

    if (!currentMember) {
      return createCanvasErrorAck(
        CANVAS_REALTIME_EVENTS.boardJoin,
        "auth_required",
        "Canvas realtime currentMember context is required.",
      );
    }

    if (!payload) {
      return createCanvasErrorAck(
        CANVAS_REALTIME_EVENTS.boardJoin,
        "invalid_payload",
        "Canvas board join payload must include boardId.",
      );
    }

    const room = createCanvasBoardRoomName(payload.boardId);
    await client.join(room);

    return {
      ok: true,
      event: CANVAS_REALTIME_EVENTS.boardJoin,
      room,
      currentMember,
    };
  }

  @SubscribeMessage(CANVAS_REALTIME_EVENTS.boardLeave)
  async leaveBoardRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<CanvasRealtimeAck> {
    const currentMember = this.resolveCurrentMember(client);
    const payload = parseCanvasBoardRoomPayload(body);

    if (!currentMember) {
      return createCanvasErrorAck(
        CANVAS_REALTIME_EVENTS.boardLeave,
        "auth_required",
        "Canvas realtime currentMember context is required.",
      );
    }

    if (!payload) {
      return createCanvasErrorAck(
        CANVAS_REALTIME_EVENTS.boardLeave,
        "invalid_payload",
        "Canvas board leave payload must include boardId.",
      );
    }

    const room = createCanvasBoardRoomName(payload.boardId);
    await client.leave(room);

    return {
      ok: true,
      event: CANVAS_REALTIME_EVENTS.boardLeave,
      room,
      currentMember,
    };
  }

  private resolveCurrentMember(client: Socket) {
    return parseCanvasRealtimeAuthContext(client.handshake.auth?.currentMember);
  }
}

function createCanvasErrorAck(
  event: CanvasRealtimeAck["event"],
  error: "auth_required" | "invalid_payload",
  message: string,
): CanvasRealtimeAck {
  return {
    ok: false,
    event,
    error,
    message,
  };
}
