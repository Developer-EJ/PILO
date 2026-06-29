export type Uuid = string;
export type DateString = string;
export type DateTimeString = string;

export interface MemberRef {
  memberId: Uuid;
  userId?: Uuid;
  name: string;
  email?: string;
  avatarUrl?: string | null;
}

export interface CurrentUser {
  id: Uuid;
  email: string;
  name: string;
  avatarUrl?: string | null;
  providers: Array<"google" | "github">;
  lastLoginAt?: DateTimeString | null;
}

export interface WorkspaceSummary {
  id: Uuid;
  name: string;
  description?: string | null;
  type?: "side_project" | "bootcamp" | "university" | "hackathon" | "other";
  status: "active" | "archived";
  myRole: "owner" | "member" | "viewer";
  memberCount: number;
  createdAt?: DateTimeString;
}

export interface WorkspaceMemberSummary {
  memberId: Uuid;
  userId: Uuid;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: "owner" | "member" | "viewer";
  displayName?: string | null;
  joinedAt?: DateTimeString;
}

export type CanvasEntityType =
  | "task"
  | "meeting_report"
  | "github_pull_request"
  | "github_issue"
  | "document"
  | "file"
  | "code"
  | "decision"
  | "meeting_risk"
  | "review_risk"
  | "planning_risk"
  | "review_analysis";

export type ContractOwner =
  | "auth"
  | "workspace"
  | "canvas"
  | "task"
  | "github"
  | "progress"
  | "meeting"
  | "review"
  | "agent"
  | "planning"
  | "common-system";

export type CrossDomainEntityType =
  | "workspace"
  | "workspace_member"
  | "task"
  | "github_repository"
  | "github_issue"
  | "github_pull_request"
  | "meeting"
  | "meeting_report"
  | "meeting_action_item"
  | "review_analysis"
  | "review_node"
  | "review_risk"
  | "planning_draft"
  | "canvas_board"
  | "canvas_shape"
  | "shared_file";

export type ApiErrorCode =
  | "validation_failed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "upstream_unavailable"
  | "internal_error";

export interface ValidationErrorDetail {
  field?: string | null;
  reason: string;
  expected?: string | null;
}

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ValidationErrorDetail[];
    traceId?: string | null;
  };
}

export type PaginationSort =
  | "created_at_desc"
  | "updated_at_desc"
  | "priority_desc"
  | "due_date_asc"
  | "risk_desc";

export interface PaginationQuery {
  cursor?: string | null;
  limit?: number;
  sort?: PaginationSort;
}

export interface PageInfo {
  limit: number;
  nextCursor?: string | null;
  hasNextPage: boolean;
}

export type WorkspacePermissionAction =
  | "workspace.view"
  | "workspace.manage"
  | "task.view"
  | "task.manage"
  | "github.view"
  | "github.manage"
  | "meeting.view"
  | "meeting.manage"
  | "review.view"
  | "review.manage"
  | "agent.run"
  | "agent.confirm_action"
  | "planning.manage"
  | "file.upload";

export interface WorkspacePermissionDecision {
  workspaceId: Uuid;
  actorMemberId: Uuid;
  action: WorkspacePermissionAction;
  allowed: boolean;
  reason?: string | null;
}

export interface WorkspacePermissionResolveRequest {
  action: WorkspacePermissionAction;
  entityType?: CrossDomainEntityType | null;
  entityId?: Uuid | null;
}

export interface PaginatedResult<TItem> {
  items: TItem[];
  pageInfo: PageInfo;
}

export interface CanvasEntityRef {
  entityType: CanvasEntityType;
  entityId: Uuid;
  sourceOwner: ContractOwner;
  sourceTable: string;
  displayTitle: string;
  shapeType: CanvasEntityType;
}

export interface CanvasBoardSummary {
  id: Uuid;
  workspaceId: Uuid;
  title: string;
  shapeCount?: number;
  updatedAt?: DateTimeString;
}

export interface CanvasShapeRequest extends CanvasEntityRef {
  width?: number;
  height?: number;
  color?: string;
}

