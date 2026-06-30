import type { WorkspaceActor } from "../workspace/public/workspace-access-public.service";

export const AGENT_ACTION_STATUSES = [
  "draft",
  "waiting_confirmation",
  "confirmed",
  "executed",
  "rejected",
  "failed",
] as const;

export type AgentActionStatus = (typeof AGENT_ACTION_STATUSES)[number];

export const AGENT_RUN_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "requires_confirmation",
] as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export interface AgentTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string | null;
}

export interface AgentRunError {
  message: string;
  code?: string | null;
}

export interface AgentActionDetail {
  id: string;
  runId: string;
  type: string;
  source: string;
  requiresConfirmation: boolean;
  payload: Record<string, unknown>;
  status: AgentActionStatus;
  confirmedByMemberId: string | null;
  confirmedAt: string | null;
  executedAt: string | null;
}

export interface AgentRunStepDetail {
  id: string;
  runId: string;
  stepName: string;
  status: "pending" | "running" | "succeeded" | "failed";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error: AgentRunError | null;
  tokenUsage: AgentTokenUsage | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

export interface AgentTraceEntry {
  id: string;
  runId: string;
  stepId: string | null;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AgentRunDetail {
  id: string;
  workflowId: string;
  workflowType: string;
  workflowVersion: string;
  workspaceId: string;
  actorMemberId: string;
  status: AgentRunStatus;
  actionRequired: boolean;
  pendingActionCount: number;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: AgentRunError | null;
  tokenUsage: AgentTokenUsage | null;
  steps: AgentRunStepDetail[];
  actions: AgentActionDetail[];
  trace: AgentTraceEntry[];
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRunCreateRequest {
  workflowType?: unknown;
  workflowVersion?: unknown;
  input?: unknown;
  contextRefs?: unknown;
}

export interface AgentRuntimeCreateInput {
  workspaceId: string;
  body: AgentRunCreateRequest;
}

export interface AgentActionDecisionInput {
  actionId: string;
  actor?: WorkspaceActor;
}

export class AgentRuntimeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRuntimeValidationError";
  }
}

export class AgentRuntimeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRuntimeNotFoundError";
  }
}
