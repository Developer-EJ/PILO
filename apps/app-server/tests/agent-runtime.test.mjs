import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  AgentRuntimeService,
} = require("../src/modules/agent/agent-runtime.service");

const __dirname = dirname(fileURLToPath(import.meta.url));

const UUIDS = {
  workspace: "11111111-1111-4111-8111-111111111111",
  member: "22222222-2222-4222-8222-222222222222",
  meeting: "33333333-3333-4333-8333-333333333333",
};

describe("AgentRuntimeService local skeleton", () => {
  it("creates AgentJobMessage with the public fixture shape", () => {
    const service = new AgentRuntimeService();
    const clock = createClock();

    const job = service.createAgentJob(
      {
        workspaceId: UUIDS.workspace,
        actorMemberId: UUIDS.member,
        workflowType: "task.draft.generate",
        input: {
          message: "Implement OAuth callback",
        },
        contextRefs: [],
      },
      clock,
    );

    assertAgentJobShape(job);
    assert.equal(job.workflowVersion, "v1");
    assert.equal(job.workflowType, "task.draft.generate");
    assert.equal(job.workspaceId, UUIDS.workspace);
    assert.equal(job.actorMemberId, UUIDS.member);
  });

  it("runs task.draft.generate through draft to waiting_confirmation", () => {
    const service = new AgentRuntimeService();
    const clock = createClock();
    const job = service.createAgentJob(
      {
        workspaceId: UUIDS.workspace,
        actorMemberId: UUIDS.member,
        workflowType: "task.draft.generate",
        input: {
          message: "Implement OAuth callback",
        },
        contextRefs: [],
      },
      clock,
    );

    const result = service.runLocalJob(job, clock);
    assertAgentResultShape(result);
    assert.equal(result.status, "succeeded");
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].type, "task.create.draft");
    assert.equal(result.actions[0].status, "draft");
    assert.deepEqual(result.actions[0].payload, {
      workspaceId: UUIDS.workspace,
      sourceType: "agent_recommendation",
      sourceId: result.actions[0].payload.sourceId,
      title: "Implement OAuth callback",
      description: "Generated from Agent command: Implement OAuth callback",
      assigneeMemberId: null,
      priority: "medium",
      dueDate: null,
    });

    const run = service.applyAgentResult(result, clock);
    assert.equal(run.status, "requires_confirmation");
    assert.equal(run.actionRequired, true);
    assert.equal(run.pendingActionCount, 1);
    assert.equal(run.actions[0].status, "waiting_confirmation");
    assert.equal(run.actions[0].confirmedByMemberId, null);
    assert.equal(run.actions[0].executedAt, null);
    assert.equal(
      run.trace.some(
        (entry) =>
          entry.message === "agent action waiting for confirmation" &&
          entry.metadata.from === "draft" &&
          entry.metadata.to === "waiting_confirmation",
      ),
      true,
    );
  });

  it("surfaces recommendations without executing owner domain writes", () => {
    const service = new AgentRuntimeService();
    const run = service.createLocalRun(
      {
        workspaceId: UUIDS.workspace,
        actorMemberId: UUIDS.member,
        workflowType: "task.draft.generate",
        input: {
          message: "Create dashboard task",
        },
        contextRefs: [],
      },
      createClock(),
    );

    const recommendations = service.listRecommendations(UUIDS.workspace);
    assert.equal(recommendations.length, 1);
    assert.equal(recommendations[0].owner, "agent_runtime");
    assert.equal(recommendations[0].status, "waiting_confirmation");
    assert.equal(run.actions[0].executedAt, null);
  });

  it("confirmation does not call the owner executor by itself", () => {
    const service = new AgentRuntimeService();
    const run = service.createLocalRun(
      {
        workspaceId: UUIDS.workspace,
        actorMemberId: UUIDS.member,
        workflowType: "task.draft.generate",
        input: {
          message: "Create API task",
        },
        contextRefs: [],
      },
      createClock(),
    );
    let executeCalls = 0;
    const executor = {
      execute: async () => {
        executeCalls += 1;
        return {
          owner: "task",
          operation: "task.create.draft",
          status: "succeeded",
          targetEntityId: "44444444-4444-4444-8444-444444444444",
          errorMessage: null,
        };
      },
    };

    const action = service.confirmAction(
      run.actions[0].id,
      UUIDS.member,
      createClock(),
    );

    assert.equal(action.status, "confirmed");
    assert.equal(action.confirmedByMemberId, UUIDS.member);
    assert.equal(action.executedAt, null);
    assert.equal(executeCalls, 0);
    assert.equal(service.getRun(run.id).status, "running");
    assert.equal(service.getRun(run.id).pendingActionCount, 1);
    assert.equal(typeof executor.execute, "function");
  });

  it("keeps execution behind an explicit owner adapter boundary", async () => {
    const service = new AgentRuntimeService();
    const run = service.createLocalRun(
      {
        workspaceId: UUIDS.workspace,
        actorMemberId: UUIDS.member,
        workflowType: "task.draft.generate",
        input: {
          message: "Create API task",
        },
        contextRefs: [],
      },
      createClock(),
    );
    service.confirmAction(run.actions[0].id, UUIDS.member, createClock());

    const action = await service.executeConfirmedAction(
      run.actions[0].id,
      {
        execute: async () => ({
          owner: "task",
          operation: "task.create.draft",
          status: "deferred",
          targetEntityId: null,
          errorMessage: null,
        }),
      },
      createClock(),
    );

    assert.equal(action.status, "confirmed");
    assert.equal(action.executedAt, null);
    assert.equal(service.getRun(run.id).status, "running");
    assert.equal(
      service
        .getRun(run.id)
        .trace.some(
          (entry) => entry.message === "agent action execution deferred",
        ),
      true,
    );
  });

  it("fails execution before owner writes when action payload workspace mismatches the run", async () => {
    const service = new AgentRuntimeService();
    const clock = createClock();
    const job = service.createAgentJob(
      {
        workspaceId: UUIDS.workspace,
        actorMemberId: UUIDS.member,
        workflowType: "task.draft.generate",
        input: {
          message: "Reject mismatched workspace",
        },
        contextRefs: [],
      },
      clock,
    );
    const result = service.runLocalJob(job, clock);
    result.actions[0].payload.workspaceId = "different-workspace";
    const run = service.applyAgentResult(result, clock);
    service.confirmAction(run.actions[0].id, UUIDS.member, clock);
    let ownerWrites = 0;

    const action = await service.executeConfirmedAction(
      run.actions[0].id,
      {
        execute: async () => {
          ownerWrites += 1;
          return {
            owner: "task",
            operation: "task.create.draft",
            status: "succeeded",
            targetEntityId: "44444444-4444-4444-8444-444444444444",
            errorMessage: null,
          };
        },
      },
      clock,
    );

    assert.equal(ownerWrites, 0);
    assert.equal(action.status, "failed");
    const fetched = service.getRun(run.id);
    assert.equal(fetched.status, "failed");
    assert.equal(
      fetched.error.message,
      "Agent action payload workspaceId must match the run workspaceId",
    );
    assert.equal(
      fetched.trace.some(
        (entry) => entry.message === "agent action execution failed",
      ),
      true,
    );
  });

  it("does not reject confirmed actions outside the documented state machine", () => {
    const service = new AgentRuntimeService();
    const run = service.createLocalRun(
      {
        workspaceId: UUIDS.workspace,
        actorMemberId: UUIDS.member,
        workflowType: "task.draft.generate",
        input: {
          message: "Create API task",
        },
        contextRefs: [],
      },
      createClock(),
    );
    service.confirmAction(run.actions[0].id, UUIDS.member, createClock());

    assert.throws(
      () => service.rejectAction(run.actions[0].id, createClock()),
      /not waiting rejection/,
    );
  });

  it("records failed local results as run error and trace", () => {
    const service = new AgentRuntimeService();
    const job = service.createAgentJob(
      {
        workspaceId: UUIDS.workspace,
        actorMemberId: UUIDS.member,
        workflowType: "task.draft.generate",
        input: {},
        contextRefs: [],
      },
      createClock(),
    );
    const failedResult = {
      jobId: job.jobId,
      runId: job.runId,
      status: "failed",
      output: {},
      actions: [],
      trace: [
        {
          stepName: "local_runner",
          message: "forced local failure",
          metadata: {},
        },
      ],
      error: {
        code: "LOCAL_FAILURE",
        message: "forced failure",
      },
      finishedAt: "2026-06-30T00:00:00.000Z",
    };

    const run = service.applyAgentResult(failedResult, createClock());

    assert.equal(run.status, "failed");
    assert.equal(run.error.message, "forced failure");
    assert.equal(
      run.trace.some((entry) => entry.message === "forced local failure"),
      true,
    );
  });

  it("keeps repository fixtures compatible with job/result shape", () => {
    const jobFixture = JSON.parse(
      readFileSync(fixturePath("agent-job.fixture.json"), "utf8"),
    );
    const resultFixture = JSON.parse(
      readFileSync(fixturePath("agent-result.fixture.json"), "utf8"),
    );

    assertAgentJobShape(jobFixture);
    assertAgentResultShape(resultFixture);
    assert.equal(resultFixture.actions[0].type, "task.create.draft");
    assert.equal(resultFixture.actions[0].status, "waiting_confirmation");
  });
});

