import { Injectable } from "@nestjs/common";
import { AgentActionDetail, AgentRunDetail } from "./agent-runtime.types";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

@Injectable()
export class AgentRuntimeRepository {
  private readonly runs = new Map<string, AgentRunDetail>();
  private readonly actionRunIds = new Map<string, string>();

  saveRun(run: AgentRunDetail) {
    const storedRun = clone(run);

    this.runs.set(storedRun.id, storedRun);

    for (const action of storedRun.actions) {
      this.actionRunIds.set(action.id, storedRun.id);
    }

    return clone(storedRun);
  }

  findRun(runId: string) {
    const run = this.runs.get(runId);

    return run ? clone(run) : null;
  }

  findRunByActionId(actionId: string) {
    const runId = this.actionRunIds.get(actionId);

    return runId ? this.findRun(runId) : null;
  }

  updateAction(action: AgentActionDetail) {
    const run = this.findRunByActionId(action.id);

    if (!run) {
      return null;
    }

    run.actions = run.actions.map((existingAction) =>
      existingAction.id === action.id ? clone(action) : existingAction,
    );

    return this.saveRun(run);
  }

  listWorkspaceActions(workspaceId: string) {
    const actions: AgentActionDetail[] = [];

    for (const run of this.runs.values()) {
      if (run.workspaceId !== workspaceId) continue;
      actions.push(...run.actions.map((action) => clone(action)));
    }

    return actions;
  }
}
