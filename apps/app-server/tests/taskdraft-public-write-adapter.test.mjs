import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const { BadRequestException } = require("@nestjs/common");
const {
  JuhyungPublicAdapter,
} = require("../src/modules/juhyung/juhyung-public.adapter");
const {
  JuhyungTaskDraftPublicWriteAdapter,
} = require("../src/modules/juhyung/public/task-draft-public-write.adapter");
const {
  JuhyungTaskService,
} = require("../src/modules/juhyung/juhyung-task.service");

const UUIDS = {
  workspace: "11111111-1111-4111-8111-111111111111",
  member: "22222222-2222-4222-8222-222222222222",
  assignee: "33333333-3333-4333-8333-333333333333",
  user: "44444444-4444-4444-8444-444444444444",
  taskDraft: "55555555-5555-4555-8555-555555555555",
  source: "66666666-6666-4666-8666-666666666666",
  agentAction: "77777777-7777-4777-8777-777777777777",
};

describe("JuhyungTaskDraftPublicWriteAdapter", () => {
  it("creates an actual TaskDraftSummary through the Juhyung service boundary", async () => {
    const stack = createAdapterStack();

    const result = await stack.adapter.createTaskDraft({
      workspaceId: UUIDS.workspace,
      actorMemberId: UUIDS.member,
      payload: {
        workspaceId: UUIDS.workspace,
        sourceType: "agent_recommendation",
        sourceId: UUIDS.source,
        title: " Create public adapter task ",
        description: "Use the owner write boundary.",
        assigneeMemberId: UUIDS.assignee,
        priority: "urgent",
        dueDate: "2026-07-03",
      },
    });

    assert.deepEqual(result, {
      id: UUIDS.taskDraft,
      workspaceId: UUIDS.workspace,
      sourceType: "agent_recommendation",
      sourceId: UUIDS.source,
      title: "Create public adapter task",
      description: "Use the owner write boundary.",
      assigneeMemberId: UUIDS.assignee,
      priority: "urgent",
      dueDate: "2026-07-03",
      status: "draft",
      taskId: null,
      createdAt: "2026-06-28T10:00:00.000Z",
      updatedAt: "2026-06-28T10:00:00.000Z",
    });
    assert.notEqual(result.id, UUIDS.agentAction);
    assert.equal(stack.taskDrafts.length, 1);
    assert.equal(stack.calls[0][0], "access");
    assert.deepEqual(stack.calls[0][2], { memberId: UUIDS.member });
    assert.equal(stack.calls[1][0], "access");
    assert.deepEqual(stack.calls[1][2], { memberId: UUIDS.assignee });
    assert.equal(stack.calls[2][0], "createDraft");
    assert.equal(stack.calls[2][2], UUIDS.member);
    assert.equal(stack.calls[2][1].priority, "urgent");
    assert.ok(stack.calls[2][1].dueDate instanceof Date);
  });

  it("rejects one-sided sourceType/sourceId payloads", async () => {
    const stack = createAdapterStack();

    await assert.rejects(
      () =>
        stack.adapter.createTaskDraft({
          workspaceId: UUIDS.workspace,
          actorMemberId: UUIDS.member,
          payload: {
            workspaceId: UUIDS.workspace,
            sourceType: "agent_recommendation",
            title: "Missing source id",
          },
        }),
      BadRequestException,
    );
    assert.equal(stack.taskDrafts.length, 0);
  });

  it("keeps priority and status within the public TaskDraft contract", async () => {
    const stack = createAdapterStack();

    await assert.rejects(
      () =>
        stack.adapter.createTaskDraft({
          workspaceId: UUIDS.workspace,
          actorMemberId: UUIDS.member,
          payload: {
            workspaceId: UUIDS.workspace,
            title: "Invalid priority",
            priority: "later",
          },
        }),
      BadRequestException,
    );

    const result = await stack.adapter.createTaskDraft({
      workspaceId: UUIDS.workspace,
      actorMemberId: UUIDS.member,
      payload: {
        workspaceId: UUIDS.workspace,
        title: "Valid priority",
        priority: "low",
      },
    });
    assert.equal(result.priority, "low");
    assert.equal(result.status, "draft");
    assert.equal(result.taskId, null);
  });
});

function createAdapterStack() {
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
  const service = new JuhyungTaskService(
    repository,
    workspaceAccess,
    new JuhyungPublicAdapter(),
  );

  return {
    adapter: new JuhyungTaskDraftPublicWriteAdapter(service),
    calls,
    taskDrafts,
  };
}