export interface CanvasConnectionRequest {
  sourceShapeId: Uuid;
  targetShapeId: Uuid;
  connectionType: string;
  label?: string | null;
}

export interface CanvasBoardDetail extends CanvasBoardSummary {
  shapes: CanvasShapeRequest[];
  connections: CanvasConnectionRequest[];
  viewSetting?: {
    zoom?: number;
    viewportX?: number;
    viewportY?: number;
  };
  filterSetting?: {
    enabledEntityTypes?: CanvasEntityType[];
    assigneeMemberId?: Uuid | null;
    showDelayedOnly?: boolean;
    showRiskOnly?: boolean;
  };
}

export interface TaskSummary {
  id: Uuid;
  workspaceId: Uuid;
  title: string;
  status: "todo" | "in_progress" | "in_review" | "done" | "blocked";
  priority: "low" | "medium" | "high" | "urgent";
  assignee?: MemberRef | null;
  dueDate?: DateString | null;
  isDelayed: boolean;
  linkedIssueCount?: number;
  linkedPrCount?: number;
  updatedAt?: DateTimeString;
}

export interface TaskCreateDraft {
  workspaceId: Uuid;
  sourceType?: CrossDomainEntityType;
  sourceId?: Uuid;
  title: string;
  description?: string | null;
  assigneeMemberId?: Uuid | null;
  priority?: "low" | "medium" | "high" | "urgent";
  dueDate?: DateString | null;
}

export type TaskCreateDraftRequest = Omit<TaskCreateDraft, "workspaceId">;

export interface GithubRepositorySummary {
  id: Uuid;
  workspaceId: Uuid;
  owner: string;
  repoName: string;
  url: string;
  defaultBranch?: string | null;
}

export interface GithubIssueSummary {
  id: Uuid;
  repositoryId: Uuid;
  number: number;
  title: string;
  state: "open" | "closed";
  url: string;
  labels?: string[];
  linkedTaskId?: Uuid | null;
  syncedAt?: DateTimeString | null;
}

export type GithubIssueSummaryPage = PaginatedResult<GithubIssueSummary>;

export interface PullRequestSummary {
  id: Uuid;
  repositoryId: Uuid;
  number: number;
  title: string;
  authorLogin?: string | null;
  state:
    | "open"
    | "review_requested"
    | "changes_requested"
    | "merged"
    | "closed";
  branch?: string | null;
  baseBranch?: string | null;
  url: string;
  changedFilesCount?: number;
  additions?: number;
  deletions?: number;
  linkedTaskIds?: Uuid[];
  syncedAt?: DateTimeString | null;
}

export type PullRequestSummaryPage = PaginatedResult<PullRequestSummary>;

export interface ProgressSummary {
  workspaceId: Uuid;
  milestoneId?: Uuid | null;
  totalTasks: number;
  doneTasks: number;
  blockedTasks: number;
  reviewTasks: number;
  delayedTasks: number;
  progressRate: number;
  capturedAt?: DateTimeString;
}

export interface MeetingReportSummary {
  id: Uuid;
  meetingId: Uuid;
  workspaceId: Uuid;
  title: string;
  summary: string;
  decisionCount: number;
  actionItemCount: number;
  riskCount: number;
  createdAt?: DateTimeString;
}

export interface MeetingActionItem {
  id: Uuid;
  reportId: Uuid;
  title: string;
  description?: string | null;
  assigneeSuggestionMemberId?: Uuid | null;
  dueDateSuggestion?: DateString | null;
  status: "draft" | "approved" | "converted" | "rejected";
  convertedTaskId?: Uuid | null;
}

export interface MeetingDecisionSummary {
  id: Uuid;
  reportId: Uuid;
  title: string;
  content?: string | null;
  sortOrder?: number;
}

export interface PRAnalysisSummary {
  id: Uuid;
  pullRequestId: Uuid;
  purposeSummary?: string | null;
  impactSummary?: string | null;
  testRecommendation?: string | null;
  riskLevel: "low" | "medium" | "high" | "critical";
  analysisStatus: "pending" | "running" | "succeeded" | "failed";
  okCount: number;
  discussCount: number;
  riskCount: number;
  conclusion?: string | null;
}

