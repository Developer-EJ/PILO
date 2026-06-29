import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const { BadRequestException, NotFoundException } = require("@nestjs/common");
const {
  JuhyungPublicAdapter,
} = require("../src/modules/juhyung/juhyung-public.adapter");
const {
  JuhyungTaskService,
} = require("../src/modules/juhyung/juhyung-task.service");
const {
  JuhyungTasksController,
} = require("../src/modules/juhyung/juhyung-tasks.controller");

const UUIDS = {
  workspace: "11111111-1111-4111-8111-111111111111",
  task: "22222222-2222-4222-8222-222222222222",
  member: "33333333-3333-4333-8333-333333333333",
  assignee: "44444444-4444-4444-8444-444444444444",
  user: "55555555-5555-4555-8555-555555555555",
};

const baseTask = {
  id: UUIDS.task,
  workspaceId: UUIDS.workspace,
  milestoneId: null,
  title: "Connect repository",
  description: null,
  assigneeMemberId: UUIDS.assignee,
  status: "todo",
  priority: "high",
  dueDate: new Date("2026-07-03T00:00:00.000Z"),
  createdByMemberId: UUIDS.member,
  createdAt: new Date("2026-06-27T11:00:00.000Z"),
  updatedAt: new Date("2026-06-27T12:00:00.000Z"),
  deletedAt: null,
};

describe("JuhyungTaskService", () => {
  it("returns an empty TaskSummary list after workspace membership is verified", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        listTasksForWorkspace: async (workspaceId) => {
          calls.push(["list", workspaceId]);
          return [];
        },
        listWorkspaceMembersByIds: async () => {
          throw new Error("empty task list should not load members");
        },
      },
    });

    const result = await service.listTasks(UUIDS.workspace, {
      userId: UUIDS.user,
    });

    assert.deepEqual(result, []);
    assert.deepEqual(calls, [
      ["access", UUIDS.workspace, { userId: UUIDS.user }],
      ["list", UUIDS.workspace],
    ]);
  });

  it("creates a task with status, priority, assignee, due date, and creator member", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return actor.memberId === UUIDS.assignee
            ? assigneeMember()
            : currentMember();
        },
      },
      repository: {
        createTask: async (input, createdByMemberId) => {
          calls.push(["create", input, createdByMemberId]);
          assert.ok(input.dueDate instanceof Date);
          return {
            ...baseTask,
            ...input,
            createdByMemberId,
            updatedAt: new Date("2026-06-27T12:00:00.000Z"),
          };
        },
      },
    });

    const result = await service.createTask(
      UUIDS.workspace,
      {
        title: "Connect repository",
        description: "Install GitHub App",
        status: "in_progress",
        priority: "high",
        assigneeMemberId: UUIDS.assignee,
        dueDate: "2026-07-03",
      },
      { userId: UUIDS.user },
    );

    assert.equal(result.status, "in_progress");
    assert.equal(result.priority, "high");
    assert.deepEqual(result.assignee, {
      memberId: UUIDS.assignee,
      userId: UUIDS.user,
      name: "Assignee",
    });
    assert.equal(result.dueDate, "2026-07-03");
    assert.deepEqual(calls, [
      ["access", UUIDS.workspace, { userId: UUIDS.user }],
      ["access", UUIDS.workspace, { memberId: UUIDS.assignee }],
      [
        "create",
        {
          workspaceId: UUIDS.workspace,
          title: "Connect repository",
          description: "Install GitHub App",
          status: "in_progress",
          priority: "high",
          assigneeMemberId: UUIDS.assignee,
          dueDate: new Date("2026-07-03T00:00:00.000Z"),
          milestoneId: null,
        },
        UUIDS.member,
      ],
    ]);
  });

  it("rejects invalid task create input before writing to the repository", async () => {
    const service = createService({
      repository: {
        createTask: async () => {
          throw new Error("invalid input should not be written");
        },
      },
    });

    await assert.rejects(
      () =>
        service.createTask(
          UUIDS.workspace,
          {
            title: " ",
            priority: "later",
          },
          { memberId: UUIDS.member },
        ),
      BadRequestException,
    );
  });

  it("returns task detail only after checking membership in the task workspace", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return baseTask;
        },
        listWorkspaceMembersByIds: async (workspaceId, memberIds) => {
          calls.push(["members", workspaceId, memberIds]);
          return [assigneeMember()];
        },
      },
    });

    const result = await service.getTask(UUIDS.task, {
      memberId: UUIDS.member,
    });

    assert.equal(result.id, UUIDS.task);
    assert.equal(result.assignee?.name, "Assignee");
    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      ["members", UUIDS.workspace, [UUIDS.assignee]],
    ]);
  });

  it("throws NotFoundException when task detail does not exist", async () => {
    const service = createService({
      repository: {
        getTaskById: async () => null,
      },
    });

    await assert.rejects(
      () => service.getTask(UUIDS.task, { memberId: UUIDS.member }),
      NotFoundException,
    );
  });

  it("patches mutable task fields after checking workspace and assignee membership", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return actor.memberId === UUIDS.assignee
            ? assigneeMember()
            : currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return { ...baseTask, assigneeMemberId: null, dueDate: null };
        },
        updateTask: async (taskId, input) => {
          calls.push(["update", taskId, input]);
          return {
            ...baseTask,
            ...input,
            id: taskId,
            updatedAt: new Date("2026-06-28T12:00:00.000Z"),
          };
        },
      },
    });

    const result = await service.updateTask(
      UUIDS.task,
      {
        title: "Connect GitHub repository",
        description: "Install the GitHub App",
        assigneeMemberId: UUIDS.assignee,
        dueDate: "2026-07-04",
        milestoneId: null,
      },
      { memberId: UUIDS.member },
    );

    assert.equal(result.title, "Connect GitHub repository");
    assert.equal(result.dueDate, "2026-07-04");
    assert.deepEqual(result.assignee, {
      memberId: UUIDS.assignee,
      userId: UUIDS.user,
      name: "Assignee",
    });
    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      ["access", UUIDS.workspace, { memberId: UUIDS.assignee }],
      [
        "update",
        UUIDS.task,
        {
          title: "Connect GitHub repository",
          description: "Install the GitHub App",
          assigneeMemberId: UUIDS.assignee,
          dueDate: new Date("2026-07-04T00:00:00.000Z"),
          milestoneId: null,
        },
      ],
    ]);
  });

  it("rejects invalid task patch input before updating the repository", async () => {
    const service = createService({
      repository: {
        updateTask: async () => {
          throw new Error("invalid patch should not be written");
        },
      },
    });

    await assert.rejects(
      () =>
        service.updateTask(
          UUIDS.task,
          {
            title: " ",
          },
          { memberId: UUIDS.member },
        ),
      BadRequestException,
    );
  });

  it("changes task status and records an activity log actor", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return baseTask;
        },
        updateTaskStatus: async (
          taskId,
          status,
          actorMemberId,
          previousStatus,
        ) => {
          calls.push(["status", taskId, status, actorMemberId, previousStatus]);
          return {
            ...baseTask,
            id: taskId,
            status,
            updatedAt: new Date("2026-06-28T12:00:00.000Z"),
          };
        },
        listWorkspaceMembersByIds: async (workspaceId, memberIds) => {
          calls.push(["members", workspaceId, memberIds]);
          return [assigneeMember()];
        },
      },
    });

    const result = await service.updateTaskStatus(
      UUIDS.task,
      { status: "in_review" },
      { userId: UUIDS.user },
    );

    assert.equal(result.status, "in_review");
    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { userId: UUIDS.user }],
      ["status", UUIDS.task, "in_review", UUIDS.member, "todo"],
      ["members", UUIDS.workspace, [UUIDS.assignee]],
    ]);
  });

  it("rejects invalid status transitions before writing the repository", async () => {
    const service = createService({
      repository: {
        updateTaskStatus: async () => {
          throw new Error("invalid status should not be written");
        },
      },
    });

    await assert.rejects(
      () =>
        service.updateTaskStatus(
          UUIDS.task,
          {
            status: "archived",
          },
          { memberId: UUIDS.member },
        ),
      BadRequestException,
    );
  });

  it("soft deletes a task after checking workspace membership", async () => {
    const calls = [];
    const service = createService({
      access: {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["access", workspaceId, actor]);
          return currentMember();
        },
      },
      repository: {
        getTaskById: async (taskId) => {
          calls.push(["get", taskId]);
          return baseTask;
        },
        softDeleteTask: async (taskId) => {
          calls.push(["delete", taskId]);
        },
      },
    });

    await service.deleteTask(UUIDS.task, { memberId: UUIDS.member });

    assert.deepEqual(calls, [
      ["get", UUIDS.task],
      ["access", UUIDS.workspace, { memberId: UUIDS.member }],
      ["delete", UUIDS.task],
    ]);
  });
});

