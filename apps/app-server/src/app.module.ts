import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { MeetingModule } from "./modules/meeting/meeting.module";

@Module({
  imports: [MeetingModule],
  controllers: [HealthController],
})
export class AppModule {}
