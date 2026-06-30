import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { AgentRuntimeController } from "./agent-runtime.controller";
import { AgentRuntimeRepository } from "./agent-runtime.repository";
import { AgentRuntimeService } from "./agent-runtime.service";
import { AgentRegistryRepository } from "./agent-registry.repository";
import { AgentRegistryService } from "./agent-registry.service";

@Module({
  imports: [DatabaseModule, WorkspaceModule],
  controllers: [AgentRuntimeController],
  providers: [
    AgentRegistryRepository,
    AgentRegistryService,
    AgentRuntimeRepository,
    AgentRuntimeService,
  ],
  exports: [
    AgentRegistryRepository,
    AgentRegistryService,
    AgentRuntimeRepository,
    AgentRuntimeService,
  ],
})
export class AgentModule {}
