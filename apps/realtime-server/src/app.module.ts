import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { EventsGateway } from "./events.gateway";
import { CanvasGateway } from "./canvas.gateway";
import { CanvasRealtimeAccessGuard } from "./canvas-realtime-access.guard";

@Module({
  controllers: [HealthController],
  providers: [EventsGateway, CanvasGateway, CanvasRealtimeAccessGuard],
})
export class AppModule {}
