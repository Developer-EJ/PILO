import { AgentWorkflowType } from "./agent-registry.types";

export class AgentWorkflowRegistryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class AgentWorkflowNotFoundError extends AgentWorkflowRegistryError {
  constructor(type: AgentWorkflowType, version: string) {
    super(
      "AGENT_WORKFLOW_NOT_FOUND",
      `Agent workflow is not registered: ${type}@${version}`,
    );
  }
}

export class AgentWorkflowDisabledError extends AgentWorkflowRegistryError {
  constructor(type: AgentWorkflowType, version: string) {
    super(
      "AGENT_WORKFLOW_DISABLED",
      `Agent workflow is disabled: ${type}@${version}`,
    );
  }
}
