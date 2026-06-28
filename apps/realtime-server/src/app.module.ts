import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { EventsGateway } from "./events.gateway";
import { CanvasGateway } from "./canvas.gateway";
import { CanvasRealtimeAccessGuard } from "./canvas-realtime-access.guard";
import { CanvasShapeStateStore } from "./canvas-shape-state.store";

@Module({
  controllers: [HealthController],
  providers: [
    EventsGateway,
    CanvasGateway,
    CanvasRealtimeAccessGuard,
    CanvasShapeStateStore,
  ],
})
export class AppModule {}
