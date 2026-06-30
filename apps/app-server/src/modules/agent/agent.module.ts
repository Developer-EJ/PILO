import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AgentRegistryRepository } from "./agent-registry.repository";
import { AgentRegistryService } from "./agent-registry.service";
import { AgentRuntimeController } from "./agent-runtime.controller";
import { AgentRuntimeService } from "./agent-runtime.service";

@Module({
  imports: [DatabaseModule],
  controllers: [AgentRuntimeController],
  providers: [
    AgentRegistryRepository,
    AgentRegistryService,
    AgentRuntimeService,
  ],
  exports: [AgentRegistryRepository, AgentRegistryService, AgentRuntimeService],
})
export class AgentModule {}
