import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module";
import { CanvasModule } from "./modules/canvas/canvas.module";
import { HealthController } from "./health.controller";
import { AgentModule } from "./modules/agent/agent.module";
import { JuhyungModule } from "./modules/juhyung/juhyung.module";
import { MeetingModule } from "./modules/meeting/meeting.module";
import { VoiceModule } from "./modules/voice/voice.module";
import { ReviewModule } from "./modules/review/review.module";
import { WorkspaceModule } from "./modules/workspace/workspace.module";

@Module({
  imports: [
    AgentModule,
    AuthModule,
    CanvasModule,
    JuhyungModule,
    MeetingModule,
    ReviewModule,
    VoiceModule,
    WorkspaceModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
