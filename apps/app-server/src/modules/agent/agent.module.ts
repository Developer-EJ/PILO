import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { JuhyungModule } from "../juhyung/juhyung.module";
import {
  AGENT_OWNER_ACTION_EXECUTOR,
  AgentOwnerActionExecutorService,
} from "./agent-owner-action.executor";
import { AgentRegistryRepository } from "./agent-registry.repository";
import { AgentRegistryService } from "./agent-registry.service";
import { AgentRuntimeController } from "./agent-runtime.controller";
import { AgentRuntimeService } from "./agent-runtime.service";

@Module({
  imports: [DatabaseModule, JuhyungModule],
  controllers: [AgentRuntimeController],
  providers: [
    AgentRegistryRepository,
    AgentRegistryService,
    AgentRuntimeService,
    AgentOwnerActionExecutorService,
    {
      provide: AGENT_OWNER_ACTION_EXECUTOR,
      useExisting: AgentOwnerActionExecutorService,
    },
  ],
  exports: [AgentRegistryRepository, AgentRegistryService, AgentRuntimeService],
})
export class AgentModule {}
