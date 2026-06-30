import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { AgentRuntimeController } from "./agent-runtime.controller";
import { AgentRuntimeRepository } from "./agent-runtime.repository";
import { AgentRuntimeService } from "./agent-runtime.service";
import { AgentRegistryRepository } from "./agent-registry.repository";
import { AgentRegistryService } from "./agent-registry.service";
import { DailyBriefingController } from "./daily-briefing.controller";
import { DailyBriefingService } from "./daily-briefing.service";

@Module({
  imports: [AuthModule, DatabaseModule, WorkspaceModule],
  controllers: [AgentRuntimeController, DailyBriefingController],
  providers: [
    AgentRegistryRepository,
    AgentRegistryService,
    AgentRuntimeRepository,
    AgentRuntimeService,
    DailyBriefingService,
  ],
  exports: [
    AgentRegistryRepository,
    AgentRegistryService,
    AgentRuntimeRepository,
    AgentRuntimeService,
    DailyBriefingService,
  ],
})
export class AgentModule {}
