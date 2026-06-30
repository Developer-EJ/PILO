import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

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
  AgentOwnerActionExecutorService,
} = require("../src/modules/agent/agent-owner-action.executor");
const {
  AgentRuntimeService,
} = require("../src/modules/agent/agent-runtime.service");
const {
  JuhyungTaskDraftPublicWriteAdapter,
} = require("../src/modules/juhyung/public/task-draft-public-write.adapter");
const {
  JuhyungPublicAdapter,
} = require("../src/modules/juhyung/juhyung-public.adapter");
const {
  JuhyungTaskService,
} = require("../src/modules/juhyung/juhyung-task.service");
const { MeetingService } = require("../src/modules/meeting/meeting.service");
const {
  MockMeetingRepository,
} = require("../src/modules/meeting/repositories/meeting.mock-repository");
const {
  MockCurrentMemberAdapter,
} = require("../src/modules/meeting/adapters/mock-current-member.adapter");
const {
  MockMeetingReportWorkflowClient,
} = require("../src/modules/meeting/adapters/mock-meeting-report-workflow.adapter");
const {
  MeetingActionItemTaskDraftSourceAdapter,
} = require("../src/modules/meeting/public/meeting-action-item-taskdraft-source.adapter");

const __dirname = dirname(fileURLToPath(import.meta.url));

