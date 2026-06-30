import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const { UnauthorizedException } = require("@nestjs/common");
const {
  AgentRuntimeController,
} = require("../src/modules/agent/agent-runtime.controller.ts");
const {
  AgentRuntimeRepository,
} = require("../src/modules/agent/agent-runtime.repository.ts");
const {
  AgentRuntimeService,
} = require("../src/modules/agent/agent-runtime.service.ts");

function createRuntime(taskService) {
  const service = new AgentRuntimeService(
    new AgentRuntimeRepository(),
    taskService,
  );

  return {
    controller: new AgentRuntimeController(service),
    service,
  };
}

function createPlanningRun(service) {
  return service.createRun({
    workspaceId: "22222222-2222-4222-8222-222222222222",
    body: {
      workflowType: "planning.generate",
      workflowVersion: "v1",
      input: {
        goal: "Ship PILO MVP",
        targetUser: "MVP team",
      },
    },
  });
}

describe("Agent runtime local runner", () => {
  it("creates a planning run with approval-gated actions", () => {
    const { service } = createRuntime();

    const run = createPlanningRun(service);

    assert.equal(run.workflowType, "planning.generate");
    assert.equal(run.status, "requires_confirmation");
    assert.equal(run.actionRequired, true);
    assert.equal(run.pendingActionCount, 2);
    assert.deepEqual(
      run.actions.map((action) => action.status),
      ["waiting_confirmation", "waiting_confirmation"],
    );
    assert.equal(run.output.planDraft.detail.approval.status, "waiting_confirmation");
  });

  it("keeps executed actions from being approved or rejected again", async () => {
    const { service } = createRuntime();
    const run = createPlanningRun(service);
    const actionId = run.actions[0].id;

    const executed = await service.approveAction({ actionId });

    assert.equal(executed.status, "executed");
    assert.ok(executed.executedAt);
    await assert.rejects(
      () => service.approveAction({ actionId }),
      /Terminal Agent actions cannot change status/,
    );
    await assert.rejects(
      () => service.rejectAction({ actionId }),
      /Terminal Agent actions cannot change status/,
    );
  });

  it("executes task draft actions through the Task owner service", async () => {
    const calls = [];
    const taskService = {
      async createTaskDraft(workspaceId, body, actor) {
        calls.push({ workspaceId, body, actor });

        return {
          id: "44444444-4444-4444-8444-444444444444",
          workspaceId,
          sourceType: body.sourceType ?? null,
          sourceId: body.sourceId ?? null,
          title: body.title,
          description: body.description ?? null,
          assigneeMemberId: body.assigneeMemberId ?? null,
          priority: body.priority ?? "medium",
          dueDate: body.dueDate ?? null,
          status: "draft",
          taskId: null,
          createdAt: "2026-06-30T00:00:00.000Z",
          updatedAt: "2026-06-30T00:00:00.000Z",
        };
      },
    };
    const { service } = createRuntime(taskService);
    const run = createPlanningRun(service);
    const action = run.actions.find(
      (candidate) => candidate.type === "task.create.draft",
    );

    const executed = await service.approveAction({
      actionId: action.id,
      actor: { memberId: "33333333-3333-4333-8333-333333333331" },
    });
    const nextRun = service.getRun(run.id);
    const [ownerResult] =
      nextRun.output.planDraft.detail.approval.ownerApiResults;

    assert.equal(executed.status, "executed");
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].workspaceId,
      "22222222-2222-4222-8222-222222222222",
    );
    assert.equal(calls[0].body.title, "Project kickoff intake");
    assert.deepEqual(calls[0].actor, {
      memberId: "33333333-3333-4333-8333-333333333331",
    });
    assert.equal(ownerResult.status, "succeeded");
    assert.equal(
      ownerResult.targetEntityId,
      "44444444-4444-4444-8444-444444444444",
    );
  });

  it("does not consume task actions when owner permission checks fail", async () => {
    const taskService = {
      async createTaskDraft() {
        throw new UnauthorizedException("Authentication is required");
      },
    };
    const { service } = createRuntime(taskService);
    const run = createPlanningRun(service);
    const action = run.actions.find(
      (candidate) => candidate.type === "task.create.draft",
    );

    await assert.rejects(
      () => service.approveAction({ actionId: action.id }),
      /Authentication is required/,
    );

    const nextRun = service.getRun(run.id);
    const nextAction = nextRun.actions.find(
      (candidate) => candidate.id === action.id,
    );

    assert.equal(nextAction.status, "waiting_confirmation");
  });

  it("rejects only non-terminal confirmation actions", async () => {
    const { service } = createRuntime();
    const run = createPlanningRun(service);
    const actionId = run.actions[1].id;

    const rejected = await service.rejectAction({ actionId });

    assert.equal(rejected.status, "rejected");
    await assert.rejects(
      () => service.rejectAction({ actionId }),
      /Terminal Agent actions cannot change status/,
    );
  });

  it("maps local runner validation failures to HTTP 400", async () => {
    const { controller } = createRuntime();

    await assert.rejects(
      () =>
        controller.createAgentRun("22222222-2222-4222-8222-222222222222", {
          workflowType: "review.analysis.generate",
          workflowVersion: "v1",
        }),
      /Only planning.generate is available in the local MVP runner/,
    );
  });
});
