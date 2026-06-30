import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  MEETING_ACTION_ITEM_TASK_DRAFT_SOURCE,
  type MeetingActionItemTaskDraftSource,
} from "../meeting/public/meeting-action-item-taskdraft-source.adapter";
import {
  AGENT_WORKFLOW_TYPES,
  DEFAULT_AGENT_WORKFLOW_VERSION,
  type AgentWorkflowType,
} from "./agent-registry.types";
import {
  AGENT_ACTION_SOURCES,
  AGENT_ACTION_STATUSES,
  AGENT_ACTION_TYPES,
  TASK_PRIORITIES,
  type AgentAction,
  type AgentActionSource,
  type AgentActionStatus,
  type AgentActionType,
  type AgentContextRef,
  type AgentError,
  type AgentJobMessage,
  type AgentOwnerActionExecutor,
  type AgentRecommendation,
  type AgentResultMessage,
  type AgentRunDetail,
  type AgentRunStatusResponse,
  type AgentRunStepDetail,
  type AgentTokenUsage,
  type CreateLocalAgentRunInput,
  type RuntimeClock,
  type TaskPriority,
} from "./agent-runtime.types";

const LOCAL_RUNNER_MODEL = "local-runner";
const DEFAULT_TASK_PRIORITY: TaskPriority = "medium";
const TASK_DRAFT_SOURCE_TYPES = [
  "meeting_action_item",
  "planning_feature",
  "agent_recommendation",
  "manual",
] as const;

const systemClock: RuntimeClock = {
  now: () => new Date().toISOString(),
  uuid: () => randomUUID(),
};

@Injectable()
export class AgentRuntimeService {
  private readonly runs = new Map<string, AgentRunDetail>();

  constructor(
    @Optional()
    @Inject(MEETING_ACTION_ITEM_TASK_DRAFT_SOURCE)
    private readonly meetingActionItemTaskDraftSource?: MeetingActionItemTaskDraftSource,
  ) {}

  createAgentJob(
    body: CreateLocalAgentRunInput,
    clock: RuntimeClock = systemClock,
  ): AgentJobMessage {
    const input = parseCreateLocalRunInput(body);
    const requestedAt = clock.now();
    const job: AgentJobMessage = {
      jobId: clock.uuid(),
      runId: clock.uuid(),
      workflowType: input.workflowType,
      workflowVersion: input.workflowVersion,
      workspaceId: input.workspaceId,
      actorMemberId: input.actorMemberId,
      input: input.input,
      contextRefs: input.contextRefs,
      requestedAt,
    };
    const run: AgentRunDetail = {
      id: job.runId,
      workflowId: clock.uuid(),
      workflowType: job.workflowType,
      workflowVersion: job.workflowVersion,
      workspaceId: job.workspaceId,
      actorMemberId: job.actorMemberId,
      status: "pending",
      actionRequired: false,
      pendingActionCount: 0,
      input: job.input,
      output: null,
      error: null,
      tokenUsage: null,
      steps: [],
      actions: [],
      trace: [],
      startedAt: null,
      finishedAt: null,
      createdAt: requestedAt,
      updatedAt: requestedAt,
    };

    this.runs.set(run.id, run);
    this.addTrace(
      run,
      null,
      "agent job created",
      {
        jobId: job.jobId,
        workflowType: job.workflowType,
      },
      clock,
    );

    return clone(job);
  }

  runLocalJob(
    job: AgentJobMessage,
    clock: RuntimeClock = systemClock,
  ): AgentResultMessage {
    try {
      assertAgentJobMessage(job);
      const localResult = buildLocalWorkflowResult(
        job,
        clock,
        this.meetingActionItemTaskDraftSource,
      );
      return clone({
        jobId: job.jobId,
        runId: job.runId,
        status: "succeeded",
        output: localResult.output,
        actions: localResult.actions,
        trace: localResult.trace,
        error: null,
        finishedAt: clock.now(),
      } satisfies AgentResultMessage);
    } catch (error) {
      return clone({
        jobId: readString(job.jobId) ?? clock.uuid(),
        runId: readString(job.runId) ?? clock.uuid(),
        status: "failed",
        output: {},
        actions: [],
        trace: [
          {
            stepName: "local_runner",
            message: "local workflow failed",
            metadata: {
              workflowType: readString(job.workflowType) ?? null,
            },
          },
        ],
        error: normalizeError(error),
        finishedAt: clock.now(),
      } satisfies AgentResultMessage);
    }
  }

