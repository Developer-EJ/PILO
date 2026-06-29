import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { ContractValidationModule } from "./common/validation/contract-validation.module";
import { AgentModule } from "./modules/agent/agent.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CanvasModule } from "./modules/canvas/canvas.module";
import { CommonSystemModule } from "./modules/common-system/common-system.module";
import { GithubModule } from "./modules/github/github.module";
import { MeetingModule } from "./modules/meeting/meeting.module";
import { PlanningModule } from "./modules/planning/planning.module";
import { ProgressModule } from "./modules/progress/progress.module";
import { ReportModule } from "./modules/report/report.module";
import { ReviewModule } from "./modules/review/review.module";
import { TaskModule } from "./modules/task/task.module";
import { WorkspaceModule } from "./modules/workspace/workspace.module";

@Module({
  imports: [
    ContractValidationModule,
    AuthModule,
    WorkspaceModule,
    CanvasModule,
    TaskModule,
    GithubModule,
    ProgressModule,
    MeetingModule,
    ReportModule,
    ReviewModule,
    AgentModule,
    PlanningModule,
    CommonSystemModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
