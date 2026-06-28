import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { MeetingModule } from "./modules/meeting/meeting.module";
import { JuhyungModule } from "./modules/juhyung/juhyung.module";

@Module({
  imports: [JuhyungModule, MeetingModule],
  controllers: [HealthController],
})
export class AppModule {}