  applyAgentResult(
    result: AgentResultMessage,
    clock: RuntimeClock = systemClock,
  ): AgentRunDetail {
    assertAgentResultMessage(result);
    const run = this.requireRun(result.runId);
    const stepStartedAt = run.startedAt ?? run.createdAt;
    const step: AgentRunStepDetail = {
      id: clock.uuid(),
      runId: run.id,
      stepName: "local_runner",
      status: result.status === "succeeded" ? "succeeded" : "failed",
      input: {
        jobId: result.jobId,
        workflowType: run.workflowType,
        input: run.input,
      },
      output: result.status === "succeeded" ? result.output : null,
      error: result.error,
      tokenUsage:
        result.status === "succeeded"
          ? localTokenUsage(JSON.stringify(run.input), result.output)
          : null,
      startedAt: stepStartedAt,
      finishedAt: result.finishedAt,
      createdAt: stepStartedAt,
    };

    run.status = "running";
    run.startedAt = run.startedAt ?? stepStartedAt;
    run.updatedAt = result.finishedAt;
    run.steps.push(step);

    for (const trace of result.trace) {
      this.addTrace(run, step.id, trace.message, trace.metadata, clock);
    }

    if (result.status === "failed") {
      run.output = null;
      run.error = result.error ?? {
        code: "AGENT_LOCAL_RUNNER_FAILED",
        message: "Local agent runner failed",
      };
      run.tokenUsage = null;
      run.finishedAt = result.finishedAt;
      run.status = "failed";
      return cloneRun(run);
    }

    run.output = result.output;
    run.error = null;
    run.tokenUsage = step.tokenUsage;
    run.actions.push(
      ...result.actions.map((action) => normalizeAction(action)),
    );
    this.surfaceConfirmableActions(run, step.id, clock);
    this.refreshRunState(run, result.finishedAt);
    return cloneRun(run);
  }

  createLocalRun(
    body: CreateLocalAgentRunInput,
    clock: RuntimeClock = systemClock,
  ): AgentRunDetail {
    const job = this.createAgentJob(body, clock);
    const result = this.runLocalJob(job, clock);
    return this.applyAgentResult(result, clock);
  }

  getRun(runId: string): AgentRunDetail {
    return cloneRun(this.requireRun(runId));
  }

  getRunStatus(runId: string): AgentRunStatusResponse {
    return toRunStatusResponse(this.requireRun(runId));
  }

  listRecommendations(workspaceId: string): AgentRecommendation[] {
    return [...this.runs.values()]
      .filter((run) => run.workspaceId === workspaceId)
      .flatMap((run) =>
        run.actions
          .filter((action) => action.status === "waiting_confirmation")
          .map((action) => ({
            id: action.id,
            workspaceId,
            owner: "agent_runtime" as const,
            source: action.source,
            title: toRecommendationTitle(action),
            summary: toRecommendationSummary(action),
            status: action.status,
            createdAt: run.createdAt,
          })),
      );
  }

  confirmAction(
    actionId: string,
    actorMemberId: string,
    clock: RuntimeClock = systemClock,
  ): AgentAction {
    const { run, action } = this.requireAction(actionId);
    if (action.status !== "waiting_confirmation") {
      throw new BadRequestException("Agent action is not waiting confirmation");
    }

    const confirmedAt = clock.now();
    action.status = "confirmed";
    action.confirmedByMemberId = parseRequiredString(
      actorMemberId,
      "actorMemberId",
    );
    action.confirmedAt = confirmedAt;
    action.executedAt = null;
    this.addTrace(
      run,
      null,
      "agent action confirmed",
      {
        actionId: action.id,
        actionType: action.type,
      },
      clock,
    );
    this.refreshRunState(run, confirmedAt);
    return clone(action);
  }

