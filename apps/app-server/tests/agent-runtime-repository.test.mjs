import assert from "node:assert/strict";
import { createRequire } from "node:module";
import process from "node:process";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  AgentRuntimeRepository,
} = require("../src/modules/agent/agent-runtime.repository.ts");
const {
  createPlanningGenerateRun,
} = require("../src/modules/agent/planning-local-runner.ts");

const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_MEMBER_ID = "33333333-3333-4333-8333-333333333331";
const WORKFLOW_ID = "12121212-1212-4121-8121-121212121212";
const AGENT_ID = "13131313-1313-4131-8131-131313131313";

describe("AgentRuntimeRepository database persistence", () => {
  it("restores run snapshots and actions from a database-backed repository", async () => {
    await withDatabaseConnectEnabled(async () => {
      const database = createAgentRuntimeDatabaseStub();
      const run = createPlanningGenerateRun({
        sequence: 1,
        actorMemberId: ACTOR_MEMBER_ID,
        workspaceId: WORKSPACE_ID,
        workflowVersion: "v1",
        rawInput: {
          goal: "Ship PILO MVP",
        },
      });
      const repository = new AgentRuntimeRepository(database);

      const saved = await repository.saveRun(run);
      const restartedRepository = new AgentRuntimeRepository(database);
      const restored = await restartedRepository.findRun(saved.id);
      const runByAction = await restartedRepository.findRunByActionId(
        saved.actions[0].id,
      );
      const actions =
        await restartedRepository.listWorkspaceActions(WORKSPACE_ID);

      assert.equal(repository.storageMode, "database");
      assert.equal(saved.workflowId, WORKFLOW_ID);
      assert.deepEqual(restored, saved);
      assert.equal(runByAction.id, saved.id);
      assert.deepEqual(actions, saved.actions);
      assert.equal(database.state.snapshots.size, 1);
      assert.equal(
        database.calls.some((call) => /INSERT INTO agent_runs/.test(call.sql)),
        true,
      );
      assert.equal(
        database.calls.some((call) =>
          /INSERT INTO agent_contexts/.test(call.sql),
        ),
        true,
      );
    });
  });

  it("updates an action by replacing the stored database snapshot", async () => {
    await withDatabaseConnectEnabled(async () => {
      const database = createAgentRuntimeDatabaseStub();
      const repository = new AgentRuntimeRepository(database);
      const run = await repository.saveRun(
        createPlanningGenerateRun({
          sequence: 2,
          actorMemberId: ACTOR_MEMBER_ID,
          workspaceId: WORKSPACE_ID,
          workflowVersion: "v1",
          rawInput: {},
        }),
      );
      const action = {
        ...run.actions[0],
        status: "rejected",
        confirmedByMemberId: null,
        confirmedAt: null,
        executedAt: null,
      };

      await repository.updateAction(action);

      const restored = await new AgentRuntimeRepository(database).findRun(
        run.id,
      );

      assert.equal(restored.actions[0].status, "rejected");
      assert.equal(database.state.snapshots.size, 1);
    });
  });

  it("falls back to memory storage when database connection is explicitly skipped", async () => {
    await withDatabaseConnectSkipped(async () => {
      const database = createAgentRuntimeDatabaseStub();
      const repository = new AgentRuntimeRepository(database);
      const run = createPlanningGenerateRun({
        sequence: 3,
        actorMemberId: ACTOR_MEMBER_ID,
        workspaceId: WORKSPACE_ID,
        workflowVersion: "v1",
        rawInput: {},
      });

      await repository.saveRun(run);

      assert.equal(repository.storageMode, "memory");
      assert.equal((await repository.findRun(run.id)).id, run.id);
      assert.equal(database.calls.length, 0);
    });
  });
});

async function withDatabaseConnectEnabled(callback) {
  const previous = process.env.PILO_SKIP_DATABASE_CONNECT;
  delete process.env.PILO_SKIP_DATABASE_CONNECT;

  try {
    await callback();
  } finally {
    restoreDatabaseSkip(previous);
  }
}