export interface ReviewNodeSummary {
  id: Uuid;
  nodeType: "file" | "function" | "risk" | "question" | "checklist";
  label: string;
  filePath?: string | null;
  riskLevel: "low" | "medium" | "high" | "critical";
  status: "pending" | "ok" | "discuss" | "risk";
}

export type ReviewRiskType =
  | "security"
  | "logic"
  | "performance"
  | "test_gap"
  | "maintainability"
  | "contract"
  | "migration"
  | "ux"
  | "other";

export interface ReviewRiskSummary {
  id: Uuid;
  analysisId: Uuid;
  nodeId?: Uuid | null;
  type: ReviewRiskType;
  level: "low" | "medium" | "high" | "critical";
  reason: string;
}

export interface AgentRecommendation {
  id: Uuid;
  workspaceId: Uuid;
  title: string;
  source: AgentActionSource;
  actionType?: AgentActionType | null;
  confidence?: number;
  status: "draft" | "accepted" | "dismissed";
}

export type AgentActionPage = PaginatedResult<AgentAction>;

export type AgentActionType =
  | "task.create.draft"
  | "task.update.status"
  | "task.assign"
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

export type AgentActionStatus =
  | "draft"
  | "waiting_confirmation"
  | "confirmed"
  | "executed"
  | "rejected"
  | "failed";

export interface TaskStatusUpdateAction {
  taskId: Uuid;
  status: TaskSummary["status"];
  reason?: string | null;
}

export interface TaskAssignAction {
  taskId: Uuid;
  assigneeMemberId: Uuid | null;
  reason?: string | null;
}

export interface GithubIssueCreateAction {
  repositoryId: Uuid;
  title: string;
  body?: string | null;
  labels?: string[];
  linkedTaskId?: Uuid | null;
}

export interface MeetingReportGenerateAction {
  workspaceId: Uuid;
  meetingId: Uuid;
}

export interface ReviewAnalysisGenerateAction {
  workspaceId: Uuid;
  pullRequestId: Uuid;
}

export interface PlanningApproveAction {
  workspaceId: Uuid;
  draftId: Uuid;
  createTasks?: boolean;
}

export type AgentActionPayload =
  | TaskCreateDraft
  | TaskStatusUpdateAction
  | TaskAssignAction
  | GithubIssueCreateAction
  | MeetingReportGenerateAction
  | ReviewAnalysisGenerateAction
  | PlanningApproveAction;

export interface AgentActionBase<
  TType extends AgentActionType,
  TPayload extends AgentActionPayload,
> {
  id?: Uuid;
  runId?: Uuid;
  type: TType;
  source: AgentActionSource;
  requiresConfirmation: boolean;
  payload: TPayload;
  status: AgentActionStatus;
  confirmedByMemberId?: Uuid | null;
  confirmedAt?: DateTimeString | null;
  executedAt?: DateTimeString | null;
}

export type TaskCreateDraftAgentAction = AgentActionBase<
  "task.create.draft",
  TaskCreateDraft
>;
export type TaskStatusUpdateAgentAction = AgentActionBase<
  "task.update.status",
  TaskStatusUpdateAction
>;
export type TaskAssignAgentAction = AgentActionBase<
  "task.assign",
  TaskAssignAction
>;
export type GithubIssueCreateAgentAction = AgentActionBase<
  "github.issue.create",
  GithubIssueCreateAction
>;
export type MeetingReportGenerateAgentAction = AgentActionBase<
  "meeting.report.generate",
  MeetingReportGenerateAction
>;
export type ReviewAnalysisGenerateAgentAction = AgentActionBase<
  "review.analysis.generate",
  ReviewAnalysisGenerateAction
>;
export type PlanningApproveAgentAction = AgentActionBase<
  "planning.approve",
  PlanningApproveAction
>;

export type AgentAction =
  | TaskCreateDraftAgentAction
  | TaskStatusUpdateAgentAction
  | TaskAssignAgentAction
  | GithubIssueCreateAgentAction
  | MeetingReportGenerateAgentAction
  | ReviewAnalysisGenerateAgentAction
  | PlanningApproveAgentAction;

