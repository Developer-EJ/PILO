import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  AgentWorkflowDisabledError,
  AgentWorkflowNotFoundError,
} = require("../src/modules/agent/agent-registry.errors");
const {
  AgentRegistryService,
} = require("../src/modules/agent/agent-registry.service");

describe("AgentRegistryService", () => {
  it("returns enabled workflows and defaults omitted versions to v1", async () => {
    const calls = [];
    const workflow = {
      id: "workflow-1",
      type: "meeting.report.generate",
      version: "v1",
      enabled: true,
      agent: { id: "agent-1", enabled: true },
    };
    const repository = {
      findWorkflowByTypeAndVersion: async (input) => {
        calls.push(input);
        return workflow;
      },
    };
    const service = new AgentRegistryService(repository);

    const result = await service.requireEnabledWorkflow({
      type: "meeting.report.generate",
    });

    assert.equal(result, workflow);
    assert.deepEqual(calls, [
      {
        type: "meeting.report.generate",
        version: "v1",
      },
    ]);
  });

  it("throws a clear domain error when a workflow is not registered", async () => {
    const service = new AgentRegistryService({
      findWorkflowByTypeAndVersion: async () => null,
    });

    await assert.rejects(
      () =>
        service.requireEnabledWorkflow({
          type: "review.analysis.generate",
        }),
      (error) =>
        error instanceof AgentWorkflowNotFoundError &&
        error.code === "AGENT_WORKFLOW_NOT_FOUND" &&
        error.message.includes("review.analysis.generate@v1"),
    );
  });

  it("throws a clear domain error when the workflow is disabled", async () => {
    const service = new AgentRegistryService({
      findWorkflowByTypeAndVersion: async () => ({
        id: "workflow-1",
        type: "planning.generate",
        version: "v1",
        enabled: false,
        agent: { id: "agent-1", enabled: true },
      }),
    });

    await assert.rejects(
      () =>
        service.requireEnabledWorkflow({
          type: "planning.generate",
        }),
      (error) =>
        error instanceof AgentWorkflowDisabledError &&
        error.code === "AGENT_WORKFLOW_DISABLED" &&
        error.message.includes("planning.generate@v1"),
    );
  });

  it("throws a clear domain error when the owning agent is disabled", async () => {
    const service = new AgentRegistryService({
      findWorkflowByTypeAndVersion: async () => ({
        id: "workflow-1",
        type: "orchestrator.run",
        version: "v1",
        enabled: true,
        agent: { id: "agent-1", enabled: false },
      }),
    });

    await assert.rejects(
      () =>
        service.requireEnabledWorkflow({
          type: "orchestrator.run",
        }),
      (error) =>
        error instanceof AgentWorkflowDisabledError &&
        error.code === "AGENT_WORKFLOW_DISABLED" &&
        error.message.includes("orchestrator.run@v1"),
    );
  });
});