async function withDatabaseConnectSkipped(callback) {
  const previous = process.env.PILO_SKIP_DATABASE_CONNECT;
  process.env.PILO_SKIP_DATABASE_CONNECT = "true";

  try {
    await callback();
  } finally {
    restoreDatabaseSkip(previous);
  }
}

function restoreDatabaseSkip(previous) {
  if (previous === undefined) {
    delete process.env.PILO_SKIP_DATABASE_CONNECT;
    return;
  }

  process.env.PILO_SKIP_DATABASE_CONNECT = previous;
}

function createAgentRuntimeDatabaseStub() {
  const state = {
    agentId: null,
    workflowId: null,
    workflowKey: null,
    runs: new Map(),
    actionRunIds: new Map(),
    snapshots: new Map(),
  };
  const calls = [];
  const database = {
    state,
    calls,
    async $transaction(operation) {
      return operation(database);
    },
    async $queryRaw(strings, ...values) {
      const sql = normalizeSql(strings);
      calls.push({
        kind: "query",
        sql,
        values,
      });

      if (/SELECT id::text AS id FROM agent_workflows/.test(sql)) {
        const [type, version] = values;
        return state.workflowKey === `${type}:${version}` && state.workflowId
          ? [{ id: state.workflowId }]
          : [];
      }

      if (/SELECT id::text AS id FROM agents/.test(sql)) {
        return state.agentId ? [{ id: state.agentId }] : [];
      }

      if (/INSERT INTO agents/.test(sql)) {
        state.agentId = AGENT_ID;
        return [{ id: state.agentId }];
      }

      if (/INSERT INTO agent_workflows/.test(sql)) {
        const [, type, version] = values;
        state.workflowId = WORKFLOW_ID;
        state.workflowKey = `${type}:${version}`;
        return [{ id: state.workflowId }];
      }

      if (/INSERT INTO agent_runs/.test(sql)) {
        const [id, workflowId, workspaceId, actorMemberId, status] = values;
        state.runs.set(id, {
          id,
          workflowId,
          workspaceId,
          actorMemberId,
          status,
        });
        return [{ id }];
      }

      if (/INSERT INTO agent_actions/.test(sql)) {
        const [id, runId] = values;
        state.actionRunIds.set(id, runId);
        return [{ id }];
      }

      if (/INSERT INTO agent_run_steps|INSERT INTO agent_traces/.test(sql)) {
        return [{ id: values[0] }];
      }

      if (/INSERT INTO agent_contexts/.test(sql)) {
        const [runId, payload] = values;
        state.snapshots.set(runId, JSON.parse(payload));
        return [{ id: "14141414-1414-4141-8141-141414141414" }];
      }

      if (/SELECT payload FROM agent_contexts/.test(sql)) {
        const [runId] = values;
        const payload = state.snapshots.get(runId);
        return payload ? [{ payload }] : [];
      }

      if (/SELECT run_id::text AS "runId" FROM agent_actions/.test(sql)) {
        const [actionId] = values;
        const runId = state.actionRunIds.get(actionId);
        return runId ? [{ runId }] : [];
      }

      if (/JOIN agent_runs r ON r.id = c.run_id/.test(sql)) {
        const [workspaceId] = values;
        return Array.from(state.snapshots.entries())
          .filter(
            ([runId]) => state.runs.get(runId)?.workspaceId === workspaceId,
          )
          .map(([, payload]) => ({ payload }));
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
    async $executeRaw(strings, ...values) {
      const sql = normalizeSql(strings);
      calls.push({
        kind: "execute",
        sql,
        values,
      });

      if (/DELETE FROM agent_contexts/.test(sql)) {
        state.snapshots.delete(values[0]);
      }

      if (/DELETE FROM agent_actions/.test(sql)) {
        const [runId] = values;

        for (const [actionId, storedRunId] of state.actionRunIds.entries()) {
          if (storedRunId === runId) {
            state.actionRunIds.delete(actionId);
          }
        }
      }

      return 1;
    },
  };

  return database;
}

function normalizeSql(strings) {
  return Array.from(strings).join("?").replace(/\s+/g, " ").trim();
}
