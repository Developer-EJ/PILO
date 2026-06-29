import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { EventsGateway } from "./events.gateway";
import { VoiceModule } from "./voice/voice.module";
import { CanvasGateway } from "./canvas.gateway";
import {
  CanvasRealtimeAccessGuard,
  CanvasRealtimeBoardAccessProvider,
  LocalHandshakeCanvasRealtimeBoardAccessProvider,
} from "./canvas-realtime-access.guard";
import { CanvasShapeStateStore } from "./canvas-shape-state.store";

@Module({
  imports: [VoiceModule],
  controllers: [HealthController],
  providers: [
    EventsGateway,
    CanvasGateway,
    LocalHandshakeCanvasRealtimeBoardAccessProvider,
    {
      provide: CanvasRealtimeBoardAccessProvider,
      useExisting: LocalHandshakeCanvasRealtimeBoardAccessProvider,
    },
    CanvasRealtimeAccessGuard,
    CanvasShapeStateStore,
  ],
})
export class AppModule {}
