import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { MeetingModule } from "./modules/meeting/meeting.module";
import { VoiceModule } from "./modules/voice/voice.module";

@Module({
  imports: [MeetingModule, VoiceModule],
  controllers: [HealthController],
})
export class AppModule {}
