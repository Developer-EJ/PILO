import type { AgentWorkflowType } from "./agent-registry.types";

export const AGENT_RUN_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "requires_confirmation",
] as const;

export const AGENT_RUN_STEP_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
] as const;

export const AGENT_RESULT_STATUSES = ["succeeded", "failed"] as const;

export const AGENT_ACTION_TYPES = [
  "task.create.draft",
  "task.update.status",
  "github.issue.create",
  "meeting.report.generate",
  "review.analysis.generate",
  "planning.approve",
] as const;

export const AGENT_ACTION_STATUSES = [
  "draft",
  "waiting_confirmation",
  "confirmed",
  "executed",
  "rejected",
  "failed",
] as const;

export const AGENT_ACTION_SOURCES = [
  "meeting",
  "task",
  "github",
  "review",
  "planning",
  "orchestrator",
] as const;

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];
export type AgentRunStepStatus = (typeof AGENT_RUN_STEP_STATUSES)[number];
export type AgentResultStatus = (typeof AGENT_RESULT_STATUSES)[number];
export type AgentActionType = (typeof AGENT_ACTION_TYPES)[number];
export type AgentActionStatus = (typeof AGENT_ACTION_STATUSES)[number];
export type AgentActionSource = (typeof AGENT_ACTION_SOURCES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface AgentError {
  code: string | null;
  message: string;
}

export interface AgentTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string | null;
}

export interface AgentContextRef {
  type: string;
  id: string;
}

export interface AgentAction {
  id: string;
  runId: string;
  type: AgentActionType;
  source: AgentActionSource;
  requiresConfirmation: boolean;
  payload: Record<string, unknown>;
  status: AgentActionStatus;
  confirmedByMemberId: string | null;
  confirmedAt: string | null;
  executedAt: string | null;
}

export interface AgentTraceEntry {
  id: string;
  runId: string;
  stepId: string | null;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AgentRunStepDetail {
  id: string;
  runId: string;
  stepName: string;
  status: AgentRunStepStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: AgentError | null;
  tokenUsage: AgentTokenUsage | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface AgentRunDetail {
  id: string;
  workflowId: string;
  workflowType: AgentWorkflowType;
  workflowVersion: string;
  workspaceId: string;
  actorMemberId: string;
  status: AgentRunStatus;
  actionRequired: boolean;
  pendingActionCount: number;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: AgentError | null;
  tokenUsage: AgentTokenUsage | null;
  steps: AgentRunStepDetail[];
  actions: AgentAction[];
  trace: AgentTraceEntry[];
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRunStatusResponse {
  id: string;
  workspaceId: string;
  workflowType: AgentWorkflowType;
  workflowVersion: string;
  status: AgentRunStatus;
  actionRequired: boolean;
  pendingActionCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  error: AgentError | null;
}

export interface AgentJobMessage {
  jobId: string;
  runId: string;
  workflowType: AgentWorkflowType;
  workflowVersion: string;
  workspaceId: string;
  actorMemberId: string;
  input: Record<string, unknown>;
  contextRefs: AgentContextRef[];
  requestedAt: string;
}

export interface AgentResultTrace {
  stepName: string | null;
  message: string;
  metadata: Record<string, unknown>;
}

export interface AgentResultMessage {
  jobId: string;
  runId: string;
  status: AgentResultStatus;
  output: Record<string, unknown>;
  actions: AgentAction[];
  trace: AgentResultTrace[];
  error: AgentError | null;
  finishedAt: string;
}

export interface CreateLocalAgentRunInput {
  workspaceId: string;
  actorMemberId: string;
  workflowType: unknown;
  workflowVersion?: unknown;
  input?: unknown;
  contextRefs?: unknown;
}

export interface AgentRecommendation {
  id: string;
  workspaceId: string;
  owner: "agent_runtime";
  source: AgentActionSource;
  title: string;
  summary: string;
  status: AgentActionStatus;
  createdAt: string;
}

export interface AgentOwnerActionExecution {
  owner: string;
  operation: string;
  status: "succeeded" | "failed" | "deferred";
  targetEntityId: string | null;
  errorMessage: string | null;
}

export interface AgentOwnerActionExecutor {
  execute(action: AgentAction): Promise<AgentOwnerActionExecution>;
}

export interface RuntimeClock {
  now(): string;
  uuid(): string;
}
