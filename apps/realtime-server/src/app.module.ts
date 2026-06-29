import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { EventsGateway } from "./events.gateway";
import { CanvasModule } from "./canvas/canvas.module";
import { MeetingModule } from "./meeting/meeting.module";
import { VoiceModule } from "./voice/voice.module";

@Module({
  imports: [CanvasModule, MeetingModule, VoiceModule],
  controllers: [HealthController],
  providers: [EventsGateway],
})
export class AppModule {}