  async executeConfirmedAction(
    actionId: string,
    executor: AgentOwnerActionExecutor,
    clock: RuntimeClock = systemClock,
  ): Promise<AgentAction> {
    const { run, action } = this.requireAction(actionId);
    if (action.status !== "confirmed") {
      throw new BadRequestException("Agent action is not confirmed");
    }

    try {
      const result = await executor.execute(clone(action));
      if (result.status === "deferred") {
        const deferredAt = clock.now();
        this.addTrace(
          run,
          null,
          "agent action execution deferred",
          {
            actionId: action.id,
            actionType: action.type,
            result,
          },
          clock,
        );
        this.refreshRunState(run, deferredAt);
        return clone(action);
      }
      if (result.status === "failed") {
        throw new BadRequestException(
          result.errorMessage ?? "Owner action executor failed",
        );
      }

      const executedAt = clock.now();
      action.status = "executed";
      action.executedAt = executedAt;
      this.addTrace(
        run,
        null,
        "agent action executed by owner boundary",
        {
          actionId: action.id,
          actionType: action.type,
          result,
        },
        clock,
      );
      this.refreshRunState(run, executedAt);
      return clone(action);
    } catch (error) {
      const failedAt = clock.now();
      action.status = "failed";
      action.executedAt = null;
      const normalizedError = normalizeError(error);
      this.addTrace(
        run,
        null,
        "agent action execution failed",
        {
          actionId: action.id,
          actionType: action.type,
          error: normalizedError,
        },
        clock,
      );
      this.refreshRunState(run, failedAt, normalizedError);
      return clone(action);
    }
  }

  rejectAction(
    actionId: string,
    clock: RuntimeClock = systemClock,
  ): AgentAction {
    const { run, action } = this.requireAction(actionId);
    if (action.status !== "draft" && action.status !== "waiting_confirmation") {
      throw new BadRequestException("Agent action is not waiting rejection");
    }

    const rejectedAt = clock.now();
    action.status = "rejected";
    action.confirmedByMemberId = null;
    action.confirmedAt = null;
    action.executedAt = null;
    this.addTrace(
      run,
      null,
      "agent action rejected",
      {
        actionId: action.id,
        actionType: action.type,
      },
      clock,
    );
    this.refreshRunState(run, rejectedAt);
    return clone(action);
  }

  private requireRun(runId: string) {
    const run = this.runs.get(runId);
    if (!run) {
      throw new NotFoundException("Agent run was not found");
    }
    return run;
  }

  private requireAction(actionId: string) {
    for (const run of this.runs.values()) {
      const action = run.actions.find((candidate) => candidate.id === actionId);
      if (action) {
        return { run, action };
      }
    }

    throw new NotFoundException("Agent action was not found");
  }

  private surfaceConfirmableActions(
    run: AgentRunDetail,
    stepId: string,
    clock: RuntimeClock,
  ) {
    for (const action of run.actions) {
      if (action.requiresConfirmation && action.status === "draft") {
        action.status = "waiting_confirmation";
        this.addTrace(
          run,
          stepId,
          "agent action waiting for confirmation",
          {
            actionId: action.id,
            actionType: action.type,
            from: "draft",
            to: "waiting_confirmation",
          },
          clock,
        );
      }
      if (!action.requiresConfirmation && action.status === "draft") {
        action.status = "executed";
        action.executedAt = clock.now();
        this.addTrace(
          run,
          stepId,
          "agent action executed without side effect",
          {
            actionId: action.id,
            actionType: action.type,
          },
          clock,
        );
      }
    }
  }

  private addTrace(
    run: AgentRunDetail,
    stepId: string | null,
    message: string,
    metadata: Record<string, unknown>,
    clock: RuntimeClock,
  ) {
    run.trace.push({
      id: clock.uuid(),
      runId: run.id,
      stepId,
      message,
      metadata,
      createdAt: clock.now(),
    });
  }

  private refreshRunState(
    run: AgentRunDetail,
    now: string,
    error: AgentError | null = null,
  ) {
    const waitingCount = run.actions.filter(
      (action) => action.status === "waiting_confirmation",
    ).length;
    const confirmedCount = run.actions.filter(
      (action) => action.status === "confirmed",
    ).length;
    const hasFailedAction = run.actions.some(
      (action) => action.status === "failed",
    );

    run.pendingActionCount = waitingCount + confirmedCount;
    run.actionRequired = waitingCount > 0;
    run.updatedAt = now;

    if (error || hasFailedAction) {
      run.status = "failed";
      run.error = error ?? {
        code: "AGENT_ACTION_EXECUTION_FAILED",
        message: "One or more Agent actions failed",
      };
      run.finishedAt = now;
      return;
    }

    if (waitingCount > 0) {
      run.status = "requires_confirmation";
      run.error = null;
      run.finishedAt = null;
      return;
    }

    if (confirmedCount > 0) {
      run.status = "running";
      run.error = null;
      run.finishedAt = null;
      return;
    }

    run.status = "succeeded";
    run.error = null;
    run.finishedAt = now;
  }
}

