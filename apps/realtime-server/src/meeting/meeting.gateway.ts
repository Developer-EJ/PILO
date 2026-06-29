import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { MeetingTranscriptUpdatedEvent } from "./meeting-events.contract";

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN === "*" ? true : process.env.CORS_ORIGIN,
    credentials: true,
  },
})
export class MeetingGateway {
  @SubscribeMessage("meeting.transcript.updated")
  handleTranscriptUpdated(@MessageBody() event: MeetingTranscriptUpdatedEvent) {
    return {
      event: "meeting.transcript.updated",
      data: event,
    };
  }
}