export type AgentWorkflowType =
  | "meeting.report.generate"
  | "review.analysis.generate"
  | "planning.generate"
  | "task.draft.generate"
  | "github.issue.draft.generate"
  | "orchestrator.run";

export type AgentContextType = CrossDomainEntityType | "member";

export interface AgentContextRef {
  type: AgentContextType;
  id: Uuid;
}

export interface MeetingReportWorkflowInput {
  meetingId: Uuid;
  transcriptSourceFileId?: Uuid | null;
  requestedSections?: Array<
    "summary" | "decisions" | "action_items" | "risks" | "next_agenda"
  >;
}

export interface ReviewAnalysisWorkflowInput {
  pullRequestId: Uuid;
  repositoryId?: Uuid | null;
  analysisDepth?: "summary" | "standard" | "deep";
}

export interface PlanningWorkflowInput {
  goal: string;
  draftId?: Uuid | null;
  sourceDocumentIds?: Uuid[];
  targetMilestoneCount?: number;
}

export interface TaskDraftWorkflowInput {
  sourceType: CrossDomainEntityType;
  sourceId: Uuid;
  suggestedTitle?: string | null;
}

export interface GithubIssueDraftWorkflowInput {
  repositoryId: Uuid;
  sourceType?: CrossDomainEntityType;
  sourceId?: Uuid | null;
  title?: string | null;
  body?: string | null;
  labels?: string[];
}

export interface OrchestratorRunWorkflowInput {
  objective: string;
  allowedWorkflowTypes?: Exclude<AgentWorkflowType, "orchestrator.run">[];
  contextRefs?: AgentContextRef[];
}

export type AgentWorkflowInput =
  | MeetingReportWorkflowInput
  | ReviewAnalysisWorkflowInput
  | PlanningWorkflowInput
  | TaskDraftWorkflowInput
  | GithubIssueDraftWorkflowInput
  | OrchestratorRunWorkflowInput;

export interface AgentJobMessageBase<
  TWorkflowType extends AgentWorkflowType,
  TInput extends AgentWorkflowInput,
> {
  jobId: Uuid;
  runId: Uuid;
  workflowType: TWorkflowType;
  workflowVersion: string;
  workspaceId: Uuid;
  actorMemberId: Uuid;
  input: TInput;
  contextRefs?: AgentContextRef[];
  requestedAt: DateTimeString;
}

export type MeetingReportAgentJobMessage = AgentJobMessageBase<
  "meeting.report.generate",
  MeetingReportWorkflowInput
>;
export type ReviewAnalysisAgentJobMessage = AgentJobMessageBase<
  "review.analysis.generate",
  ReviewAnalysisWorkflowInput
>;
export type PlanningAgentJobMessage = AgentJobMessageBase<
  "planning.generate",
  PlanningWorkflowInput
>;
export type TaskDraftAgentJobMessage = AgentJobMessageBase<
  "task.draft.generate",
  TaskDraftWorkflowInput
>;
export type GithubIssueDraftAgentJobMessage = AgentJobMessageBase<
  "github.issue.draft.generate",
  GithubIssueDraftWorkflowInput
>;
export type OrchestratorRunAgentJobMessage = AgentJobMessageBase<
  "orchestrator.run",
  OrchestratorRunWorkflowInput
>;

export type AgentJobMessage =
  | MeetingReportAgentJobMessage
  | ReviewAnalysisAgentJobMessage
  | PlanningAgentJobMessage
  | TaskDraftAgentJobMessage
  | GithubIssueDraftAgentJobMessage
  | OrchestratorRunAgentJobMessage;

export interface AgentTraceMetadata {
  sourceOwner?: ContractOwner;
  model?: string | null;
  promptTemplateId?: string | null;
  tokenCount?: number;
  elapsedMs?: number;
}

export interface AgentTraceEntry {
  stepName?: string | null;
  message: string;
  metadata?: AgentTraceMetadata;
}

export interface AgentResultError {
  code?: string | null;
  message: string;
}

export interface MeetingReportWorkflowOutput {
  reportId?: Uuid | null;
  summary: string;
  decisionCount: number;
  actionItemCount: number;
  riskCount: number;
}

