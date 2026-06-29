import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { VoiceRoomStatusChangedEvent } from "./voice-events.contract";

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN === "*" ? true : process.env.CORS_ORIGIN,
    credentials: true,
  },
})
export class VoiceGateway {
  @SubscribeMessage("voice.room.status_changed")
  handleRoomStatusChanged(@MessageBody() event: VoiceRoomStatusChangedEvent) {
    return {
      event: "voice.room.status_changed",
      data: event,
    };
  }
}