function buildLocalWorkflowResult(
  job: AgentJobMessage,
  clock: RuntimeClock,
  meetingActionItemTaskDraftSource?: MeetingActionItemTaskDraftSource,
): Pick<AgentResultMessage, "output" | "actions" | "trace"> {
  switch (job.workflowType) {
    case "task.draft.generate":
      return buildTaskDraftGenerateResult(job, clock);
    case "meeting.action-item.to-task-draft":
      return buildMeetingActionItemToTaskDraftResult(
        job,
        clock,
        meetingActionItemTaskDraftSource,
      );
    case "meeting.report.generate":
      return buildMeetingReportGenerateResult(job, clock);
    case "planning.generate":
      return buildPlanningGenerateResult(job, clock);
    case "review.analysis.generate":
      return buildReviewAnalysisGenerateResult(job, clock);
    case "github.issue.draft.generate":
      return buildGithubIssueDraftGenerateResult(job, clock);
    case "orchestrator.run":
      return buildOrchestratorResult(job, clock);
    default:
      throw new BadRequestException("workflowType is invalid");
  }
}

function buildMeetingActionItemToTaskDraftResult(
  job: AgentJobMessage,
  clock: RuntimeClock,
  meetingActionItemTaskDraftSource?: MeetingActionItemTaskDraftSource,
): Pick<AgentResultMessage, "output" | "actions" | "trace"> {
  if (!meetingActionItemTaskDraftSource) {
    throw new BadRequestException(
      "Meeting ActionItem TaskDraft source adapter is unavailable",
    );
  }

  const meetingId = parseRequiredString(job.input.meetingId, "meetingId");
  const actionItemId = parseRequiredString(
    job.input.actionItemId,
    "actionItemId",
  );
  const sourceResult = meetingActionItemTaskDraftSource.createTaskDraftPayload({
    workspaceId: job.workspaceId,
    meetingId,
    actionItemId,
  });
  const payload = { ...sourceResult.payload };

  return {
    output: {
      summary:
        "One Meeting ActionItem TaskCreateDraft action was prepared by local runner.",
      meetingId: sourceResult.meetingId,
      reportId: sourceResult.reportId,
      actionItemId: sourceResult.actionItemId,
      taskCreateDraft: payload,
    },
    actions: [
      createDraftAction(job, clock, "task.create.draft", "meeting", payload),
    ],
    trace: [
      {
        stepName: "local_runner",
        message:
          "meeting action item local runner prepared TaskCreateDraft payload",
        metadata: {
          meetingId: sourceResult.meetingId,
          actionItemId: sourceResult.actionItemId,
        },
      },
    ],
  };
}

function buildTaskDraftGenerateResult(
  job: AgentJobMessage,
  clock: RuntimeClock,
): Pick<AgentResultMessage, "output" | "actions" | "trace"> {
  const message = readString(job.input.message) ?? "Break work into TaskDraft";
  const sourceId = clock.uuid();
  const payload = {
    workspaceId: job.workspaceId,
    sourceType: "agent_recommendation",
    sourceId,
    title: toTitleFromMessage(message),
    description: `Generated from Agent command: ${message}`,
    assigneeMemberId: null,
    priority: DEFAULT_TASK_PRIORITY,
    dueDate: null,
  };

  return {
    output: {
      summary: "One TaskCreateDraft action was prepared by local runner.",
      taskDrafts: [
        {
          id: sourceId,
          ...payload,
        },
      ],
    },
    actions: [
      createDraftAction(
        job,
        clock,
        "task.create.draft",
        "orchestrator",
        payload,
      ),
    ],
    trace: [
      {
        stepName: "local_runner",
        message: "task draft local runner prepared TaskCreateDraft payload",
        metadata: {
          taskDraftCount: 1,
        },
      },
    ],
  };
}