export interface ReviewAnalysisWorkflowOutput {
  analysisId?: Uuid | null;
  riskLevel: PRAnalysisSummary["riskLevel"];
  okCount: number;
  discussCount: number;
  riskCount: number;
  conclusion?: string | null;
}

export interface PlanningWorkflowOutput {
  draftId?: Uuid | null;
  featureDraftCount: number;
  milestoneDraftCount: number;
  riskCount: number;
}

export interface TaskDraftWorkflowOutput {
  draftCount: number;
  taskDraftIds?: Uuid[];
}

export interface GithubIssueDraftWorkflowOutput {
  issueDraftCount: number;
  issueIds?: Uuid[];
}

export interface OrchestratorRunWorkflowOutput {
  childRunIds: Uuid[];
  actionCount: number;
  summary?: string | null;
}

export type AgentWorkflowOutput =
  | MeetingReportWorkflowOutput
  | ReviewAnalysisWorkflowOutput
  | PlanningWorkflowOutput
  | TaskDraftWorkflowOutput
  | GithubIssueDraftWorkflowOutput
  | OrchestratorRunWorkflowOutput;

export interface AgentResultMessageBase<
  TWorkflowType extends AgentWorkflowType,
  TOutput extends AgentWorkflowOutput,
> {
  jobId: Uuid;
  runId: Uuid;
  workflowType: TWorkflowType;
  status: "succeeded" | "failed";
  output: TOutput;
  actions: AgentAction[];
  trace: AgentTraceEntry[];
  error?: AgentResultError | null;
  finishedAt: DateTimeString;
}

export type MeetingReportAgentResultMessage = AgentResultMessageBase<
  "meeting.report.generate",
  MeetingReportWorkflowOutput
>;
export type ReviewAnalysisAgentResultMessage = AgentResultMessageBase<
  "review.analysis.generate",
  ReviewAnalysisWorkflowOutput
>;
export type PlanningAgentResultMessage = AgentResultMessageBase<
  "planning.generate",
  PlanningWorkflowOutput
>;
export type TaskDraftAgentResultMessage = AgentResultMessageBase<
  "task.draft.generate",
  TaskDraftWorkflowOutput
>;
export type GithubIssueDraftAgentResultMessage = AgentResultMessageBase<
  "github.issue.draft.generate",
  GithubIssueDraftWorkflowOutput
>;
export type OrchestratorRunAgentResultMessage = AgentResultMessageBase<
  "orchestrator.run",
  OrchestratorRunWorkflowOutput
>;

export type AgentResultMessage =
  | MeetingReportAgentResultMessage
  | ReviewAnalysisAgentResultMessage
  | PlanningAgentResultMessage
  | TaskDraftAgentResultMessage
  | GithubIssueDraftAgentResultMessage
  | OrchestratorRunAgentResultMessage;

export interface ProjectPlanDraftSummary {
  id: Uuid;
  workspaceId: Uuid;
  goal?: string | null;
  targetUser?: string | null;
  status: "draft" | "reviewing" | "approved" | "rejected";
  featureDraftCount: number;
  milestoneDraftCount: number;
  riskCount: number;
  createdByMemberId?: Uuid | null;
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
}

export type ProjectPlanDraftSummaryPage =
  PaginatedResult<ProjectPlanDraftSummary>;

export type NotificationType =
  | "task.status_changed"
  | "task.assigned"
  | "github.issue.created"
  | "github.pull_request.linked"
  | "meeting.report_generated"
  | "review.analysis_completed"
  | "planning.draft_approved"
  | "agent.action_required";

export interface NotificationCreateRequest {
  userId: Uuid;
  type: NotificationType;
  title: string;
  linkedEntityType?: CrossDomainEntityType | null;
  linkedEntityId?: Uuid | null;
}

export interface SharedFileRef {
  id: Uuid;
  workspaceId: Uuid;
  filename: string;
  fileType?: string | null;
  url: string;
  linkedEntityType?: CrossDomainEntityType | null;
  linkedEntityId?: Uuid | null;
}
