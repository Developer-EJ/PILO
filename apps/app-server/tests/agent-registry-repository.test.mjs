import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  AGENT_OWNER_TABLES,
  AgentRegistryRepository,
} = require("../src/modules/agent/agent-registry.repository");

describe("AgentRegistryRepository", () => {
  it("tracks every Agent Runtime owner registry table", () => {
    assert.deepEqual(AGENT_OWNER_TABLES, ["agents", "agent_workflows"]);
  });

  it("creates agents with registry defaults", async () => {
    const calls = [];
    const database = {
      agent: {
        create: async (args) => {
          calls.push(args);
          return { id: "agent-1", ...args.data };
        },
      },
    };
    const repository = new AgentRegistryRepository(database);

    const agent = await repository.createAgent({
      name: "Meeting Agent",
      domain: "meeting",
    });

    assert.equal(agent.enabled, true);
    assert.deepEqual(calls, [
      {
        data: {
          name: "Meeting Agent",
          domain: "meeting",
          description: null,
          enabled: true,
        },
      },
    ]);
  });

  it("creates workflows with v1 and empty schema defaults", async () => {
    const calls = [];
    const database = {
      agentWorkflow: {
        create: async (args) => {
          calls.push(args);
          return { id: "workflow-1", ...args.data, agent: { id: args.data.agentId } };
        },
      },
    };
    const repository = new AgentRegistryRepository(database);

    const workflow = await repository.createWorkflow({
      agentId: "agent-1",
      type: "meeting.report.generate",
    });

    assert.equal(workflow.version, "v1");
    assert.deepEqual(calls, [
      {
        data: {
          agentId: "agent-1",
          type: "meeting.report.generate",
          version: "v1",
          inputSchema: {},
          outputSchema: {},
          enabled: true,
        },
        include: {
          agent: true,
        },
      },
    ]);
  });

  it("looks up a workflow by type and version with its owning agent", async () => {
    const calls = [];
    const database = {
      agentWorkflow: {
        findFirst: async (args) => {
          calls.push(args);
          return null;
        },
      },
    };
    const repository = new AgentRegistryRepository(database);

    await repository.findWorkflowByTypeAndVersion({
      type: "review.analysis.generate",
      version: "v2",
    });

    assert.deepEqual(calls, [
      {
        where: {
          type: "review.analysis.generate",
          version: "v2",
        },
        include: {
          agent: true,
        },
      },
    ]);
  });

  it("lists only workflows whose workflow and agent are enabled", async () => {
    const calls = [];
    const database = {
      agentWorkflow: {
        findMany: async (args) => {
          calls.push(args);
          return [];
        },
      },
    };
    const repository = new AgentRegistryRepository(database);

    await repository.listEnabledWorkflows();

    assert.deepEqual(calls, [
      {
        where: {
          enabled: true,
          agent: {
            enabled: true,
          },
        },
        include: {
          agent: true,
        },
        orderBy: [{ type: "asc" }, { version: "asc" }],
      },
    ]);
  });
});
