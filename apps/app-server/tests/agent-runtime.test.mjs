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

const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_MEMBER_ID = "33333333-3333-4333-8333-333333333331";
const ACTOR = { memberId: ACTOR_MEMBER_ID };

function createWorkspaceAccess() {
  const calls = [];

  return {
    calls,
    service: {
      async requireWorkspaceMember(workspaceId, actor) {
        calls.push({ workspaceId, actor });

        if (!actor?.memberId && !actor?.userId) {
          throw new UnauthorizedException("Authentication is required");
        }

        return {
          id: actor.memberId ?? "33333333-3333-4333-8333-333333333399",
          workspaceId,
          userId: actor.userId ?? "11111111-1111-4111-8111-111111111111",
          role: "member",
        };
      },
    },
  };
}

function createRuntime(taskService, workspaceAccess = createWorkspaceAccess()) {
  const service = new AgentRuntimeService(
    new AgentRuntimeRepository(),
    workspaceAccess.service,
    taskService,
  );

  return {
    controller: new AgentRuntimeController(service),
    service,
    workspaceAccess,
  };
}

function createPlanningRun(service) {
  return service.createRun({
    workspaceId: WORKSPACE_ID,
    actor: ACTOR,
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
  it("creates a planning run with approval-gated actions", async () => {
    const { service } = createRuntime();

    const run = await createPlanningRun(service);

    assert.equal(run.workflowType, "planning.generate");
    assert.equal(run.actorMemberId, ACTOR_MEMBER_ID);
    assert.equal(run.status, "requires_confirmation");
    assert.equal(run.actionRequired, true);
    assert.equal(run.pendingActionCount, 3);
    assert.deepEqual(
      run.actions.map((action) => action.status),
      ["waiting_confirmation", "waiting_confirmation", "waiting_confirmation"],
    );
    assert.equal(
      run.output.planDraft.detail.approval.status,
      "waiting_confirmation",
    );
    assert.equal(run.output.planDraft.detail.projectBrief.goal, "Ship PILO MVP");
    assert.deepEqual(
      run.output.planDraft.detail.featureDrafts.map((feature) => feature.scope),
      ["must", "must", "should", "excluded"],
    );
  });

  it("uses restart-safe ids for planning runs and generated task sources", async () => {
    const firstRuntime = createRuntime();
    const secondRuntime = createRuntime();

    const firstRun = await createPlanningRun(firstRuntime.service);
    const secondRun = await createPlanningRun(secondRuntime.service);
    const firstTaskAction = firstRun.actions.find(
      (candidate) => candidate.type === "task.create",
    );
    const secondTaskAction = secondRun.actions.find(
      (candidate) => candidate.type === "task.create",
    );

    assert.notEqual(firstRun.id, secondRun.id);
    assert.notEqual(
      firstRun.output.planDraft.detail.id,
      secondRun.output.planDraft.detail.id,
    );
    assert.notEqual(firstTaskAction.id, secondTaskAction.id);
    assert.notEqual(
      firstTaskAction.payload.sourceId,
      secondTaskAction.payload.sourceId,
    );
  });

  it("marks the plan-level approval executed without owner API writes", async () => {
    const { service } = createRuntime();
    const run = await createPlanningRun(service);
    const action = run.actions.find(
      (candidate) => candidate.type === "planning.approve",
    );

    const executed = await service.approveAction({
      actionId: action.id,
      actor: ACTOR,
    });
    const nextRun = await service.getRun(run.id, ACTOR);

    assert.equal(executed.status, "executed");
    assert.ok(executed.executedAt);
    assert.equal(nextRun.status, "requires_confirmation");
    assert.equal(nextRun.pendingActionCount, 2);
    assert.equal(nextRun.output.planDraft.detail.approval.status, "executed");
    assert.deepEqual(
      nextRun.output.planDraft.detail.approval.ownerApiResults,
      [],
    );
  });

  it("keeps executed actions from being approved or rejected again", async () => {
    const taskService = {
      async createTask(workspaceId, body) {
        return {
          id: "44444444-4444-4444-8444-444444444445",
          workspaceId,
          title: body.title,
          description: body.description ?? null,
          assigneeMemberId: body.assigneeMemberId ?? null,
          priority: body.priority ?? "medium",
          dueDate: body.dueDate ?? null,
          status: body.status ?? "todo",
          createdAt: "2026-06-30T00:00:00.000Z",
          updatedAt: "2026-06-30T00:00:00.000Z",
        };
      },
    };
    const { service } = createRuntime(taskService);
    const run = await createPlanningRun(service);
    const actionId = run.actions.find(
      (candidate) => candidate.type === "task.create",
    ).id;

    const executed = await service.approveAction({ actionId, actor: ACTOR });

    assert.equal(executed.status, "executed");
    assert.ok(executed.executedAt);
    await assert.rejects(
      () => service.approveAction({ actionId, actor: ACTOR }),
      /Terminal Agent actions cannot change status/,
    );
    await assert.rejects(
      () => service.rejectAction({ actionId, actor: ACTOR }),
      /Terminal Agent actions cannot change status/,
    );
  });

  it("executes task actions through the Task owner service", async () => {
    const calls = [];
    const taskService = {
      async createTask(workspaceId, body, actor) {
        calls.push({ workspaceId, body, actor });

        return {
          id: "44444444-4444-4444-8444-444444444444",
          workspaceId,
          title: body.title,
          description: body.description ?? null,
          assigneeMemberId: body.assigneeMemberId ?? null,
          priority: body.priority ?? "medium",
          dueDate: body.dueDate ?? null,
          status: body.status ?? "todo",
          createdAt: "2026-06-30T00:00:00.000Z",
          updatedAt: "2026-06-30T00:00:00.000Z",
        };
      },
    };
    const { service } = createRuntime(taskService);
    const run = await createPlanningRun(service);
    const action = run.actions.find(
      (candidate) => candidate.type === "task.create",
    );

    const executed = await service.approveAction({
      actionId: action.id,
      actor: ACTOR,
    });
    const nextRun = await service.getRun(run.id, ACTOR);
    const [ownerResult] =
      nextRun.output.planDraft.detail.approval.ownerApiResults;

    assert.equal(executed.status, "executed");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].workspaceId, WORKSPACE_ID);
    assert.equal(calls[0].body.title, "Project kickoff intake");
    assert.equal(calls[0].body.status, "todo");
    assert.deepEqual(calls[0].actor, ACTOR);
    assert.equal(ownerResult.status, "succeeded");
    assert.equal(
      ownerResult.targetEntityId,
      "44444444-4444-4444-8444-444444444444",
    );
  });

  it("does not consume task actions when owner permission checks fail", async () => {
    const taskService = {
      async createTask() {
        throw new UnauthorizedException("Authentication is required");
      },
    };
    const { service } = createRuntime(taskService);
    const run = await createPlanningRun(service);
    const action = run.actions.find(
      (candidate) => candidate.type === "task.create",
    );

    await assert.rejects(
      () => service.approveAction({ actionId: action.id, actor: ACTOR }),
      /Authentication is required/,
    );

    const nextRun = await service.getRun(run.id, ACTOR);
    const nextAction = nextRun.actions.find(
      (candidate) => candidate.id === action.id,
    );

    assert.equal(nextAction.status, "waiting_confirmation");
  });

  it("rejects only non-terminal confirmation actions", async () => {
    const { service } = createRuntime();
    const run = await createPlanningRun(service);
    const actionId = run.actions[1].id;

    const rejected = await service.rejectAction({ actionId, actor: ACTOR });

    assert.equal(rejected.status, "rejected");
    await assert.rejects(
      () => service.rejectAction({ actionId, actor: ACTOR }),
      /Terminal Agent actions cannot change status/,
    );
  });

  it("requires workspace membership for run and action APIs", async () => {
    const { service } = createRuntime();

    await assert.rejects(
      () =>
        service.createRun({
          workspaceId: WORKSPACE_ID,
          body: {
            workflowType: "planning.generate",
            workflowVersion: "v1",
          },
        }),
      /Authentication is required/,
    );

    const run = await createPlanningRun(service);
    const actionId = run.actions[0].id;

    await assert.rejects(
      () => service.getRun(run.id),
      /Authentication is required/,
    );
    await assert.rejects(
      () => service.listWorkspaceActions(WORKSPACE_ID),
      /Authentication is required/,
    );
    await assert.rejects(
      () => service.approveAction({ actionId }),
      /Authentication is required/,
    );
  });

  it("maps local runner validation failures to HTTP 400", async () => {
    const { controller } = createRuntime();

    await assert.rejects(
      () =>
        controller.createAgentRun(
          WORKSPACE_ID,
          {
            workflowType: "review.analysis.generate",
            workflowVersion: "v1",
          },
          undefined,
          ACTOR_MEMBER_ID,
        ),
      /Only planning.generate is available in the local MVP runner/,
    );
  });
});