const UUIDS = {
  workspace: "11111111-1111-4111-8111-111111111111",
  member: "22222222-2222-4222-8222-222222222222",
  taskDraft: "33333333-3333-4333-8333-333333333333",
  user: "44444444-4444-4444-8444-444444444444",
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
    assertRoute(
      "executeAction",
      RequestMethod.POST,
      "agent-actions/:actionId/execute",
    );
  });

  it("creates and reads task draft runs without owner domain writes", () => {
    const controller = createController();

    const run = controller.createRun(
      UUIDS.workspace,
      {
        workflowType: "task.draft.generate",
        workflowVersion: "v1",
        input: {
          message: "Implement OAuth callback",
          githubToken: "should-not-leak",
          nested: {
            secret: "should-not-leak",
            password: "should-not-leak",
            privateKey: "should-not-leak",
          },
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
    assert.equal(run.input.nested.secret, "[redacted]");
    assert.equal(run.input.nested.password, "[redacted]");
    assert.equal(run.input.nested.privateKey, "[redacted]");

    const fetched = controller.getRun(run.id, UUIDS.member);
    assert.equal(fetched.id, run.id);
    assert.equal(fetched.actions[0].status, "waiting_confirmation");
  });

  it("approves a waiting action without executing the owner boundary", () => {
    const controller = createController();
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

  it("executes a confirmed task.create.draft through the owner boundary", async () => {
    const stack = createTaskDraftExecutorStack();
    const controller = createController(
      new AgentRuntimeService(),
      stack.executor,
    );
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

    assert.equal(run.actions[0].status, "waiting_confirmation");
    const approvedAction = controller.approveAction(
      run.actions[0].id,
      UUIDS.member,
    );
    assert.equal(approvedAction.status, "confirmed");
    assert.equal(stack.taskDrafts.length, 0);

    const executedAction = await controller.executeAction(
      run.actions[0].id,
      UUIDS.member,
    );

    assert.equal(stack.calls.length, 2);
    assert.deepEqual(stack.calls[0], [
      "access",
      UUIDS.workspace,
      { memberId: UUIDS.member },
    ]);
    assert.equal(stack.calls[1][0], "createDraft");
    assert.equal(stack.calls[1][2], UUIDS.member);
    assert.equal(stack.taskDrafts.length, 1);
    assert.equal(stack.taskDrafts[0].id, UUIDS.taskDraft);
    assert.notEqual(stack.taskDrafts[0].id, run.actions[0].id);
    assert.equal(executedAction.status, "executed");
    assert.equal(typeof executedAction.executedAt, "string");

    const fetched = controller.getRun(run.id, UUIDS.member);
    assert.equal(fetched.status, "succeeded");
    assert.equal(fetched.pendingActionCount, 0);
    assert.equal(
      fetched.trace.some(
        (entry) =>
          entry.message === "agent action executed by owner boundary" &&
          entry.metadata.result.targetEntityId === UUIDS.taskDraft &&
          entry.metadata.result.detail.taskDraft.id === UUIDS.taskDraft &&
          entry.metadata.result.detail.taskDraft.status === "draft",
      ),
      true,
    );
  });

  it("creates a Meeting ActionItem task.create.draft candidate and executes only after approval", async () => {
    const meetingStack = createMeetingActionItemSourceStack();
    const taskStack = createTaskDraftExecutorStack();
    const controller = createController(
      new AgentRuntimeService(meetingStack.source),
      taskStack.executor,
    );

    const run = controller.createRun(
      UUIDS.workspace,
      {
        workflowType: "meeting.action-item.to-task-draft",
        input: {
          meetingId: meetingStack.meeting.id,
          actionItemId: meetingStack.actionItem.id,
        },
        contextRefs: [
          {
            type: "meeting_action_item",
            id: meetingStack.actionItem.id,
          },
        ],
      },
      UUIDS.member,
    );

    assert.equal(run.status, "requires_confirmation");
    assert.equal(taskStack.taskDrafts.length, 0);
    assert.equal(run.actions.length, 1);
    assert.equal(run.actions[0].type, "task.create.draft");
    assert.equal(run.actions[0].source, "meeting");
    assert.equal(run.actions[0].status, "waiting_confirmation");
    assert.deepEqual(run.actions[0].payload, {
      workspaceId: UUIDS.workspace,
      sourceType: "meeting_action_item",
      sourceId: meetingStack.actionItem.id,
      title: "Turn meeting action item into a task draft",
      description: "Preserve the MeetingActionItem source through Agent.",
      assigneeMemberId: UUIDS.member,
      priority: "medium",
      dueDate: "2026-07-03",
    });

    const approvedAction = controller.approveAction(
      run.actions[0].id,
      UUIDS.member,
    );

    assert.equal(approvedAction.status, "confirmed");
    assert.equal(approvedAction.executedAt, null);
    assert.equal(taskStack.taskDrafts.length, 0);

    const executedAction = await controller.executeAction(
      run.actions[0].id,
      UUIDS.member,
    );

    assert.equal(executedAction.status, "executed");
    assert.equal(typeof executedAction.executedAt, "string");
    assert.equal(taskStack.taskDrafts.length, 1);
    assert.equal(taskStack.taskDrafts[0].id, UUIDS.taskDraft);
    assert.equal(taskStack.taskDrafts[0].sourceType, "meeting_action_item");
    assert.equal(taskStack.taskDrafts[0].sourceId, meetingStack.actionItem.id);

    const fetched = controller.getRun(run.id, UUIDS.member);
    assert.equal(fetched.status, "succeeded");
    assert.equal(fetched.pendingActionCount, 0);
    assert.equal(
      fetched.trace.some(
        (entry) =>
          entry.message === "agent action executed by owner boundary" &&
          entry.metadata.result.detail.taskDraft.id === UUIDS.taskDraft &&
          entry.metadata.result.detail.taskDraft.sourceType ===
            "meeting_action_item" &&
          entry.metadata.result.detail.taskDraft.sourceId ===
            meetingStack.actionItem.id,
      ),
      true,
    );
  });

  it("fails the Meeting ActionItem workflow when the source item is unavailable", () => {
    const meetingStack = createMeetingActionItemSourceStack();
    const controller = createController(
      new AgentRuntimeService(meetingStack.source),
    );

    const run = controller.createRun(
      UUIDS.workspace,
      {
        workflowType: "meeting.action-item.to-task-draft",
        input: {
          meetingId: meetingStack.meeting.id,
          actionItemId: "missing-action-item",
        },
        contextRefs: [],
      },
      UUIDS.member,
    );

    assert.equal(run.status, "failed");
    assert.equal(run.actions.length, 0);
    assert.equal(run.error.message, "Meeting action item not found");
    assert.equal(
      run.trace.some((entry) => entry.message === "local workflow failed"),
      true,
    );
  });

  it("rejects a waiting action as a terminal state", () => {
    const controller = createController();
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

  it("does not execute rejected or already executed actions", async () => {
    const controller = createController();
    const rejectedRun = controller.createRun(
      UUIDS.workspace,
      {
        workflowType: "task.draft.generate",
        input: {
          message: "Reject this task draft",
        },
        contextRefs: [],
      },
      UUIDS.member,
    );
    controller.rejectAction(rejectedRun.actions[0].id, UUIDS.member);

    await assert.rejects(
      () => controller.executeAction(rejectedRun.actions[0].id, UUIDS.member),
      BadRequestException,
    );
    assert.equal(
      controller.getRun(rejectedRun.id, UUIDS.member).actions[0].status,
      "rejected",
    );

    const executedRun = controller.createRun(
      UUIDS.workspace,
      {
        workflowType: "task.draft.generate",
        input: {
          message: "Execute once",
        },
        contextRefs: [],
      },
      UUIDS.member,
    );
    controller.approveAction(executedRun.actions[0].id, UUIDS.member);
    await controller.executeAction(executedRun.actions[0].id, UUIDS.member);

    await assert.rejects(
      () => controller.executeAction(executedRun.actions[0].id, UUIDS.member),
      BadRequestException,
    );
    assert.equal(
      controller.getRun(executedRun.id, UUIDS.member).actions[0].status,
      "executed",
    );
  });

  it("marks unsupported confirmed actions as failed at the execute boundary", async () => {
    const controller = createController();
    const run = controller.createRun(
      UUIDS.workspace,
      {
        workflowType: "review.analysis.generate",
        input: {
          pullRequestId: "44444444-4444-4444-8444-444444444444",
        },
        contextRefs: [],
      },
      UUIDS.member,
    );
    controller.approveAction(run.actions[0].id, UUIDS.member);

    const action = await controller.executeAction(
      run.actions[0].id,
      UUIDS.member,
    );

    assert.equal(action.status, "failed");
    const fetched = controller.getRun(run.id, UUIDS.member);
    assert.equal(fetched.status, "failed");
    assert.equal(
      fetched.error.message,
      "Only task.create.draft execution is supported",
    );
    assert.equal(
      fetched.trace.some(
        (entry) => entry.message === "agent action execution failed",
      ),
      true,
    );
    await assert.rejects(
      () => controller.executeAction(run.actions[0].id, UUIDS.member),
      BadRequestException,
    );
  });

  it("requires the current mock member boundary for HTTP routes", async () => {
    const controller = createController();

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
    await assert.rejects(
      () => controller.executeAction(UUIDS.workspace, undefined),
      BadRequestException,
    );
  });

  it("surfaces missing run and action errors", async () => {
    const controller = createController();

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
    await assert.rejects(
      () => controller.executeAction(UUIDS.workspace, UUIDS.member),
      NotFoundException,
    );
  });

  it("keeps Agent runtime free of owner service and repository imports", () => {
    const checkedFiles = [
      "../src/modules/agent/agent-runtime.controller.ts",
      "../src/modules/agent/agent-runtime.service.ts",
      "../src/modules/agent/agent-owner-action.executor.ts",
      "../src/modules/agent/agent.module.ts",
    ];

    for (const file of checkedFiles) {
      const source = readFileSync(resolve(__dirname, file), "utf8");
      assert.doesNotMatch(source, /from\s+["']\.\.\/review(?:\/|["'])/);
      assert.doesNotMatch(
        source,
        /from\s+["']\.\.\/meeting\/(?!(?:public\/|meeting\.module["']))/,
      );
      assert.doesNotMatch(
        source,
        /from\s+["']\.\.\/juhyung\/(?!(?:public\/|juhyung\.module["']))/,
      );
      assert.doesNotMatch(
        source,
        /JuhyungTaskService|JuhyungRepository|@prisma\/client|PrismaClient|MeetingService|MeetingRepository|Review\w*Service|Review\w*Repository/,
      );
    }
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

function createController(
  runtimeService = new AgentRuntimeService(),
  ownerExecutor = createTaskDraftExecutorStack().executor,
) {
  return new AgentRuntimeController(runtimeService, ownerExecutor);
}

function createMeetingActionItemSourceStack() {
  const repository = new MockMeetingRepository();
  const currentMemberAdapter = new MockCurrentMemberAdapter();
  currentMemberAdapter.registerWorkspaceMember({
    id: UUIDS.member,
    workspaceId: UUIDS.workspace,
    displayName: "Sein",
  });
  const taskDraftClient = {
    createTaskDraft() {
      throw new Error(
        "TaskDraft writes are not expected during source mapping",
      );
    },
  };
  const service = new MeetingService(
    repository,
    currentMemberAdapter,
    new MockMeetingReportWorkflowClient(),
    taskDraftClient,
  );
  const meeting = service.createMeeting(UUIDS.workspace, {
    title: "Meeting ActionItem integration",
  });
  const report = service.createReport(meeting.id);
  const actionItem = service.createActionItem(report.id, {
    title: "Turn meeting action item into a task draft",
    description: "Preserve the MeetingActionItem source through Agent.",
    assigneeSuggestionMemberId: UUIDS.member,
    dueDateSuggestion: "2026-07-03",
  });
  const source = new MeetingActionItemTaskDraftSourceAdapter(repository);

  return {
    actionItem,
    meeting,
    report,
    source,
  };
}

function createTaskDraftExecutorStack() {
  const calls = [];
  const taskDrafts = [];
  const repository = {
    createTaskDraft: async (input, createdByMemberId) => {
      calls.push(["createDraft", input, createdByMemberId]);
      const draft = {
        id: UUIDS.taskDraft,
        workspaceId: input.workspaceId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        title: input.title,
        description: input.description,
        assigneeMemberId: input.assigneeMemberId,
        priority: input.priority,
        dueDate: input.dueDate,
        status: "draft",
        taskId: null,
        createdByMemberId,
        createdAt: new Date("2026-06-28T10:00:00.000Z"),
        updatedAt: new Date("2026-06-28T10:00:00.000Z"),
      };
      taskDrafts.push(draft);
      return draft;
    },
  };
  const workspaceAccess = {
    requireWorkspaceMember: async (workspaceId, actor) => {
      calls.push(["access", workspaceId, actor]);
      return {
        id: actor?.memberId ?? UUIDS.member,
        workspaceId,
        userId: UUIDS.user,
        role: "member",
      };
    },
  };
  const taskService = new JuhyungTaskService(
    repository,
    workspaceAccess,
    new JuhyungPublicAdapter(),
  );
  const taskDraftWriter = new JuhyungTaskDraftPublicWriteAdapter(taskService);
  const executor = new AgentOwnerActionExecutorService(taskDraftWriter);

  return {
    calls,
    executor,
    taskDrafts,
  };
}
