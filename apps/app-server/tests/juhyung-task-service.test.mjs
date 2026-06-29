import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const { ForbiddenException } = require("@nestjs/common");
const {
  JuhyungPublicAdapter,
} = require("../src/modules/juhyung/juhyung-public.adapter");
const {
  JuhyungTaskService,
} = require("../src/modules/juhyung/juhyung-task.service");

const UUIDS = {
  workspace: "11111111-1111-4111-8111-111111111111",
  task: "22222222-2222-4222-8222-222222222222",
  member: "33333333-3333-4333-8333-333333333333",
  assignee: "44444444-4444-4444-8444-444444444444",
  user: "55555555-5555-4555-8555-555555555555",
};

describe("JuhyungTaskService", () => {
  it("validates workspace members through the workspace public boundary before creating a task", async () => {
    const calls = [];
    const workspaceAccess = {
      requireWorkspaceMember: async (workspaceId, actor) => {
        calls.push(["workspace.requireWorkspaceMember", workspaceId, actor]);
        return actor?.memberId === UUIDS.assignee
          ? assigneeMember()
          : currentMember();
      },
    };
    const repository = {
      createTask: async (input, createdByMemberId) => {
        calls.push(["repository.createTask", input, createdByMemberId]);
        return {
          id: UUIDS.task,
          ...input,
          createdByMemberId,
          updatedAt: new Date("2026-06-29T01:00:00.000Z"),
        };
      },
    };
    const service = new JuhyungTaskService(
      repository,
      workspaceAccess,
      new JuhyungPublicAdapter(),
    );

    const task = await service.createTask(
      UUIDS.workspace,
      {
        title: "Connect GitHub repository",
        description: null,
        assigneeMemberId: UUIDS.assignee,
        status: "todo",
        priority: "high",
        dueDate: null,
        milestoneId: null,
      },
      { userId: UUIDS.user, memberId: UUIDS.member },
    );

    assert.equal(task.id, UUIDS.task);
    assert.equal(task.assignee.memberId, UUIDS.assignee);
    assert.equal(task.assignee.name, "Assignee");
    assert.deepEqual(calls, [
      [
        "workspace.requireWorkspaceMember",
        UUIDS.workspace,
        { userId: UUIDS.user, memberId: UUIDS.member },
      ],
      [
        "workspace.requireWorkspaceMember",
        UUIDS.workspace,
        { memberId: UUIDS.assignee },
      ],
      [
        "repository.createTask",
        {
          workspaceId: UUIDS.workspace,
          title: "Connect GitHub repository",
          description: null,
          assigneeMemberId: UUIDS.assignee,
          status: "todo",
          priority: "high",
          dueDate: null,
          milestoneId: null,
        },
        UUIDS.member,
      ],
    ]);
  });

  it("rejects invalid assignees before calling the repository", async () => {
    const calls = [];
    const workspaceAccess = {
      requireWorkspaceMember: async (workspaceId, actor) => {
        calls.push(["workspace.requireWorkspaceMember", workspaceId, actor]);
        if (actor?.memberId === UUIDS.assignee) {
          throw new ForbiddenException("Workspace membership is required");
        }
        return currentMember();
      },
    };
    const repository = {
      createTask: async () => {
        throw new Error("should not create a task with an invalid assignee");
      },
    };
    const service = new JuhyungTaskService(
      repository,
      workspaceAccess,
      new JuhyungPublicAdapter(),
    );

    await assert.rejects(
      () =>
        service.createTask(
          UUIDS.workspace,
          {
            title: "Connect GitHub repository",
            description: null,
            assigneeMemberId: UUIDS.assignee,
            status: "todo",
            priority: "high",
            dueDate: null,
            milestoneId: null,
          },
          { memberId: UUIDS.member },
        ),
      ForbiddenException,
    );
    assert.deepEqual(calls, [
      ["workspace.requireWorkspaceMember", UUIDS.workspace, { memberId: UUIDS.member }],
      ["workspace.requireWorkspaceMember", UUIDS.workspace, { memberId: UUIDS.assignee }],
    ]);
  });
});

function currentMember() {
  return {
    id: UUIDS.member,
    workspaceId: UUIDS.workspace,
    userId: UUIDS.user,
    displayName: "Creator",
    role: "member",
  };
}

function assigneeMember() {
  return {
    id: UUIDS.assignee,
    workspaceId: UUIDS.workspace,
    userId: UUIDS.user,
    displayName: "Assignee",
    role: "member",
  };
}