function buildMeetingReportGenerateResult(
  job: AgentJobMessage,
  clock: RuntimeClock,
): Pick<AgentResultMessage, "output" | "actions" | "trace"> {
  const meetingId =
    readString(job.input.meetingId) ??
    job.contextRefs.find((ref) => ref.type === "meeting")?.id ??
    clock.uuid();
  const actionItemId = clock.uuid();
  const output = {
    summary: "Task handoff scope was converted into a report artifact draft.",
    decisions: [
      {
        content: "Task draft conversion stays behind an owner API adapter.",
        status: "decided",
        linkedTaskId: null,
      },
    ],
    risks: [
      {
        content:
          "Task API integration must stay out of this Agent skeleton PR.",
        severity: "medium",
        sortOrder: 0,
      },
    ],
    nextAgendas: [
      {
        title: "Wire TaskDraft owner API in a later integration PR",
        sortOrder: 0,
      },
    ],
    actionItems: [
      {
        title: "Prepare TaskCreateDraft adapter boundary",
        description: "Keep meeting action items as TaskCreateDraft payloads.",
        assigneeSuggestionMemberId: null,
        dueDateSuggestion: null,
        priority: DEFAULT_TASK_PRIORITY,
      },
    ],
  };

  return {
    output: {
      meetingId,
      ...output,
    },
    actions: [
      createDraftAction(job, clock, "task.create.draft", "meeting", {
        workspaceId: job.workspaceId,
        sourceType: "meeting_action_item",
        sourceId: actionItemId,
        title: "Prepare TaskCreateDraft adapter boundary",
        description: "Keep meeting action items as TaskCreateDraft payloads.",
        assigneeMemberId: null,
        priority: DEFAULT_TASK_PRIORITY,
        dueDate: null,
      }),
    ],
    trace: [
      {
        stepName: "local_runner",
        message: "meeting report local runner prepared report artifact",
        metadata: {
          meetingId,
          actionItemCount: 1,
        },
      },
    ],
  };
}

function buildPlanningGenerateResult(
  job: AgentJobMessage,
  clock: RuntimeClock,
): Pick<AgentResultMessage, "output" | "actions" | "trace"> {
  const message = readString(job.input.message) ?? "Build a focused MVP";
  const featureId = clock.uuid();
  const output = {
    summary: "Project planning draft artifact was prepared.",
    projectBrief: {
      oneLine: message,
      problem: "The team needs a safe MVP baseline before integration.",
      targetUsers: ["beginner development team"],
      goals: ["working MVP vertical slice"],
      constraints: ["no cross-domain source writes before approval"],
    },
    techStackOptions: [
      {
        name: "Stable TypeScript MVP",
        stack: {
          frontend: "Next.js",
          backend: "NestJS",
          database: "PostgreSQL",
        },
        reason: "Matches the current PILO app split.",
        risks: ["Planning HTTP APIs are Deferred."],
      },
    ],
    featureCandidates: [
      {
        id: featureId,
        title: "Approval based TaskDraft flow",
        scope: "must",
        reason: "Agent-generated changes require user confirmation.",
      },
    ],
  };

  return {
    output,
    actions: [
      createDraftAction(job, clock, "task.create.draft", "planning", {
        workspaceId: job.workspaceId,
        sourceType: "planning_feature",
        sourceId: featureId,
        title: "Approval based TaskDraft flow",
        description: "Keep generated work as a TaskCreateDraft payload.",
        assigneeMemberId: null,
        priority: "high",
        dueDate: null,
      }),
    ],
    trace: [
      {
        stepName: "local_runner",
        message: "planning local runner prepared draft artifacts",
        metadata: {
          featureDraftCount: 1,
        },
      },
    ],
  };
}

function buildReviewAnalysisGenerateResult(
  job: AgentJobMessage,
  clock: RuntimeClock,
): Pick<AgentResultMessage, "output" | "actions" | "trace"> {
  const pullRequestId = readString(job.input.pullRequestId) ?? clock.uuid();
  return {
    output: {
      summary:
        "Review analysis action is prepared behind a Review owner boundary.",
      pullRequestId,
    },
    actions: [
      createDraftAction(job, clock, "review.analysis.generate", "review", {
        workspaceId: job.workspaceId,
        pullRequestId,
      }),
    ],
    trace: [
      {
        stepName: "local_runner",
        message: "review local runner prepared owner action",
        metadata: {
          pullRequestId,
        },
      },
    ],
  };
}

