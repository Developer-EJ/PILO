from typing import Literal, NotRequired, TypedDict

Uuid = str
DateString = str
DateTimeString = str

AgentActionType = Literal[
    "task.create.draft",
    "task.update.status",
    "task.assign",
    "github.issue.create",
    "meeting.report.generate",
    "review.analysis.generate",
    "planning.approve",
]

AgentActionSource = Literal[
    "meeting",
    "task",
    "github",
    "review",
    "planning",
    "orchestrator",
]

AgentActionStatus = Literal[
    "draft",
    "waiting_confirmation",
    "confirmed",
    "executed",
    "rejected",
    "failed",
]

TaskStatus = Literal["todo", "in_progress", "in_review", "done", "blocked"]
AgentWorkflowType = Literal[
    "meeting.report.generate",
    "review.analysis.generate",
    "planning.generate",
    "task.draft.generate",
    "github.issue.draft.generate",
    "orchestrator.run",
]

ContractOwner = Literal[
    "auth",
    "workspace",
    "canvas",
    "task",
    "github",
    "progress",
    "meeting",
    "review",
    "agent",
    "planning",
    "common-system",
]

CrossDomainEntityType = Literal[
    "workspace",
    "workspace_member",
    "task",
    "github_repository",
    "github_issue",
    "github_pull_request",
    "meeting",
    "meeting_report",
    "meeting_action_item",
    "review_analysis",
    "review_node",
    "review_risk",
    "planning_draft",
    "canvas_board",
    "canvas_shape",
    "shared_file",
]

AgentContextType = CrossDomainEntityType | Literal["member"]

ReviewRiskType = Literal[
    "security",
    "logic",
    "performance",
    "test_gap",
    "maintainability",
    "contract",
    "migration",
    "ux",
    "other",
]

NotificationType = Literal[
    "task.status_changed",
    "task.assigned",
    "github.issue.created",
    "github.pull_request.linked",
    "meeting.report_generated",
    "review.analysis_completed",
    "planning.draft_approved",
    "agent.action_required",
]

ApiErrorCode = Literal[
    "validation_failed",
    "unauthorized",
    "forbidden",
    "not_found",
    "conflict",
    "rate_limited",
    "upstream_unavailable",
    "internal_error",
]

PaginationSort = Literal[
    "created_at_desc",
    "updated_at_desc",
    "priority_desc",
    "due_date_asc",
    "risk_desc",
]

WorkspacePermissionAction = Literal[
    "workspace.view",
    "workspace.manage",
    "task.view",
    "task.manage",
    "github.view",
    "github.manage",
    "meeting.view",
    "meeting.manage",
    "review.view",
    "review.manage",
    "agent.run",
    "agent.confirm_action",
    "planning.manage",
    "file.upload",
]


class ValidationErrorDetail(TypedDict):
    reason: str
    field: NotRequired[str | None]
    expected: NotRequired[str | None]


class ApiErrorBody(TypedDict):
    code: ApiErrorCode
    message: str
    details: NotRequired[list[ValidationErrorDetail]]
    traceId: NotRequired[str | None]


class ApiErrorResponse(TypedDict):
    error: ApiErrorBody


class PaginationQuery(TypedDict):
    cursor: NotRequired[str | None]
    limit: NotRequired[int]
    sort: NotRequired[PaginationSort]


class PageInfo(TypedDict):
    limit: int
    hasNextPage: bool
    nextCursor: NotRequired[str | None]


class WorkspacePermissionResolveRequest(TypedDict):
    action: WorkspacePermissionAction
    entityType: NotRequired[CrossDomainEntityType | None]
    entityId: NotRequired[Uuid | None]


class WorkspacePermissionDecision(TypedDict):
    workspaceId: Uuid
    actorMemberId: Uuid
    action: WorkspacePermissionAction
    allowed: bool
    reason: NotRequired[str | None]


class TaskCreateDraft(TypedDict):
    workspaceId: Uuid
    title: str
    sourceType: NotRequired[CrossDomainEntityType]
    sourceId: NotRequired[Uuid]
    description: NotRequired[str | None]
    assigneeMemberId: NotRequired[Uuid | None]
    priority: NotRequired[Literal["low", "medium", "high", "urgent"]]
    dueDate: NotRequired[DateString | None]


