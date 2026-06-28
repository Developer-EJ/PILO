import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { EventsGateway } from "./events.gateway";
import { CanvasGateway } from "./canvas.gateway";

@Module({
  controllers: [HealthController],
  providers: [EventsGateway, CanvasGateway],
})
export class AppModule {}
