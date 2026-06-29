import { Prisma } from "@prisma/client";

export const AGENT_OWNER_TABLES = ["agents", "agent_workflows"] as const;

export type AgentOwnerTable = (typeof AGENT_OWNER_TABLES)[number];

export const AGENT_DOMAINS = [
  "task",
  "github",
  "meeting",
  "review",
  "planning",
  "orchestrator",
] as const;

export type AgentDomain = (typeof AGENT_DOMAINS)[number];

export const AGENT_WORKFLOW_TYPES = [
  "meeting.report.generate",
  "review.analysis.generate",
  "planning.generate",
  "task.draft.generate",
  "github.issue.draft.generate",
  "orchestrator.run",
] as const;

export type AgentWorkflowType = (typeof AGENT_WORKFLOW_TYPES)[number];

export const DEFAULT_AGENT_WORKFLOW_VERSION = "v1";

export interface RegisterAgentInput {
  name: string;
  domain: AgentDomain;
  description?: string | null;
  enabled?: boolean;
}

export interface RegisterAgentWorkflowInput {
  agentId: string;
  type: AgentWorkflowType;
  version?: string;
  inputSchema?: Prisma.InputJsonValue;
  outputSchema?: Prisma.InputJsonValue;
  enabled?: boolean;
}

export interface FindAgentWorkflowInput {
  type: AgentWorkflowType;
  version?: string;
}
