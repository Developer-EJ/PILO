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
} from "./canvas-realtime.contract";
import { CanvasRealtimeAccessGuard } from "./canvas-realtime-access.guard";

@WebSocketGateway({
  namespace: CANVAS_REALTIME_NAMESPACE,
  cors: {
    origin: process.env.CORS_ORIGIN === "*" ? true : process.env.CORS_ORIGIN,
    credentials: true,
  },
})
export class CanvasGateway {
  constructor(
    private readonly accessGuard: CanvasRealtimeAccessGuard = new CanvasRealtimeAccessGuard(),
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
