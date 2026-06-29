import { Injectable } from "@nestjs/common";
import {
  AgentWorkflowDisabledError,
  AgentWorkflowNotFoundError,
} from "./agent-registry.errors";
import { AgentRegistryRepository } from "./agent-registry.repository";
import {
  DEFAULT_AGENT_WORKFLOW_VERSION,
  FindAgentWorkflowInput,
  RegisterAgentInput,
  RegisterAgentWorkflowInput,
} from "./agent-registry.types";

@Injectable()
export class AgentRegistryService {
  constructor(private readonly repository: AgentRegistryRepository) {}

  registerAgent(input: RegisterAgentInput) {
    return this.repository.createAgent(input);
  }

  registerWorkflow(input: RegisterAgentWorkflowInput) {
    return this.repository.createWorkflow(input);
  }

  listEnabledWorkflows() {
    return this.repository.listEnabledWorkflows();
  }

  async requireEnabledWorkflow(input: FindAgentWorkflowInput) {
    const version = input.version ?? DEFAULT_AGENT_WORKFLOW_VERSION;
    const workflow = await this.repository.findWorkflowByTypeAndVersion({
      ...input,
      version,
    });

    if (!workflow) {
      throw new AgentWorkflowNotFoundError(input.type, version);
    }

    if (!workflow.enabled || !workflow.agent.enabled) {
      throw new AgentWorkflowDisabledError(input.type, version);
    }

    return workflow;
  }
}
