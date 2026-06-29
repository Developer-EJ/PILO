import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module";
import { CanvasModule } from "./modules/canvas/canvas.module";
import { HealthController } from "./health.controller";
import { AgentModule } from "./modules/agent/agent.module";
import { JuhyungModule } from "./modules/juhyung/juhyung.module";
import { MeetingModule } from "./modules/meeting/meeting.module";
import { ReviewModule } from "./modules/review/review.module";
import { WorkspaceModule } from "./modules/workspace/workspace.module";

@Module({
  imports: [
    AgentModule,
    AuthModule,
    WorkspaceModule,
    CanvasModule,
    JuhyungModule,
    MeetingModule,
    ReviewModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