class TaskCreateDraftRequest(TypedDict):
    title: str
    sourceType: NotRequired[CrossDomainEntityType]
    sourceId: NotRequired[Uuid]
    description: NotRequired[str | None]
    assigneeMemberId: NotRequired[Uuid | None]
    priority: NotRequired[Literal["low", "medium", "high", "urgent"]]
    dueDate: NotRequired[DateString | None]


class GithubIssueSummary(TypedDict):
    id: Uuid
    repositoryId: Uuid
    number: int
    title: str
    state: Literal["open", "closed"]
    url: str
    labels: NotRequired[list[str]]
    linkedTaskId: NotRequired[Uuid | None]
    syncedAt: NotRequired[DateTimeString | None]


class GithubIssueSummaryPage(TypedDict):
    items: list[GithubIssueSummary]
    pageInfo: PageInfo


class PullRequestSummary(TypedDict):
    id: Uuid
    repositoryId: Uuid
    number: int
    title: str
    url: str
    state: Literal["open", "review_requested", "changes_requested", "merged", "closed"]
    authorLogin: NotRequired[str | None]
    branch: NotRequired[str | None]
    baseBranch: NotRequired[str | None]
    changedFilesCount: NotRequired[int]
    additions: NotRequired[int]
    deletions: NotRequired[int]
    linkedTaskIds: NotRequired[list[Uuid]]
    syncedAt: NotRequired[DateTimeString | None]


class PullRequestSummaryPage(TypedDict):
    items: list[PullRequestSummary]
    pageInfo: PageInfo


class ProjectPlanDraftSummary(TypedDict):
    id: Uuid
    workspaceId: Uuid
    status: Literal["draft", "reviewing", "approved", "rejected"]
    featureDraftCount: int
    milestoneDraftCount: int
    riskCount: int
    createdAt: DateTimeString
    updatedAt: DateTimeString
    goal: NotRequired[str | None]
    targetUser: NotRequired[str | None]
    createdByMemberId: NotRequired[Uuid | None]


class ProjectPlanDraftSummaryPage(TypedDict):
    items: list[ProjectPlanDraftSummary]
    pageInfo: PageInfo


class TaskStatusUpdateAction(TypedDict):
    taskId: Uuid
    status: TaskStatus
    reason: NotRequired[str | None]


class TaskAssignAction(TypedDict):
    taskId: Uuid
    assigneeMemberId: Uuid | None
    reason: NotRequired[str | None]


class GithubIssueCreateAction(TypedDict):
    repositoryId: Uuid
    title: str
    body: NotRequired[str | None]
    labels: NotRequired[list[str]]
    linkedTaskId: NotRequired[Uuid | None]


class MeetingReportGenerateAction(TypedDict):
    workspaceId: Uuid
    meetingId: Uuid


class ReviewAnalysisGenerateAction(TypedDict):
    workspaceId: Uuid
    pullRequestId: Uuid


class PlanningApproveAction(TypedDict):
    workspaceId: Uuid
    draftId: Uuid
    createTasks: NotRequired[bool]


AgentActionPayload = (
    TaskCreateDraft
    | TaskStatusUpdateAction
    | TaskAssignAction
    | GithubIssueCreateAction
    | MeetingReportGenerateAction
    | ReviewAnalysisGenerateAction
    | PlanningApproveAction
)


class AgentAction(TypedDict):
    type: AgentActionType
    source: AgentActionSource
    requiresConfirmation: bool
    payload: AgentActionPayload
    status: AgentActionStatus
    id: NotRequired[Uuid]
    runId: NotRequired[Uuid]
    confirmedByMemberId: NotRequired[Uuid | None]
    confirmedAt: NotRequired[DateTimeString | None]
    executedAt: NotRequired[DateTimeString | None]


class AgentActionPage(TypedDict):
    items: list[AgentAction]
    pageInfo: PageInfo


class AgentContextRef(TypedDict):
    type: AgentContextType
    id: Uuid


class MeetingReportWorkflowInput(TypedDict):
    meetingId: Uuid
    transcriptSourceFileId: NotRequired[Uuid | None]
    requestedSections: NotRequired[
        list[Literal["summary", "decisions", "action_items", "risks", "next_agenda"]]
    ]


