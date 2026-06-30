import {
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { JuhyungTaskService } from "../juhyung/juhyung-task.service";
import type {
  CreateTaskBody,
  CreateTaskDraftBody,
} from "../juhyung/juhyung-task.service";
import {
  WorkspaceAccessPublicService,
  type WorkspaceActor,
} from "../workspace/public/workspace-access-public.service";
import {
  AGENT_WORKFLOW_TYPES,
  DEFAULT_AGENT_WORKFLOW_VERSION,
} from "./agent-registry.types";
import { AgentRuntimeRepository } from "./agent-runtime.repository";
import {
  AgentActionDecisionInput,
  AgentActionDetail,
  AgentRunDetail,
  AgentRuntimeCreateInput,
  AgentRuntimeNotFoundError,
  AgentRuntimeValidationError,
} from "./agent-runtime.types";
import { createPlanningGenerateRun } from "./planning-local-runner";

interface PlanningOwnerApiResult {
  owner: "task";
  operation: "task.create";
  sourceDraftType: "feature";
  sourceDraftId: string;
  status: "succeeded" | "failed";
  targetEntityId: string | null;
  errorMessage: string | null;
}

interface OwnerActionExecution {
  action: AgentActionDetail;
  ownerApiResults: PlanningOwnerApiResult[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTerminalAction(action: AgentActionDetail) {
  return ["executed", "rejected", "failed"].includes(action.status);
}

function canApproveAction(action: AgentActionDetail) {
  return (
    action.requiresConfirmation && action.status === "waiting_confirmation"
  );
}

function canRejectAction(action: AgentActionDetail) {
  return (
    action.requiresConfirmation &&
    ["draft", "waiting_confirmation"].includes(action.status)
  );
}

function currentIsoTimestamp() {
  return new Date().toISOString();
}

function firstString(value: unknown) {
  return typeof value === "string" && value.trim().length ? value.trim() : null;
}

function isAuthorizationError(error: unknown) {
  if (!(error instanceof HttpException)) {
    return false;
  }

  const status = error.getStatus();

  return status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN;
}

function errorMessageFrom(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "Owner API execution failed";
}

@Injectable()
export class AgentRuntimeService {
  constructor(
    private readonly repository: AgentRuntimeRepository,
    private readonly workspaceAccess: WorkspaceAccessPublicService,
    @Optional() private readonly taskService?: JuhyungTaskService,
  ) {}

  async createRun(input: AgentRuntimeCreateInput) {
    if (!input.workspaceId.trim()) {
      throw new AgentRuntimeValidationError("workspaceId is required");
    }

    const currentMember = await this.workspaceAccess.requireWorkspaceMember(
      input.workspaceId,
      input.actor,
    );

    const body = isRecord(input.body) ? input.body : {};
    const workflowType =
      typeof body.workflowType === "string" ? body.workflowType : "";
    const workflowVersion =
      typeof body.workflowVersion === "string" && body.workflowVersion.trim()
        ? body.workflowVersion.trim()
        : DEFAULT_AGENT_WORKFLOW_VERSION;

    if (!AGENT_WORKFLOW_TYPES.includes(workflowType as never)) {
      throw new AgentRuntimeValidationError(
        "workflowType must be a supported Agent workflow",
      );
    }

    if (workflowType !== "planning.generate") {
      throw new AgentRuntimeValidationError(
        "Only planning.generate is available in the local MVP runner",
      );
    }

    const run = createPlanningGenerateRun({
      actorMemberId: currentMember.id,
      workspaceId: input.workspaceId,
      workflowVersion,
      rawInput: body.input,
      idFactory: randomUUID,
    });

    return this.repository.saveRun(run);
  }

  async getRun(runId: string, actor?: WorkspaceActor) {
    const run = await this.repository.findRun(runId);

    if (!run) {
      throw new AgentRuntimeNotFoundError("Agent run not found");
    }

    await this.workspaceAccess.requireWorkspaceMember(run.workspaceId, actor);

    return run;
  }

  async listWorkspaceActions(workspaceId: string, actor?: WorkspaceActor) {
    await this.workspaceAccess.requireWorkspaceMember(workspaceId, actor);

    return this.repository.listWorkspaceActions(workspaceId);
  }

  async approveAction(input: AgentActionDecisionInput) {
    return this.decideAction(input.actionId, "approve", input.actor);
  }

  async rejectAction(input: AgentActionDecisionInput) {
    return this.decideAction(input.actionId, "reject", input.actor);
  }

  private async decideAction(
    actionId: string,
    decision: "approve" | "reject",
    actor?: WorkspaceActor,
  ) {
    const run = await this.repository.findRunByActionId(actionId);

    if (!run) {
      throw new AgentRuntimeNotFoundError("Agent action not found");
    }

    const action = run.actions.find((candidate) => candidate.id === actionId);

    if (!action) {
      throw new AgentRuntimeNotFoundError("Agent action not found");
    }

    const currentMember = await this.workspaceAccess.requireWorkspaceMember(
      run.workspaceId,
      actor,
    );

    if (isTerminalAction(action)) {
      throw new AgentRuntimeValidationError(
        "Terminal Agent actions cannot change status",
      );
    }

    if (decision === "approve" && !canApproveAction(action)) {
      throw new AgentRuntimeValidationError(
        "Only waiting_confirmation Agent actions can be approved",
      );
    }

    if (decision === "reject" && !canRejectAction(action)) {
      throw new AgentRuntimeValidationError(
        "Only draft or waiting_confirmation Agent actions can be rejected",
      );
    }

    const decidedAt = currentIsoTimestamp();
    const execution: OwnerActionExecution =
      decision === "approve"
        ? await this.executeApprovedAction(
            run,
            {
              ...action,
              status: "confirmed",
              confirmedByMemberId: currentMember.id,
              confirmedAt: decidedAt,
              executedAt: null,
            },
            actor,
            decidedAt,
          )
        : {
            action: {
              ...action,
              status: "rejected",
              confirmedByMemberId: null,
              confirmedAt: null,
              executedAt: null,
            },
            ownerApiResults: [],
          };

    const nextRun = this.applyActionDecision(
      run,
      execution.action,
      decidedAt,
      execution.ownerApiResults,
    );

    return (await this.repository.saveRun(nextRun)).actions.find(
      (candidate) => candidate.id === actionId,
    );
  }

  private async executeApprovedAction(
    run: AgentRunDetail,
    action: AgentActionDetail,
    actor: WorkspaceActor | undefined,
    decidedAt: string,
  ): Promise<OwnerActionExecution> {
    if (action.type === "planning.approve") {
      return {
        action: {
          ...action,
          status: "executed",
          executedAt: decidedAt,
        },
        ownerApiResults: [],
      };
    }

    if (action.type === "task.create") {
      return this.executeTaskCreateAction(run, action, actor, decidedAt);
    }

    if (action.type === "task.create.draft") {
      return this.executeTaskDraftAction(run, action, actor, decidedAt);
    }

    return {
      action,
      ownerApiResults: [],
    };
  }

  private async executeTaskCreateAction(
    run: AgentRunDetail,
    action: AgentActionDetail,
    actor: WorkspaceActor | undefined,
    decidedAt: string,
  ): Promise<OwnerActionExecution> {
    const payloadWorkspaceId =
      firstString(action.payload.workspaceId) ?? run.workspaceId;

    if (payloadWorkspaceId !== run.workspaceId) {
      return this.failedOwnerAction(
        action,
        "Agent action workspaceId must match its Agent run workspaceId",
      );
    }

    if (!this.taskService) {
      return this.failedOwnerAction(action, "Task owner API is not available");
    }

    try {
      const body: CreateTaskBody = {
        title: action.payload.title,
        description: action.payload.description,
        assigneeMemberId: action.payload.assigneeMemberId,
        priority: action.payload.priority,
        dueDate: action.payload.dueDate,
        status: action.payload.status ?? "todo",
        milestoneId: action.payload.milestoneId,
      };
      const task = await this.taskService.createTask(
        payloadWorkspaceId,
        body,
        actor,
      );

      return {
        action: {
          ...action,
          status: "executed",
          executedAt: decidedAt,
        },
        ownerApiResults: [
          this.taskOwnerResult(action, "succeeded", task.id, null),
        ],
      };
    } catch (error) {
      if (isAuthorizationError(error)) {
        throw error;
      }

      return this.failedOwnerAction(action, errorMessageFrom(error));
    }
  }

  private async executeTaskDraftAction(
    run: AgentRunDetail,
    action: AgentActionDetail,
    actor: WorkspaceActor | undefined,
    decidedAt: string,
  ): Promise<OwnerActionExecution> {
    const payloadWorkspaceId =
      firstString(action.payload.workspaceId) ?? run.workspaceId;

    if (payloadWorkspaceId !== run.workspaceId) {
      return this.failedOwnerAction(
        action,
        "Agent action workspaceId must match its Agent run workspaceId",
      );
    }

    if (!this.taskService) {
      return this.failedOwnerAction(action, "Task owner API is not available");
    }

    try {
      const body: CreateTaskDraftBody = {
        ...action.payload,
        workspaceId: payloadWorkspaceId,
      };
      const draft = await this.taskService.createTaskDraft(
        payloadWorkspaceId,
        body,
        actor,
      );

      return {
        action: {
          ...action,
          status: "executed",
          executedAt: decidedAt,
        },
        ownerApiResults: [
          this.taskOwnerResult(action, "succeeded", draft.id, null),
        ],
      };
    } catch (error) {
      if (isAuthorizationError(error)) {
        throw error;
      }

      return this.failedOwnerAction(action, errorMessageFrom(error));
    }
  }

  private failedOwnerAction(
    action: AgentActionDetail,
    errorMessage: string,
  ): OwnerActionExecution {
    return {
      action: {
        ...action,
        status: "failed",
        executedAt: null,
      },
      ownerApiResults: [
        this.taskOwnerResult(action, "failed", null, errorMessage),
      ],
    };
  }

  private taskOwnerResult(
    action: AgentActionDetail,
    status: PlanningOwnerApiResult["status"],
    targetEntityId: string | null,
    errorMessage: string | null,
  ): PlanningOwnerApiResult {
    return {
      owner: "task",
      operation: "task.create",
      sourceDraftType: "feature",
      sourceDraftId: firstString(action.payload.sourceId) ?? action.id,
      status,
      targetEntityId,
      errorMessage,
    };
  }

  private applyActionDecision(
    run: AgentRunDetail,
    nextAction: AgentActionDetail,
    decidedAt: string,
    ownerApiResults: PlanningOwnerApiResult[] = [],
  ) {
    const nextRun: AgentRunDetail = {
      ...run,
      actions: run.actions.map((action) =>
        action.id === nextAction.id ? nextAction : action,
      ),
      updatedAt: decidedAt,
    };

    if (isRecord(nextRun.output) && isRecord(nextRun.output.planDraft)) {
      const planDraft = nextRun.output.planDraft;

      if (isRecord(planDraft.detail) && isRecord(planDraft.detail.approval)) {
        const approval = planDraft.detail.approval;
        const existingOwnerApiResults = Array.isArray(approval.ownerApiResults)
          ? approval.ownerApiResults
          : [];

        if (nextAction.type === "planning.approve") {
          planDraft.detail.approval = {
            ...approval,
            status: nextAction.status,
            confirmedAt: nextAction.confirmedAt,
            executedAt: nextAction.executedAt,
            ownerApiResults: [...existingOwnerApiResults, ...ownerApiResults],
          };
        }

        if (
          (nextAction.type === "task.create" ||
            nextAction.type === "task.create.draft") &&
          ownerApiResults.length
        ) {
          planDraft.detail.approval = {
            ...approval,
            ownerApiResults: [...existingOwnerApiResults, ...ownerApiResults],
          };
        }
      }
    }

    this.refreshRunActionState(nextRun);

    return nextRun;
  }

  private refreshRunActionState(run: AgentRunDetail) {
    const waitingActionCount = run.actions.filter(
      (action) => action.status === "waiting_confirmation",
    ).length;
    const pendingActionCount = run.actions.filter(
      (action) => !isTerminalAction(action),
    ).length;
    const failedActionCount = run.actions.filter(
      (action) => action.status === "failed",
    ).length;

    run.actionRequired = waitingActionCount > 0;
    run.pendingActionCount = pendingActionCount;
    run.status = run.error
      ? "failed"
      : waitingActionCount > 0
        ? "requires_confirmation"
        : failedActionCount > 0
          ? "failed"
          : "succeeded";
  }
}
