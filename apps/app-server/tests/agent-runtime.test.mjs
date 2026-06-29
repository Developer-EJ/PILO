import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  AgentRuntimeController,
} = require("../src/modules/agent/agent-runtime.controller.ts");
const {
  AgentRuntimeRepository,
} = require("../src/modules/agent/agent-runtime.repository.ts");
const {
  AgentRuntimeService,
} = require("../src/modules/agent/agent-runtime.service.ts");

function createRuntime() {
  const service = new AgentRuntimeService(new AgentRuntimeRepository());

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

  it("keeps confirmed actions from being approved or rejected again", () => {
    const { service } = createRuntime();
    const run = createPlanningRun(service);
    const actionId = run.actions[0].id;

    const confirmed = service.approveAction({ actionId });

    assert.equal(confirmed.status, "confirmed");
    assert.throws(
      () => service.approveAction({ actionId }),
      /Only waiting_confirmation Agent actions can be approved/,
    );
    assert.throws(
      () => service.rejectAction({ actionId }),
      /Only draft or waiting_confirmation Agent actions can be rejected/,
    );
  });

  it("rejects only non-terminal confirmation actions", () => {
    const { service } = createRuntime();
    const run = createPlanningRun(service);
    const actionId = run.actions[1].id;

    const rejected = service.rejectAction({ actionId });

    assert.equal(rejected.status, "rejected");
    assert.throws(
      () => service.rejectAction({ actionId }),
      /Terminal Agent actions cannot change status/,
    );
  });

  it("maps local runner validation failures to HTTP 400", () => {
    const { controller } = createRuntime();

    assert.throws(
      () =>
        controller.createAgentRun("22222222-2222-4222-8222-222222222222", {
          workflowType: "review.analysis.generate",
          workflowVersion: "v1",
        }),
      /Only planning.generate is available in the local MVP runner/,
    );
  });
});
