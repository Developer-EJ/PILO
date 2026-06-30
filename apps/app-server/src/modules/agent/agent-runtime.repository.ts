import { Injectable, NotFoundException } from "@nestjs/common";
import {
  AgentAction,
  AgentChatMessage,
  AgentRunDetail,
  ProjectPlanDraftDetail,
} from "./agent-runtime.types";

@Injectable()
export class AgentRuntimeRepository {
  private readonly runs = new Map<string, AgentRunDetail>();
  private readonly plans = new Map<string, ProjectPlanDraftDetail>();
  private readonly messages = new Map<string, AgentChatMessage[]>();

  saveRun(run: AgentRunDetail): AgentRunDetail {
    this.runs.set(run.id, clone(run));
    return this.getRun(run.id);
  }

  getRun(runId: string): AgentRunDetail {
    const run = this.runs.get(runId);
    if (!run) {
      throw new NotFoundException("Agent run was not found");
    }
    return clone(run);
  }

  listRunsForWorkspace(workspaceId: string): AgentRunDetail[] {
    return [...this.runs.values()]
      .filter((run) => run.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((run) => clone(run));
  }

  findAction(actionId: string): { run: AgentRunDetail; action: AgentAction } {
    for (const run of this.runs.values()) {
      const action = run.actions.find((candidate) => candidate.id === actionId);
      if (action) {
        return { run: clone(run), action: clone(action) };
      }
    }

    throw new NotFoundException("Agent action was not found");
  }

  updateRun(run: AgentRunDetail): AgentRunDetail {
    if (!this.runs.has(run.id)) {
      throw new NotFoundException("Agent run was not found");
    }
    this.runs.set(run.id, clone(run));
    return this.getRun(run.id);
  }

  savePlan(plan: ProjectPlanDraftDetail): ProjectPlanDraftDetail {
    this.plans.set(plan.id, clone(plan));
    return this.getPlan(plan.id);
  }

  getPlan(draftId: string): ProjectPlanDraftDetail {
    const plan = this.plans.get(draftId);
    if (!plan) {
      throw new NotFoundException("Project plan draft was not found");
    }
    return clone(plan);
  }

  listPlansForWorkspace(workspaceId: string): ProjectPlanDraftDetail[] {
    return [...this.plans.values()]
      .filter((plan) => plan.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((plan) => clone(plan));
  }

  updatePlan(plan: ProjectPlanDraftDetail): ProjectPlanDraftDetail {
    if (!this.plans.has(plan.id)) {
      throw new NotFoundException("Project plan draft was not found");
    }
    this.plans.set(plan.id, clone(plan));
    return this.getPlan(plan.id);
  }

  appendMessage(message: AgentChatMessage): AgentChatMessage {
    const messages = this.messages.get(message.workspaceId) ?? [];
    messages.push(clone(message));
    this.messages.set(message.workspaceId, messages);
    return clone(message);
  }

  listMessagesForWorkspace(workspaceId: string): AgentChatMessage[] {
    return (this.messages.get(workspaceId) ?? [])
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((message) => clone(message));
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
