import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { CanvasShapeMovedEvent } from "./canvas-events.contract";

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN === "*" ? true : process.env.CORS_ORIGIN,
    credentials: true,
  },
})
export class CanvasGateway {
  @SubscribeMessage("canvas.shape.moved")
  handleShapeMoved(@MessageBody() event: CanvasShapeMovedEvent) {
    return {
      event: "canvas.shape.moved",
      data: event,
    };
  }
}
