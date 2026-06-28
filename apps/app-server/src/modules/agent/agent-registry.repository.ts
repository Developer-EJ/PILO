import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import {
  AGENT_OWNER_TABLES,
  DEFAULT_AGENT_WORKFLOW_VERSION,
  FindAgentWorkflowInput,
  RegisterAgentInput,
  RegisterAgentWorkflowInput,
} from "./agent-registry.types";

export { AGENT_OWNER_TABLES };

@Injectable()
export class AgentRegistryRepository {
  constructor(private readonly database: DatabaseService) {}

  createAgent(input: RegisterAgentInput) {
    return this.database.agent.create({
      data: {
        name: input.name,
        domain: input.domain,
        description: input.description ?? null,
        enabled: input.enabled ?? true,
      },
    });
  }

  createWorkflow(input: RegisterAgentWorkflowInput) {
    return this.database.agentWorkflow.create({
      data: {
        agentId: input.agentId,
        type: input.type,
        version: input.version ?? DEFAULT_AGENT_WORKFLOW_VERSION,
        inputSchema: input.inputSchema ?? {},
        outputSchema: input.outputSchema ?? {},
        enabled: input.enabled ?? true,
      },
      include: {
        agent: true,
      },
    });
  }

  findWorkflowByTypeAndVersion(input: FindAgentWorkflowInput) {
    return this.database.agentWorkflow.findFirst({
      where: {
        type: input.type,
        version: input.version ?? DEFAULT_AGENT_WORKFLOW_VERSION,
      },
      include: {
        agent: true,
      },
    });
  }

  listEnabledWorkflows() {
    return this.database.agentWorkflow.findMany({
      where: {
        enabled: true,
        agent: {
          enabled: true,
        },
      },
      include: {
        agent: true,
      },
      orderBy: [{ type: "asc" }, { version: "asc" }],
    });
  }
}
