import { AgentWorkflowType } from "./agent-registry.types";

export type AgentActionType =
  | "task.create.draft"
  | "task.update.status"
  | "github.issue.create"
  | "meeting.report.generate"
  | "review.analysis.generate"
  | "planning.approve";

export type AgentActionSource =
  | "meeting"
  | "task"
  | "github"
  | "review"
  | "planning"
  | "orchestrator";

export type AgentRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "requires_confirmation";

export type AgentRunStepStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed";

export type AgentActionStatus =
  | "draft"
  | "waiting_confirmation"
  | "confirmed"
  | "executed"
  | "rejected"
  | "failed";

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

export interface AgentRecommendation {
  id: string;
  workspaceId: string;
  owner: "agent_runtime";
  source: AgentActionSource;
  title: string;
  summary: string;
  status: Exclude<AgentActionStatus, "draft">;
  createdAt: string;
}

export interface AgentChatMessage {
  id: string;
  workspaceId: string;
  role: "user" | "assistant";
  body: string;
  runId: string | null;
  actionIds: string[];
  createdAt: string;
}

export type AgentOnboardingFieldKey =
  | "workspaceTitle"
  | "goal"
  | "problem"
  | "targetUser"
  | "duration"
  | "teamSize"
  | "experienceLevel"
  | "outputGoal";

export interface AgentOnboardingDraft {
  workspaceTitle: string | null;
  goal: string | null;
  problem: string | null;
  targetUser: string | null;
  duration: string | null;
  teamSize: number | null;
  experienceLevel: string | null;
  outputGoal: string | null;
}

export interface AgentOnboardingMessage {
  role: "user" | "assistant";
  body: string;
  fieldKey?: AgentOnboardingFieldKey | null;
}

export interface AgentOnboardingTaskCandidate {
  workspaceId: string | null;
  sourceType: "planning_feature";
  sourceId: string;
  title: string;
  description: string;
  assigneeMemberId: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  dueDate: string | null;
}

export interface AgentOnboardingMilestoneCandidate {
  title: string;
  status: "planned";
  startDate: string | null;
  endDate: string | null;
}

export interface AgentOnboardingTurnResult {
  reply: string;
  draft: AgentOnboardingDraft;
  missingFields: AgentOnboardingFieldKey[];
  ready: boolean;
  fieldInFocus: AgentOnboardingFieldKey | null;
  summary: string | null;
  planningSeed: AgentOnboardingDraft | null;
  taskCandidates: AgentOnboardingTaskCandidate[];
  milestoneCandidates: AgentOnboardingMilestoneCandidate[];
  usedModel: string | null;
  fallback: boolean;
}

export type ProjectPlanDraftStatus =
  | "draft"
  | "reviewing"
  | "approved"
  | "rejected";

export type PlanningApprovalStatus =
  | "not_requested"
  | "waiting_confirmation"
  | "confirmed"
  | "executed"
  | "failed"
  | "rejected";

export interface ProjectPlanDraftSummary {
  id: string;
  workspaceId: string;
  goal: string;
  targetUser: string;
  status: ProjectPlanDraftStatus;
  featureDraftCount: number;
  milestoneDraftCount: number;
  riskCount: number;
  createdAt: string;
}

export interface ProjectPlanTechStackRecommendation {
  id: string;
  draftId: string;
  frontend: string;
  backend: string;
  databaseName: string;
  ai: string;
  deploy: string;
  reason: string;
  difficulty: "low" | "medium" | "high";
  alternatives: string[];
  createdAt: string;
}

export interface ProjectPlanFeatureDraft {
  id: string;
  draftId: string;
  title: string;
  description: string;
  scope: "mvp" | "should" | "could" | "excluded";
  reason: string;
  sortOrder: number;
  createdAt: string;
}

export interface ProjectPlanRoleDraft {
  id: string;
  draftId: string;
  member: {
    memberId: string;
    name: string;
  };
  suggestedRole: string;
  reason: string;
  sortOrder: number;
  createdAt: string;
}

export interface ProjectPlanMilestoneDraft {
  id: string;
  draftId: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface ProjectPlanRiskNote {
  id: string;
  draftId: string;
  content: string;
  severity: "low" | "medium" | "high" | "critical";
  sortOrder: number;
  createdAt: string;
}

export interface ProjectPlanFirstAgendaDraft {
  id: string;
  draftId: string;
  title: string;
  objective: string;
  agendaItems: string[];
  attendeeMemberIds: string[];
  durationMinutes: number;
  createdAt: string;
}

export interface PlanningOwnerApiResult {
  owner: "task";
  operation: "task.create" | "milestone.create";
  sourceDraftType: "feature" | "milestone";
  sourceDraftId: string;
  status: "not_requested" | "pending" | "succeeded" | "failed" | "skipped";
  targetEntityId: string | null;
  errorMessage: string | null;
}

export interface ProjectPlanApprovalState {
  status: PlanningApprovalStatus;
  actionId: string | null;
  requestedAt: string | null;
  confirmedAt: string | null;
  executedAt: string | null;
  ownerApiResults: PlanningOwnerApiResult[];
}

export interface ProjectPlanDraftDetail {
  id: string;
  workspaceId: string;
  goal: string;
  targetUser: string;
  problem: string;
  duration: string;
  outputGoal: string;
  status: ProjectPlanDraftStatus;
  createdByMemberId: string;
  techStack: ProjectPlanTechStackRecommendation | null;
  featureDrafts: ProjectPlanFeatureDraft[];
  roleDrafts: ProjectPlanRoleDraft[];
  milestoneDrafts: ProjectPlanMilestoneDraft[];
  riskNotes: ProjectPlanRiskNote[];
  firstAgendaDraft: ProjectPlanFirstAgendaDraft | null;
  approval: ProjectPlanApprovalState;
  createdAt: string;
  updatedAt: string;
}
