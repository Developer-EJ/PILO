import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { EventsGateway } from "./events.gateway";
import { VoiceModule } from "./voice/voice.module";

@Module({
  imports: [VoiceModule],
  controllers: [HealthController],
  providers: [EventsGateway],
})
export class AppModule {}
