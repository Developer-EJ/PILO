import { Module } from "@nestjs/common";
import { MockVoiceEventGuard } from "./mock-voice-event.guard";
import { VoiceEventsService } from "./voice-events.service";
import { VoiceGateway } from "./voice.gateway";

@Module({
  providers: [MockVoiceEventGuard, VoiceEventsService, VoiceGateway],
  exports: [VoiceEventsService],
})
export class VoiceModule {}
