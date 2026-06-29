import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { createRealtimeCorsOptions } from "./cors.config";

@WebSocketGateway({
  cors: createRealtimeCorsOptions(),
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