function buildGithubIssueDraftGenerateResult(
  job: AgentJobMessage,
  clock: RuntimeClock,
): Pick<AgentResultMessage, "output" | "actions" | "trace"> {
  const repositoryId = readString(job.input.repositoryId) ?? clock.uuid();
  const taskId = readString(job.input.taskId) ?? null;
  return {
    output: {
      summary:
        "GitHub issue creation is prepared behind a GitHub owner boundary.",
      repositoryId,
      taskId,
    },
    actions: [
      createDraftAction(job, clock, "github.issue.create", "github", {
        workspaceId: job.workspaceId,
        repositoryId,
        taskId,
        title: readString(job.input.title) ?? "Create GitHub Issue from Task",
        body:
          readString(job.input.body) ??
          "Generated by PILO Agent after member confirmation.",
        labels: [],
      }),
    ],
    trace: [
      {
        stepName: "local_runner",
        message: "github local runner prepared deferred issue action",
        metadata: {
          repositoryId,
          taskId,
        },
      },
    ],
  };
}

function buildOrchestratorResult(
  job: AgentJobMessage,
  clock: RuntimeClock,
): Pick<AgentResultMessage, "output" | "actions" | "trace"> {
  const message = readString(job.input.message) ?? "Recommend next action";
  if (message.toLowerCase().includes("task")) {
    return buildTaskDraftGenerateResult(
      {
        ...job,
        workflowType: "task.draft.generate",
        input: {
          message,
        },
      },
      clock,
    );
  }

  return {
    output: {
      summary: "Next step: run planning.generate or task.draft.generate.",
      recommendations: [
        {
          title: "Run project planning",
          reason:
            "Planning can prepare approval-based TaskCreateDraft actions.",
        },
      ],
    },
    actions: [],
    trace: [
      {
        stepName: "local_runner",
        message: "orchestrator local runner returned read-only guidance",
        metadata: {},
      },
    ],
  };
}

function createDraftAction(
  job: AgentJobMessage,
  clock: RuntimeClock,
  type: AgentActionType,
  source: AgentActionSource,
  payload: Record<string, unknown>,
): AgentAction {
  return normalizeAction({
    id: clock.uuid(),
    runId: job.runId,
    type,
    source,
    requiresConfirmation: true,
    payload,
    status: "draft",
    confirmedByMemberId: null,
    confirmedAt: null,
    executedAt: null,
  });
}

function normalizeAction(action: AgentAction): AgentAction {
  const normalized: AgentAction = {
    id: parseRequiredString(action.id, "action.id"),
    runId: parseRequiredString(action.runId, "action.runId"),
    type: parseActionType(action.type),
    source: parseActionSource(action.source),
    requiresConfirmation: parseBoolean(
      action.requiresConfirmation,
      "action.requiresConfirmation",
    ),
    payload: parsePayload(action.type, action.payload),
    status: parseActionStatus(action.status),
    confirmedByMemberId: parseNullableString(
      action.confirmedByMemberId,
      "action.confirmedByMemberId",
    ),
    confirmedAt: parseNullableString(action.confirmedAt, "action.confirmedAt"),
    executedAt: parseNullableString(action.executedAt, "action.executedAt"),
  };

  if (
    normalized.status === "draft" ||
    normalized.status === "waiting_confirmation"
  ) {
    normalized.confirmedByMemberId = null;
    normalized.confirmedAt = null;
    normalized.executedAt = null;
  }

  return normalized;
}

function parsePayload(
  actionType: AgentActionType,
  payload: unknown,
): Record<string, unknown> {
  assertObject(payload, "action.payload");
  switch (actionType) {
    case "task.create.draft":
      return parseTaskCreateDraftPayload(payload);
    case "task.update.status":
      return parseStrictObject(payload, "task.update.status payload", [
        "workspaceId",
        "taskId",
        "status",
      ]);
    case "github.issue.create":
      return parseStrictObject(payload, "github.issue.create payload", [
        "workspaceId",
        "repositoryId",
        "taskId",
        "title",
        "body",
        "labels",
      ]);
    case "meeting.report.generate":
      return parseStrictObject(payload, "meeting.report.generate payload", [
        "workspaceId",
        "meetingId",
      ]);
    case "review.analysis.generate":
      return parseStrictObject(payload, "review.analysis.generate payload", [
        "workspaceId",
        "pullRequestId",
      ]);
    case "planning.approve":
      return parseStrictObject(payload, "planning.approve payload", [
        "workspaceId",
        "draftId",
      ]);
    default:
      return assertNever(actionType);
  }
}

function parseTaskCreateDraftPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const result = parseStrictObject(payload, "task.create.draft payload", [
    "workspaceId",
    "sourceType",
    "sourceId",
    "title",
    "description",
    "assigneeMemberId",
    "priority",
    "dueDate",
  ]);
  parseRequiredString(result.workspaceId, "payload.workspaceId");
  parseRequiredString(result.title, "payload.title");

  const sourceType = parseNullableString(
    result.sourceType,
    "payload.sourceType",
  );
  const sourceId = parseNullableString(result.sourceId, "payload.sourceId");
  if ((sourceType && !sourceId) || (!sourceType && sourceId)) {
    throw new BadRequestException("sourceType and sourceId must be paired");
  }
  if (
    sourceType &&
    !(TASK_DRAFT_SOURCE_TYPES as readonly string[]).includes(sourceType)
  ) {
    throw new BadRequestException("payload.sourceType is invalid");
  }

  const priority = parseNullableString(result.priority, "payload.priority");
  if (priority && !(TASK_PRIORITIES as readonly string[]).includes(priority)) {
    throw new BadRequestException("payload.priority is invalid");
  }

  return result;
}

function parseCreateLocalRunInput(body: CreateLocalAgentRunInput) {
  assertObject(body, "Agent local run input");
  return {
    workspaceId: parseRequiredString(body.workspaceId, "workspaceId"),
    actorMemberId: parseRequiredString(body.actorMemberId, "actorMemberId"),
    workflowType: parseWorkflowType(body.workflowType),
    workflowVersion:
      parseNullableString(body.workflowVersion, "workflowVersion") ??
      DEFAULT_AGENT_WORKFLOW_VERSION,
    input: parseOptionalObject(body.input, "input") ?? {},
    contextRefs: parseContextRefs(body.contextRefs),
  };
}

function parseContextRefs(value: unknown): AgentContextRef[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new BadRequestException("contextRefs must be an array");
  }
  return value.map((item) => {
    assertObject(item, "contextRefs item");
    return {
      type: parseRequiredString(item.type, "contextRefs.type"),
      id: parseRequiredString(item.id, "contextRefs.id"),
    };
  });
}

function parseWorkflowType(value: unknown): AgentWorkflowType {
  if (
    typeof value !== "string" ||
    !(AGENT_WORKFLOW_TYPES as readonly string[]).includes(value)
  ) {
    throw new BadRequestException("workflowType is invalid");
  }
  return value as AgentWorkflowType;
}

function parseActionType(value: unknown): AgentActionType {
  if (
    typeof value !== "string" ||
    !(AGENT_ACTION_TYPES as readonly string[]).includes(value)
  ) {
    throw new BadRequestException("Agent action type is invalid");
  }
  return value as AgentActionType;
}

function parseActionSource(value: unknown): AgentActionSource {
  if (
    typeof value !== "string" ||
    !(AGENT_ACTION_SOURCES as readonly string[]).includes(value)
  ) {
    throw new BadRequestException("Agent action source is invalid");
  }
  return value as AgentActionSource;
}

function parseActionStatus(value: unknown): AgentActionStatus {
  if (
    typeof value !== "string" ||
    !(AGENT_ACTION_STATUSES as readonly string[]).includes(value)
  ) {
    throw new BadRequestException("Agent action status is invalid");
  }
  return value as AgentActionStatus;
}

function assertAgentJobMessage(job: AgentJobMessage) {
  assertObject(job, "AgentJobMessage");
  parseRequiredString(job.jobId, "jobId");
  parseRequiredString(job.runId, "runId");
  parseWorkflowType(job.workflowType);
  parseRequiredString(job.workflowVersion, "workflowVersion");
  parseRequiredString(job.workspaceId, "workspaceId");
  parseRequiredString(job.actorMemberId, "actorMemberId");
  parseOptionalObject(job.input, "input");
  parseContextRefs(job.contextRefs);
  parseRequiredString(job.requestedAt, "requestedAt");
}

