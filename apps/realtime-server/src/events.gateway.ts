import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN === "*" ? true : process.env.CORS_ORIGIN,
    credentials: true,
  },
})
export class EventsGateway {
  @SubscribeMessage("ping")
  ping(@MessageBody() body: unknown) {
    return {
      event: "pong",
      data: body ?? { ok: true },
    };
  }
}
