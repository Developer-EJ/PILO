import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { EventsGateway } from "./events.gateway";

@Module({
  controllers: [HealthController],
  providers: [EventsGateway],
})
export class AppModule {}
