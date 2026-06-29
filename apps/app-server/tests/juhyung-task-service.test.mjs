import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const { ForbiddenException } = require("@nestjs/common");
const {
  JuhyungTaskService,
} = require("../src/modules/juhyung/juhyung-task.service");

describe("JuhyungTaskService", () => {
  it("validates workspace members through the workspace public boundary before creating a task", async () => {
    const calls = [];
    const workspaceAccess = {
      requireWorkspaceMember: async (workspaceId, actor) => {
        calls.push(["workspace.requireWorkspaceMember", workspaceId, actor]);
        return { id: "member-1", workspaceId };
      },
      requireWorkspaceMemberById: async (workspaceId, memberId) => {
        calls.push([
          "workspace.requireWorkspaceMemberById",
          workspaceId,
          memberId,
        ]);
        return { id: memberId, workspaceId };
      },
    };
    const repository = {
      createTask: async (input, createdByMemberId) => {
        calls.push(["repository.createTask", input, createdByMemberId]);
        return { id: "task-1", ...input, createdByMemberId };
      },
    };
    const service = new JuhyungTaskService(repository, workspaceAccess);

    const task = await service.createTask(
      {
        workspaceId: "workspace-1",
        title: "Connect GitHub repository",
        description: null,
        assigneeMemberId: "member-2",
        status: "todo",
        priority: "high",
        dueDate: null,
        milestoneId: null,
      },
      { userId: "user-1", memberId: "member-1" },
    );

    assert.equal(task.createdByMemberId, "member-1");
    assert.deepEqual(calls, [
      [
        "workspace.requireWorkspaceMember",
        "workspace-1",
        { userId: "user-1", memberId: "member-1" },
      ],
      ["workspace.requireWorkspaceMemberById", "workspace-1", "member-2"],
      [
        "repository.createTask",
        {
          workspaceId: "workspace-1",
          title: "Connect GitHub repository",
          description: null,
          assigneeMemberId: "member-2",
          status: "todo",
          priority: "high",
          dueDate: null,
          milestoneId: null,
        },
        "member-1",
      ],
    ]);
  });

  it("rejects invalid assignees before calling the repository", async () => {
    const calls = [];
    const workspaceAccess = {
      requireWorkspaceMember: async (workspaceId) => {
        calls.push(["workspace.requireWorkspaceMember", workspaceId]);
        return { id: "member-1", workspaceId };
      },
      requireWorkspaceMemberById: async (workspaceId, memberId) => {
        calls.push([
          "workspace.requireWorkspaceMemberById",
          workspaceId,
          memberId,
        ]);
        throw new ForbiddenException("Workspace membership is required");
      },
    };
    const repository = {
      createTask: async () => {
        throw new Error("should not create a task with an invalid assignee");
      },
    };
    const service = new JuhyungTaskService(repository, workspaceAccess);

    await assert.rejects(
      () =>
        service.createTask(
          {
            workspaceId: "workspace-1",
            title: "Connect GitHub repository",
            description: null,
            assigneeMemberId: "member-2",
            status: "todo",
            priority: "high",
            dueDate: null,
            milestoneId: null,
          },
          { memberId: "member-1" },
        ),
      ForbiddenException,
    );
    assert.deepEqual(calls, [
      ["workspace.requireWorkspaceMember", "workspace-1"],
      ["workspace.requireWorkspaceMemberById", "workspace-1", "member-2"],
    ]);
  });
});
