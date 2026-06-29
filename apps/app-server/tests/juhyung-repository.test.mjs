import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  JUHYUNG_OWNER_TABLES,
  JuhyungRepository,
} = require("../src/modules/juhyung/juhyung.repository");

describe("JuhyungRepository", () => {
  it("tracks every Task/GitHub/Progress owner table", () => {
    assert.deepEqual(JUHYUNG_OWNER_TABLES, [
      "milestones",
      "tasks",
      "task_checklist_items",
      "task_comments",
      "task_activity_logs",
      "task_dependencies",
      "github_connections",
      "github_repositories",
      "github_issues",
      "github_issue_labels",
      "task_github_issues",
      "pull_requests",
      "task_pull_requests",
      "progress_snapshots",
    ]);
  });

  it("reads non-deleted tasks within one workspace", async () => {
    const calls = [];
    const database = {
      task: {
        findMany: async (args) => {
          calls.push(args);
          return [{ id: "task-1", workspaceId: "workspace-1" }];
        },
      },
    };
    const repository = new JuhyungRepository(database);

    const tasks = await repository.listTasksForWorkspace("workspace-1");

    assert.deepEqual(tasks, [{ id: "task-1", workspaceId: "workspace-1" }]);
    assert.deepEqual(calls, [
      {
        where: {
          workspaceId: "workspace-1",
          deletedAt: null,
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      },
    ]);
  });

  it("filters tasks by status, assignee, priority, due date, and milestone", async () => {
    const calls = [];
    const database = {
      task: {
        findMany: async (args) => {
          calls.push(args);
          return [];
        },
      },
    };
    const repository = new JuhyungRepository(database);

    await repository.listTasksForWorkspace("workspace-1", {
      status: ["todo", "blocked"],
      assigneeMemberId: "member-2",
      priority: ["high"],
      dueDateFrom: new Date("2026-07-01T00:00:00.000Z"),
      dueDateTo: new Date("2026-07-31T00:00:00.000Z"),
      milestoneId: "milestone-1",
      sortBy: "dueDate",
      sortDirection: "asc",
      limit: 25,
      offset: 50,
    });

    assert.deepEqual(calls, [
      {
        where: {
          workspaceId: "workspace-1",
          deletedAt: null,
          status: {
            in: ["todo", "blocked"],
          },
          assigneeMemberId: "member-2",
          priority: {
            in: ["high"],
          },
          dueDate: {
            gte: new Date("2026-07-01T00:00:00.000Z"),
            lte: new Date("2026-07-31T00:00:00.000Z"),
          },
          milestoneId: "milestone-1",
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }, { id: "asc" }],
        take: 25,
        skip: 50,
      },
    ]);
  });

  it("applies take and skip so large task lists can be paginated", async () => {
    const calls = [];
    const database = {
      task: {
        findMany: async (args) => {
          calls.push(args);
          return Array.from({ length: 100 }, (_, index) => ({
            id: `task-${index + 1}`,
            workspaceId: "workspace-1",
          }));
        },
      },
    };
    const repository = new JuhyungRepository(database);

    await repository.listTasksForWorkspace("workspace-1", {
      sortBy: "updatedAt",
      sortDirection: "desc",
      limit: 100,
      offset: 200,
    });

    assert.equal(calls[0].take, 100);
    assert.equal(calls[0].skip, 200);
    assert.deepEqual(calls[0].orderBy, [
      { updatedAt: "desc" },
      { createdAt: "desc" },
      { id: "asc" },
    ]);
  });

  it("reads one non-deleted task by id", async () => {
    const calls = [];
    const database = {
      task: {
        findFirst: async (args) => {
          calls.push(args);
          return { id: "task-1", deletedAt: null };
        },
      },
    };
    const repository = new JuhyungRepository(database);

    const task = await repository.getTaskById("task-1");

    assert.deepEqual(task, { id: "task-1", deletedAt: null });
    assert.deepEqual(calls, [
      {
        where: {
          id: "task-1",
          deletedAt: null,
        },
      },
    ]);
  });

  it("loads workspace members by ids for public assignee summaries", async () => {
    const calls = [];
    const database = {
      workspaceMember: {
        findMany: async (args) => {
          calls.push(args);
          return [{ id: "member-1", workspaceId: "workspace-1" }];
        },
      },
    };
    const repository = new JuhyungRepository(database);

    const members = await repository.listWorkspaceMembersByIds("workspace-1", [
      "member-1",
      "member-2",
    ]);

    assert.deepEqual(members, [{ id: "member-1", workspaceId: "workspace-1" }]);
    assert.deepEqual(calls, [
      {
        where: {
          workspaceId: "workspace-1",
          id: {
            in: ["member-1", "member-2"],
          },
        },
      },
    ]);
  });

  it("writes new tasks with the current workspace member as creator", async () => {
    const calls = [];
    const database = {
      task: {
        create: async (args) => {
          calls.push(["task.create", args]);
          return { id: "task-1", ...args.data };
        },
      },
    };
    const repository = new JuhyungRepository(database);

    const task = await repository.createTask(
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
    );

    assert.equal(task.createdByMemberId, "member-1");
    assert.deepEqual(calls, [
      [
        "task.create",
        {
          data: {
            workspaceId: "workspace-1",
            title: "Connect GitHub repository",
            description: null,
            assigneeMemberId: "member-2",
            status: "todo",
            priority: "high",
            dueDate: null,
            milestoneId: null,
            createdByMemberId: "member-1",
          },
        },
      ],
    ]);
  });

  it("rejects task creation when the milestone is outside the workspace", async () => {
    const calls = [];
    const database = {
      milestone: {
        findFirst: async (args) => {
          calls.push(["milestone.findFirst", args]);
          return null;
        },
      },
      task: {
        create: async () => {
          throw new Error("should not create a task with an invalid creator");
        },
      },
    };
    const repository = new JuhyungRepository(database);

    await assert.rejects(
      () =>
        repository.createTask(
          {
            workspaceId: "workspace-1",
            title: "Connect GitHub repository",
            description: null,
            assigneeMemberId: null,
            status: "todo",
            priority: "high",
            dueDate: null,
            milestoneId: "milestone-2",
          },
          "member-1",
        ),
      /milestone must belong to the task workspace/,
    );
    assert.deepEqual(calls, [
      [
        "milestone.findFirst",
        {
          where: {
            id: "milestone-2",
            workspaceId: "workspace-1",
          },
        },
      ],
    ]);
  });

  it("patches task fields without changing deleted tasks directly", async () => {
    const calls = [];
    const database = {
      task: {
        update: async (args) => {
          calls.push(args);
          return { id: "task-1", ...args.data };
        },
      },
    };
    const repository = new JuhyungRepository(database);

    const task = await repository.updateTask("task-1", {
      title: "Updated task",
      description: "Updated description",
      assigneeMemberId: "member-2",
      dueDate: new Date("2026-07-04T00:00:00.000Z"),
      milestoneId: null,
    });

    assert.equal(task.title, "Updated task");
    assert.deepEqual(calls, [
      {
        where: {
          id: "task-1",
        },
        data: {
          title: "Updated task",
          description: "Updated description",
          assigneeMemberId: "member-2",
          dueDate: new Date("2026-07-04T00:00:00.000Z"),
          milestoneId: null,
        },
      },
    ]);
  });

  it("updates task status and writes the activity log in one transaction", async () => {
    const calls = [];
    const transaction = {
      task: {
        update: async (args) => {
          calls.push(["task.update", args]);
          return { id: "task-1", status: args.data.status };
        },
      },
      taskActivityLog: {
        create: async (args) => {
          calls.push(["activity.create", args]);
        },
      },
    };
    const database = {
      $transaction: async (callback) => callback(transaction),
    };
    const repository = new JuhyungRepository(database);

    const task = await repository.updateTaskStatus(
      "task-1",
      "in_review",
      "member-1",
      "todo",
    );

    assert.deepEqual(task, { id: "task-1", status: "in_review" });
    assert.deepEqual(calls, [
      [
        "task.update",
        {
          where: {
            id: "task-1",
          },
          data: {
            status: "in_review",
          },
        },
      ],
      [
        "activity.create",
        {
          data: {
            taskId: "task-1",
            actorMemberId: "member-1",
            action: "task.status_changed",
            beforeValue: {
              status: "todo",
            },
            afterValue: {
              status: "in_review",
            },
          },
        },
      ],
    ]);
  });

  it("soft deletes tasks by setting deletedAt", async () => {
    const calls = [];
    const database = {
      task: {
        update: async (args) => {
          calls.push(args);
          return { id: "task-1", ...args.data };
        },
      },
    };
    const repository = new JuhyungRepository(database);

    const task = await repository.softDeleteTask("task-1");

    assert.ok(task.deletedAt instanceof Date);
    assert.deepEqual(calls[0].where, { id: "task-1" });
    assert.ok(calls[0].data.deletedAt instanceof Date);
  });

  it("reads checklist items in task sort order", async () => {
    const calls = [];
    const database = {
      taskChecklistItem: {
        findMany: async (args) => {
          calls.push(args);
          return [{ id: "item-1", taskId: "task-1", sortOrder: 0 }];
        },
      },
    };
    const repository = new JuhyungRepository(database);

    const items = await repository.listChecklistItemsForTask("task-1");

    assert.deepEqual(items, [{ id: "item-1", taskId: "task-1", sortOrder: 0 }]);
    assert.deepEqual(calls, [
      {
        where: {
          taskId: "task-1",
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    ]);
  });

  it("creates checklist items after shifting sort order collisions", async () => {
    const calls = [];
    const transaction = {
      taskChecklistItem: {
        updateMany: async (args) => {
          calls.push(["updateMany", args]);
        },
        create: async (args) => {
          calls.push(["create", args]);
          return { id: "item-1", ...args.data };
        },
      },
    };
    const database = {
      $transaction: async (callback) => callback(transaction),
    };
    const repository = new JuhyungRepository(database);

    const item = await repository.createChecklistItem("task-1", {
      title: "Install GitHub App",
      status: "todo",
      sortOrder: 1,
    });

    assert.equal(item.sortOrder, 1);
    assert.deepEqual(calls, [
      [
        "updateMany",
        {
          where: {
            taskId: "task-1",
            sortOrder: {
              gte: 1,
            },
          },
          data: {
            sortOrder: {
              increment: 1000000,
            },
          },
        },
      ],
      [
        "updateMany",
        {
          where: {
            taskId: "task-1",
            sortOrder: {
              gte: 1000001,
            },
          },
          data: {
            sortOrder: {
              decrement: 999999,
            },
          },
        },
      ],
      [
        "create",
        {
          data: {
            taskId: "task-1",
            title: "Install GitHub App",
            status: "todo",
            sortOrder: 1,
          },
        },
      ],
    ]);
  });

  it("appends checklist items when sort order is not provided", async () => {
    const calls = [];
    const database = {
      taskChecklistItem: {
        aggregate: async (args) => {
          calls.push(["aggregate", args]);
          return { _max: { sortOrder: 2 } };
        },
        create: async (args) => {
          calls.push(["create", args]);
          return { id: "item-3", ...args.data };
        },
      },
    };
    const repository = new JuhyungRepository(database);

    const item = await repository.createChecklistItem("task-1", {
      title: "Deploy smoke",
      status: "todo",
    });

    assert.equal(item.sortOrder, 3);
    assert.deepEqual(calls, [
      [
        "aggregate",
        {
          where: {
            taskId: "task-1",
          },
          _max: {
            sortOrder: true,
          },
        },
      ],
      [
        "create",
        {
          data: {
            taskId: "task-1",
            title: "Deploy smoke",
            status: "todo",
            sortOrder: 3,
          },
        },
      ],
    ]);
  });

  it("updates checklist items and reorders collisions inside one transaction", async () => {
    const calls = [];
    const transaction = {
      taskChecklistItem: {
        findFirst: async (args) => {
          calls.push(["findFirst", args]);
          return { id: "item-1", taskId: "task-1", sortOrder: 3 };
        },
        update: async (args) => {
          calls.push(["update", args]);
          return {
            id: args.where.id,
            taskId: "task-1",
            sortOrder: args.data.sortOrder ?? 1,
            title: args.data.title ?? "Install GitHub App",
            status: args.data.status ?? "done",
          };
        },
        updateMany: async (args) => {
          calls.push(["updateMany", args]);
        },
      },
    };
    const database = {
      $transaction: async (callback) => callback(transaction),
    };
    const repository = new JuhyungRepository(database);

    const item = await repository.updateChecklistItem("task-1", "item-1", {
      title: "Install and authorize GitHub App",
      status: "done",
      sortOrder: 1,
    });

    assert.equal(item.sortOrder, 1);
    assert.deepEqual(calls, [
      [
        "findFirst",
        {
          where: {
            id: "item-1",
            taskId: "task-1",
          },
        },
      ],
      [
        "update",
        {
          where: {
            id: "item-1",
          },
          data: {
            sortOrder: -1,
          },
        },
      ],
      [
        "updateMany",
        {
          where: {
            taskId: "task-1",
            sortOrder: {
              gte: 1,
              lt: 3,
            },
          },
          data: {
            sortOrder: {
              increment: 1000000,
            },
          },
        },
      ],
      [
        "updateMany",
        {
          where: {
            taskId: "task-1",
            sortOrder: {
              gte: 1000001,
              lt: 1000003,
            },
          },
          data: {
            sortOrder: {
              decrement: 999999,
            },
          },
        },
      ],
      [
        "update",
        {
          where: {
            id: "item-1",
          },
          data: {
            title: "Install and authorize GitHub App",
            status: "done",
            sortOrder: 1,
          },
        },
      ],
    ]);
  });

  it("deletes checklist items within the task boundary", async () => {
    const calls = [];
    const database = {
      taskChecklistItem: {
        deleteMany: async (args) => {
          calls.push(args);
          return { count: 1 };
        },
      },
    };
    const repository = new JuhyungRepository(database);

    await repository.deleteChecklistItem("task-1", "item-1");

    assert.deepEqual(calls, [
      {
        where: {
          id: "item-1",
          taskId: "task-1",
        },
      },
    ]);
  });
});