describe("JuhyungTasksController", () => {
  it("forwards task routes with workspace and actor context", async () => {
    const calls = [];
    const controller = new JuhyungTasksController({
      listTasks: async (workspaceId, actor) => {
        calls.push(["list", workspaceId, actor]);
        return [];
      },
      createTask: async (workspaceId, body, actor) => {
        calls.push(["create", workspaceId, body, actor]);
        return { id: UUIDS.task };
      },
      getTask: async (taskId, actor) => {
        calls.push(["get", taskId, actor]);
        return { id: taskId };
      },
      updateTask: async (taskId, body, actor) => {
        calls.push(["patch", taskId, body, actor]);
        return { id: taskId };
      },
      updateTaskStatus: async (taskId, body, actor) => {
        calls.push(["status", taskId, body, actor]);
        return { id: taskId };
      },
      deleteTask: async (taskId, actor) => {
        calls.push(["delete", taskId, actor]);
      },
    });

    await controller.listTasks(UUIDS.workspace, UUIDS.user, undefined);
    await controller.createTask(
      UUIDS.workspace,
      { title: "Connect repository" },
      undefined,
      UUIDS.member,
    );
    await controller.getTask(UUIDS.task, UUIDS.user, UUIDS.member);
    await controller.updateTask(
      UUIDS.task,
      { title: "Connect repository" },
      UUIDS.user,
      undefined,
    );
    await controller.updateTaskStatus(
      UUIDS.task,
      { status: "done" },
      undefined,
      UUIDS.member,
    );
    await controller.deleteTask(UUIDS.task, UUIDS.user, UUIDS.member);

    assert.deepEqual(calls, [
      ["list", UUIDS.workspace, { userId: UUIDS.user }],
      [
        "create",
        UUIDS.workspace,
        { title: "Connect repository" },
        { memberId: UUIDS.member },
      ],
      ["get", UUIDS.task, { userId: UUIDS.user, memberId: UUIDS.member }],
      [
        "patch",
        UUIDS.task,
        { title: "Connect repository" },
        { userId: UUIDS.user },
      ],
      ["status", UUIDS.task, { status: "done" }, { memberId: UUIDS.member }],
      ["delete", UUIDS.task, { userId: UUIDS.user, memberId: UUIDS.member }],
    ]);
  });
});

function createService(overrides = {}) {
  const access = overrides.access ?? {
    requireWorkspaceMember: async () => currentMember(),
  };
  const repository = overrides.repository ?? {};
  return new JuhyungTaskService(repository, access, new JuhyungPublicAdapter());
}

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
