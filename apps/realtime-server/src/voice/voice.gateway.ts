import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { VoiceEventsService } from "./voice-events.service";
import {
  MeetingVoiceStatusRequest,
  ProviderVoiceEventRequest,
  VOICE_CLIENT_EVENT_NAMES,
  VoiceMemberEventRequest,
} from "./voice-events.types";

@WebSocketGateway({
  namespace: "voice",
  cors: {
    origin: process.env.CORS_ORIGIN === "*" ? true : process.env.CORS_ORIGIN,
    credentials: true,
  },
})
export class VoiceGateway {
  constructor(private readonly voiceEventsService: VoiceEventsService) {}

  @SubscribeMessage(VOICE_CLIENT_EVENT_NAMES.join)
  handleJoin(@MessageBody() body: VoiceMemberEventRequest) {
    return this.voiceEventsService.createJoinedEvent(body);
  }

  @SubscribeMessage(VOICE_CLIENT_EVENT_NAMES.leave)
  handleLeave(@MessageBody() body: VoiceMemberEventRequest) {
    return this.voiceEventsService.createLeftEvent(body);
  }

  @SubscribeMessage(VOICE_CLIENT_EVENT_NAMES.broadcastStatus)
  handleMeetingVoiceStatus(@MessageBody() body: MeetingVoiceStatusRequest) {
    return this.voiceEventsService.createMeetingVoiceStatusEvent(body);
  }

  @SubscribeMessage(VOICE_CLIENT_EVENT_NAMES.providerEvent)
  handleProviderEvent(@MessageBody() body: ProviderVoiceEventRequest) {
    return this.voiceEventsService.createProviderEvent(body);
  }
}