function assertAgentResultMessage(result: AgentResultMessage) {
  assertObject(result, "AgentResultMessage");
  parseRequiredString(result.jobId, "result.jobId");
  parseRequiredString(result.runId, "result.runId");
  if (result.status !== "succeeded" && result.status !== "failed") {
    throw new BadRequestException("result.status is invalid");
  }
  parseOptionalObject(result.output, "result.output");
  if (!Array.isArray(result.actions)) {
    throw new BadRequestException("result.actions must be an array");
  }
  if (!Array.isArray(result.trace)) {
    throw new BadRequestException("result.trace must be an array");
  }
  if (result.status === "succeeded" && result.error !== null) {
    throw new BadRequestException("succeeded result error must be null");
  }
  if (result.status === "failed" && !result.error) {
    throw new BadRequestException("failed result requires error");
  }
  parseRequiredString(result.finishedAt, "result.finishedAt");
}

function parseStrictObject(
  value: Record<string, unknown>,
  name: string,
  allowedKeys: string[],
) {
  assertObject(value, name);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new BadRequestException(`${name} has unsupported field ${key}`);
    }
  }
  return { ...value };
}

function parseRequiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required`);
  }
  return value;
}

function parseNullableString(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new BadRequestException(`${field} must be a string or null`);
  }
  return value;
}

function parseBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw new BadRequestException(`${field} must be a boolean`);
  }
  return value;
}

function parseOptionalObject(value: unknown, field: string) {
  if (value === undefined || value === null) {
    return null;
  }
  assertObject(value, field);
  return { ...value };
}

function assertObject(
  value: unknown,
  field: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException(`${field} must be an object`);
  }
}

function toRunStatusResponse(run: AgentRunDetail): AgentRunStatusResponse {
  return {
    id: run.id,
    workspaceId: run.workspaceId,
    workflowType: run.workflowType,
    workflowVersion: run.workflowVersion,
    status: run.status,
    actionRequired: run.actionRequired,
    pendingActionCount: run.pendingActionCount,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    updatedAt: run.updatedAt,
    error: run.error,
  };
}

function toRecommendationTitle(action: AgentAction) {
  switch (action.type) {
    case "task.create.draft":
      return readString(action.payload.title) ?? "Create TaskDraft";
    case "task.update.status":
      return "Update Task status";
    case "github.issue.create":
      return "Create GitHub Issue";
    case "meeting.report.generate":
      return "Generate Meeting Report";
    case "review.analysis.generate":
      return "Generate PR analysis";
    case "planning.approve":
      return "Approve project plan";
    default:
      return assertNever(action.type);
  }
}

function toRecommendationSummary(action: AgentAction) {
  switch (action.type) {
    case "task.create.draft":
      return "A TaskCreateDraft payload is waiting for owner-boundary execution.";
    case "task.update.status":
      return "A Task status change is waiting for owner-boundary execution.";
    case "github.issue.create":
      return "GitHub Issue creation is Deferred in current runtime.";
    case "meeting.report.generate":
      return "Meeting report generation is behind the Meeting owner boundary.";
    case "review.analysis.generate":
      return "PR analysis is behind the Review owner boundary.";
    case "planning.approve":
      return "Planning approval is Deferred in current runtime.";
    default:
      return assertNever(action.type);
  }
}

function localTokenUsage(
  inputText: string,
  output: Record<string, unknown>,
): AgentTokenUsage {
  const inputTokens = Math.max(1, Math.ceil(inputText.length / 4));
  const outputTokens = Math.max(
    1,
    Math.ceil(JSON.stringify(output).length / 4),
  );
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    model: LOCAL_RUNNER_MODEL,
  };
}

function toTitleFromMessage(message: string) {
  return message.trim().length > 80
    ? `${message.trim().slice(0, 77)}...`
    : message.trim();
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizeError(error: unknown): AgentError {
  if (error instanceof Error) {
    return {
      code: error.name || "AGENT_ERROR",
      message: error.message || "Agent runtime failed",
    };
  }
  return {
    code: "AGENT_ERROR",
    message: "Agent runtime failed",
  };
}

function cloneRun(run: AgentRunDetail): AgentRunDetail {
  return clone(run);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertNever(value: never): never {
  throw new BadRequestException(`Unsupported value: ${String(value)}`);
}