class ReviewAnalysisWorkflowInput(TypedDict):
    pullRequestId: Uuid
    repositoryId: NotRequired[Uuid | None]
    analysisDepth: NotRequired[Literal["summary", "standard", "deep"]]


class PlanningWorkflowInput(TypedDict):
    goal: str
    draftId: NotRequired[Uuid | None]
    sourceDocumentIds: NotRequired[list[Uuid]]
    targetMilestoneCount: NotRequired[int]


class TaskDraftWorkflowInput(TypedDict):
    sourceType: CrossDomainEntityType
    sourceId: Uuid
    suggestedTitle: NotRequired[str | None]


class GithubIssueDraftWorkflowInput(TypedDict):
    repositoryId: Uuid
    sourceType: NotRequired[CrossDomainEntityType]
    sourceId: NotRequired[Uuid | None]
    title: NotRequired[str | None]
    body: NotRequired[str | None]
    labels: NotRequired[list[str]]


class OrchestratorRunWorkflowInput(TypedDict):
    objective: str
    allowedWorkflowTypes: NotRequired[
        list[
            Literal[
                "meeting.report.generate",
                "review.analysis.generate",
                "planning.generate",
                "task.draft.generate",
                "github.issue.draft.generate",
            ]
        ]
    ]
    contextRefs: NotRequired[list[AgentContextRef]]


AgentWorkflowInput = (
    MeetingReportWorkflowInput
    | ReviewAnalysisWorkflowInput
    | PlanningWorkflowInput
    | TaskDraftWorkflowInput
    | GithubIssueDraftWorkflowInput
    | OrchestratorRunWorkflowInput
)


class AgentJobMessage(TypedDict):
    jobId: Uuid
    runId: Uuid
    workflowType: AgentWorkflowType
    workflowVersion: str
    workspaceId: Uuid
    actorMemberId: Uuid
    input: AgentWorkflowInput
    requestedAt: DateTimeString
    contextRefs: NotRequired[list[AgentContextRef]]


class AgentTraceMetadata(TypedDict):
    sourceOwner: NotRequired[ContractOwner]
    model: NotRequired[str | None]
    promptTemplateId: NotRequired[str | None]
    tokenCount: NotRequired[int]
    elapsedMs: NotRequired[int]


class AgentTraceEntry(TypedDict):
    message: str
    stepName: NotRequired[str | None]
    metadata: NotRequired[AgentTraceMetadata]


class AgentResultError(TypedDict):
    message: str
    code: NotRequired[str | None]


class MeetingReportWorkflowOutput(TypedDict):
    summary: str
    decisionCount: int
    actionItemCount: int
    riskCount: int
    reportId: NotRequired[Uuid | None]


class ReviewAnalysisWorkflowOutput(TypedDict):
    riskLevel: Literal["low", "medium", "high", "critical"]
    okCount: int
    discussCount: int
    riskCount: int
    analysisId: NotRequired[Uuid | None]
    conclusion: NotRequired[str | None]


class PlanningWorkflowOutput(TypedDict):
    featureDraftCount: int
    milestoneDraftCount: int
    riskCount: int
    draftId: NotRequired[Uuid | None]


class TaskDraftWorkflowOutput(TypedDict):
    draftCount: int
    taskDraftIds: NotRequired[list[Uuid]]


class GithubIssueDraftWorkflowOutput(TypedDict):
    issueDraftCount: int
    issueIds: NotRequired[list[Uuid]]


class OrchestratorRunWorkflowOutput(TypedDict):
    childRunIds: list[Uuid]
    actionCount: int
    summary: NotRequired[str | None]


AgentWorkflowOutput = (
    MeetingReportWorkflowOutput
    | ReviewAnalysisWorkflowOutput
    | PlanningWorkflowOutput
    | TaskDraftWorkflowOutput
    | GithubIssueDraftWorkflowOutput
    | OrchestratorRunWorkflowOutput
)


class AgentResultMessage(TypedDict):
    jobId: Uuid
    runId: Uuid
    workflowType: AgentWorkflowType
    status: Literal["succeeded", "failed"]
    output: AgentWorkflowOutput
    actions: list[AgentAction]
    trace: list[AgentTraceEntry]
    finishedAt: DateTimeString
    error: NotRequired[AgentResultError | None]
