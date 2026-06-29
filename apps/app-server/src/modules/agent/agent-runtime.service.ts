import { Injectable } from "@nestjs/common";
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

const LOCAL_ACTOR_MEMBER_ID = "33333333-3333-4333-8333-333333333331";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTerminalAction(action: AgentActionDetail) {
  return ["executed", "rejected", "failed"].includes(action.status);
}

function currentIsoTimestamp() {
  return new Date().toISOString();
}

@Injectable()
export class AgentRuntimeService {
  private sequence = 1;

  constructor(private readonly repository: AgentRuntimeRepository) {}

  createRun(input: AgentRuntimeCreateInput) {
    if (!input.workspaceId.trim()) {
      throw new AgentRuntimeValidationError("workspaceId is required");
    }

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
      sequence: this.sequence,
      workspaceId: input.workspaceId,
      workflowVersion,
      rawInput: body.input,
    });

    this.sequence += 1;

    return this.repository.saveRun(run);
  }

  getRun(runId: string) {
    const run = this.repository.findRun(runId);

    if (!run) {
      throw new AgentRuntimeNotFoundError("Agent run not found");
    }

    return run;
  }

  listWorkspaceActions(workspaceId: string) {
    return this.repository.listWorkspaceActions(workspaceId);
  }

  approveAction(input: AgentActionDecisionInput) {
    return this.decideAction(input.actionId, "approve");
  }

  rejectAction(input: AgentActionDecisionInput) {
    return this.decideAction(input.actionId, "reject");
  }

  private decideAction(actionId: string, decision: "approve" | "reject") {
    const run = this.repository.findRunByActionId(actionId);

    if (!run) {
      throw new AgentRuntimeNotFoundError("Agent action not found");
    }

    const action = run.actions.find((candidate) => candidate.id === actionId);

    if (!action) {
      throw new AgentRuntimeNotFoundError("Agent action not found");
    }

    if (isTerminalAction(action)) {
      throw new AgentRuntimeValidationError(
        "Terminal Agent actions cannot change status",
      );
    }

    if (decision === "approve" && !action.requiresConfirmation) {
      throw new AgentRuntimeValidationError(
        "This Agent action does not require confirmation",
      );
    }

    const decidedAt = currentIsoTimestamp();
    const nextAction: AgentActionDetail =
      decision === "approve"
        ? {
            ...action,
            status: "confirmed",
            confirmedByMemberId: LOCAL_ACTOR_MEMBER_ID,
            confirmedAt: decidedAt,
            executedAt: null,
          }
        : {
            ...action,
            status: "rejected",
            confirmedByMemberId: null,
            confirmedAt: null,
            executedAt: null,
          };

    const nextRun = this.applyActionDecision(run, nextAction, decidedAt);

    return this.repository.saveRun(nextRun).actions.find(
      (candidate) => candidate.id === actionId,
    );
  }

  private applyActionDecision(
    run: AgentRunDetail,
    nextAction: AgentActionDetail,
    decidedAt: string,
  ) {
    const nextRun: AgentRunDetail = {
      ...run,
      actions: run.actions.map((action) =>
        action.id === nextAction.id ? nextAction : action,
      ),
      updatedAt: decidedAt,
    };

    if (
      nextAction.type === "planning.approve" &&
      isRecord(nextRun.output) &&
      isRecord(nextRun.output.planDraft)
    ) {
      const planDraft = nextRun.output.planDraft;

      if (isRecord(planDraft.detail) && isRecord(planDraft.detail.approval)) {
        const approval = planDraft.detail.approval;

        planDraft.detail.approval = {
          ...approval,
          status:
            nextAction.status === "confirmed"
              ? "confirmed"
              : nextAction.status,
          confirmedAt:
            nextAction.status === "confirmed" ? nextAction.confirmedAt : null,
          executedAt: null,
          ownerApiResults:
            nextAction.status === "confirmed"
              ? [
                  {
                    owner: "task",
                    operation: "task.create",
                    sourceDraftType: "feature",
                    sourceDraftId: "aaaaaaaa-aaaa-4aaa-8aaa-100000000001",
                    status: "pending",
                    targetEntityId: null,
                    errorMessage:
                      "Owner API execution is deferred in the local runner.",
                  },
                ]
              : [],
        };
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

    run.actionRequired = waitingActionCount > 0;
    run.pendingActionCount = pendingActionCount;
    run.status = run.error
      ? "failed"
      : waitingActionCount > 0
        ? "requires_confirmation"
        : "succeeded";
  }
}