function createClock() {
  let id = 1;
  let tick = 0;

  return {
    uuid: () => `00000000-0000-4000-8000-${String(id++).padStart(12, "0")}`,
    now: () => `2026-06-30T00:00:${String(tick++).padStart(2, "0")}.000Z`,
  };
}

function fixturePath(fileName) {
  return resolve(__dirname, "../../../docs/contracts/fixtures", fileName);
}

function assertAgentJobShape(job) {
  assert.deepEqual(Object.keys(job).sort(), [
    "actorMemberId",
    "contextRefs",
    "input",
    "jobId",
    "requestedAt",
    "runId",
    "workflowType",
    "workflowVersion",
    "workspaceId",
  ]);
  assert.equal(typeof job.jobId, "string");
  assert.equal(typeof job.runId, "string");
  assert.equal(typeof job.workflowType, "string");
  assert.equal(typeof job.workflowVersion, "string");
  assert.equal(typeof job.workspaceId, "string");
  assert.equal(typeof job.actorMemberId, "string");
  assert.equal(typeof job.input, "object");
  assert.equal(Array.isArray(job.contextRefs), true);
  assert.equal(typeof job.requestedAt, "string");
}

function assertAgentResultShape(result) {
  assert.deepEqual(Object.keys(result).sort(), [
    "actions",
    "error",
    "finishedAt",
    "jobId",
    "output",
    "runId",
    "status",
    "trace",
  ]);
  assert.ok(["succeeded", "failed"].includes(result.status));
  assert.equal(Array.isArray(result.actions), true);
  assert.equal(Array.isArray(result.trace), true);
  for (const action of result.actions) {
    assertActionShape(action);
  }
  for (const trace of result.trace) {
    assert.equal(typeof trace.message, "string");
    assert.equal(typeof trace.metadata, "object");
  }
}

function assertActionShape(action) {
  assert.deepEqual(Object.keys(action).sort(), [
    "confirmedAt",
    "confirmedByMemberId",
    "executedAt",
    "id",
    "payload",
    "requiresConfirmation",
    "runId",
    "source",
    "status",
    "type",
  ]);
  assert.ok(
    [
      "task.create.draft",
      "task.update.status",
      "github.issue.create",
      "meeting.report.generate",
      "review.analysis.generate",
      "planning.approve",
    ].includes(action.type),
  );
  assert.ok(
    [
      "draft",
      "waiting_confirmation",
      "confirmed",
      "executed",
      "rejected",
      "failed",
    ].includes(action.status),
  );
  if (action.type === "task.create.draft") {
    assert.deepEqual(Object.keys(action.payload).sort(), [
      "assigneeMemberId",
      "description",
      "dueDate",
      "priority",
      "sourceId",
      "sourceType",
      "title",
      "workspaceId",
    ]);
    assert.equal(typeof action.payload.workspaceId, "string");
    assert.equal(typeof action.payload.title, "string");
    assert.ok(
      ["low", "medium", "high", "urgent"].includes(action.payload.priority),
    );
  }
}
