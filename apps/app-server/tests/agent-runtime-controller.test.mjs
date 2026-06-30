import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");
require("reflect-metadata");

const { NestFactory } = require("@nestjs/core");
const {
  BadRequestException,
  NotFoundException,
  RequestMethod,
} = require("@nestjs/common");
const { FastifyAdapter } = require("@nestjs/platform-fastify");
const { METHOD_METADATA, PATH_METADATA } = require("@nestjs/common/constants");
const { configureApp } = require("../src/app.config");
const { AgentModule } = require("../src/modules/agent/agent.module");
const {
  AgentRuntimeController,
} = require("../src/modules/agent/agent-runtime.controller");
const {
  AgentRuntimeService,
} = require("../src/modules/agent/agent-runtime.service");

const UUIDS = {
  workspace: "11111111-1111-4111-8111-111111111111",
  member: "22222222-2222-4222-8222-222222222222",
};

describe("AgentRuntimeController", () => {
  it("exposes only the approved Agent Runtime HTTP surface", () => {
    assertRoute(
      "createRun",
      RequestMethod.POST,
      "workspaces/:workspaceId/agent-runs",
    );
    assertRoute("getRun", RequestMethod.GET, "agent-runs/:runId");
    assertRoute(
      "approveAction",
      RequestMethod.POST,
      "agent-actions/:actionId/approve",
    );
    assertRoute(
      "rejectAction",
      RequestMethod.POST,
      "agent-actions/:actionId/reject",
    );
  });

  it("creates and reads task draft runs without owner domain writes", () => {
    const controller = new AgentRuntimeController(new AgentRuntimeService());

    const run = controller.createRun(
      UUIDS.workspace,
      {
        workflowType: "task.draft.generate",
        workflowVersion: "v1",
        input: {
          message: "Implement OAuth callback",
          githubToken: "should-not-leak",
        },
        contextRefs: [],
      },
      UUIDS.member,
    );

    assert.equal(run.workspaceId, UUIDS.workspace);
    assert.equal(run.actorMemberId, UUIDS.member);
    assert.equal(run.workflowType, "task.draft.generate");
    assert.equal(run.status, "requires_confirmation");
    assert.equal(run.actionRequired, true);
    assert.equal(run.pendingActionCount, 1);
    assert.equal(run.actions.length, 1);
    assert.equal(run.actions[0].type, "task.create.draft");
    assert.equal(run.actions[0].status, "waiting_confirmation");
    assert.equal(run.actions[0].executedAt, null);
    assert.equal(run.input.githubToken, "[redacted]");

    const fetched = controller.getRun(run.id, UUIDS.member);
    assert.equal(fetched.id, run.id);
    assert.equal(fetched.actions[0].status, "waiting_confirmation");
  });

  it("approves a waiting action without executing the owner boundary", () => {
    const controller = new AgentRuntimeController(new AgentRuntimeService());
    const run = controller.createRun(
      UUIDS.workspace,
      {
        workflowType: "task.draft.generate",
        input: {
          message: "Create API task",
        },
        contextRefs: [],
      },
      UUIDS.member,
    );

    const action = controller.approveAction(run.actions[0].id, UUIDS.member);

    assert.equal(action.status, "confirmed");
    assert.equal(action.confirmedByMemberId, UUIDS.member);
    assert.equal(action.executedAt, null);

    const fetched = controller.getRun(run.id, UUIDS.member);
    assert.equal(fetched.status, "running");
    assert.equal(fetched.pendingActionCount, 1);
    assert.equal(fetched.actions[0].status, "confirmed");
  });

  it("rejects a waiting action as a terminal state", () => {
    const controller = new AgentRuntimeController(new AgentRuntimeService());
    const run = controller.createRun(
      UUIDS.workspace,
      {
        workflowType: "task.draft.generate",
        input: {
          message: "Create dashboard task",
        },
        contextRefs: [],
      },
      UUIDS.member,
    );

    const action = controller.rejectAction(run.actions[0].id, UUIDS.member);

    assert.equal(action.status, "rejected");
    assert.equal(action.confirmedByMemberId, null);
    assert.equal(action.executedAt, null);

    const fetched = controller.getRun(run.id, UUIDS.member);
    assert.equal(fetched.status, "succeeded");
    assert.equal(fetched.pendingActionCount, 0);
    assert.equal(fetched.actions[0].status, "rejected");
  });

  it("requires the current mock member boundary for HTTP routes", () => {
    const controller = new AgentRuntimeController(new AgentRuntimeService());

    assert.throws(
      () =>
        controller.createRun(
          UUIDS.workspace,
          {
            workflowType: "task.draft.generate",
            input: {},
            contextRefs: [],
          },
          undefined,
        ),
      BadRequestException,
    );
    assert.throws(
      () => controller.getRun(UUIDS.workspace, undefined),
      BadRequestException,
    );
  });

  it("surfaces missing run and action errors", () => {
    const controller = new AgentRuntimeController(new AgentRuntimeService());

    assert.throws(
      () => controller.getRun(UUIDS.workspace, UUIDS.member),
      NotFoundException,
    );
    assert.throws(
      () => controller.approveAction(UUIDS.workspace, UUIDS.member),
      NotFoundException,
    );
    assert.throws(
      () => controller.rejectAction(UUIDS.workspace, UUIDS.member),
      NotFoundException,
    );
  });

  it("is callable through the app-server /api prefix", async () => {
    const previousSkipDatabaseConnect =
      globalThis.process.env.PILO_SKIP_DATABASE_CONNECT;
    globalThis.process.env.PILO_SKIP_DATABASE_CONNECT = "true";
    const app = await NestFactory.create(AgentModule, new FastifyAdapter(), {
      logger: false,
    });
    configureApp(app);

    try {
      await app.init();
      const server = app.getHttpAdapter().getInstance();
      await server.ready();

      const createResponse = await server.inject({
        method: "POST",
        url: `/api/workspaces/${UUIDS.workspace}/agent-runs`,
        headers: {
          "content-type": "application/json",
          "x-member-id": UUIDS.member,
        },
        payload: JSON.stringify({
          workflowType: "task.draft.generate",
          input: {
            message: "Implement OAuth callback",
          },
          contextRefs: [],
        }),
      });
      assert.equal(createResponse.statusCode, 201);
      const run = JSON.parse(createResponse.payload);
      assert.equal(run.status, "requires_confirmation");
      assert.equal(run.actions[0].status, "waiting_confirmation");

      const getResponse = await server.inject({
        method: "GET",
        url: `/api/agent-runs/${run.id}`,
        headers: {
          "x-member-id": UUIDS.member,
        },
      });
      assert.equal(getResponse.statusCode, 200);
      assert.equal(JSON.parse(getResponse.payload).id, run.id);

      const approveResponse = await server.inject({
        method: "POST",
        url: `/api/agent-actions/${run.actions[0].id}/approve`,
        headers: {
          "x-member-id": UUIDS.member,
        },
      });
      assert.equal(approveResponse.statusCode, 200);
      const approvedAction = JSON.parse(approveResponse.payload);
      assert.equal(approvedAction.status, "confirmed");
      assert.equal(approvedAction.executedAt, null);

      const rejectedRunResponse = await server.inject({
        method: "POST",
        url: `/api/workspaces/${UUIDS.workspace}/agent-runs`,
        headers: {
          "content-type": "application/json",
          "x-member-id": UUIDS.member,
        },
        payload: JSON.stringify({
          workflowType: "task.draft.generate",
          input: {
            message: "Reject this task draft",
          },
          contextRefs: [],
        }),
      });
      const rejectedRun = JSON.parse(rejectedRunResponse.payload);
      const rejectResponse = await server.inject({
        method: "POST",
        url: `/api/agent-actions/${rejectedRun.actions[0].id}/reject`,
        headers: {
          "x-member-id": UUIDS.member,
        },
      });
      assert.equal(rejectResponse.statusCode, 200);
      assert.equal(JSON.parse(rejectResponse.payload).status, "rejected");
    } finally {
      await app.close();
      if (previousSkipDatabaseConnect === undefined) {
        delete globalThis.process.env.PILO_SKIP_DATABASE_CONNECT;
      } else {
        globalThis.process.env.PILO_SKIP_DATABASE_CONNECT =
          previousSkipDatabaseConnect;
      }
    }
  });
});

function assertRoute(methodName, method, path) {
  const handler = AgentRuntimeController.prototype[methodName];
  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), method);
  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), path);
}
