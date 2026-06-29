import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AgentRegistryRepository } from "./agent-registry.repository";
import { AgentRegistryService } from "./agent-registry.service";

@Module({
  imports: [DatabaseModule],
  providers: [AgentRegistryRepository, AgentRegistryService],
  exports: [AgentRegistryRepository, AgentRegistryService],
})
export class AgentModule {}
