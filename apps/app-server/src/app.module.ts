import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthController } from "./health.controller";
import { AgentModule } from "./modules/agent/agent.module";
import { JuhyungModule } from "./modules/juhyung/juhyung.module";
import { MeetingModule } from "./modules/meeting/meeting.module";
import { ReviewModule } from "./modules/review/review.module";

@Module({
  imports: [
    AgentModule,
    AuthModule,
    JuhyungModule,
    MeetingModule,
    ReviewModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
