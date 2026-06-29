import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  JUHYUNG_OWNER_TABLES,
  JuhyungRepository,
} = require("../src/modules/juhyung/juhyung.repository");
const { Prisma } = require("@prisma/client");

describe("JuhyungRepository", () => {
  it("tracks every Task/GitHub/Progress owner table", () => {
    assert.deepEqual(JUHYUNG_OWNER_TABLES, [
      "milestones",
      "tasks",
      "task_drafts",
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

  it("reads milestones for one workspace in date order", async () => {
    const calls = [];
    const database = {
      milestone: {
        findMany: async (args) => {
          calls.push(args);
          return [{ id: "milestone-1", workspaceId: "workspace-1" }];
        },
      },
    };
    const repository = new JuhyungRepository(database);

    const milestones =
      await repository.listMilestonesForWorkspace("workspace-1");

    assert.deepEqual(milestones, [
      { id: "milestone-1", workspaceId: "workspace-1" },
    ]);
    assert.deepEqual(calls, [
      {
        where: {
          workspaceId: "workspace-1",
        },
        orderBy: [{ startDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      },
    ]);
  });

  it("writes milestones with optional dates and status", async () => {
    const calls = [];
    const database = {
      milestone: {
        create: async (args) => {
          calls.push(args);
          return { id: "milestone-1", ...args.data };
        },
      },
    };
    const repository = new JuhyungRepository(database);

    const milestone = await repository.createMilestone({
      workspaceId: "workspace-1",
      title: "MVP Backend",
      status: "in_progress",
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-07-31T00:00:00.000Z"),
    });

    assert.equal(milestone.title, "MVP Backend");
    assert.deepEqual(calls, [
      {
        data: {
          workspaceId: "workspace-1",
          title: "MVP Backend",
          status: "in_progress",
          startDate: new Date("2026-07-01T00:00:00.000Z"),
          endDate: new Date("2026-07-31T00:00:00.000Z"),
        },
      },
    ]);
  });

  it("reads and patches milestones by id", async () => {
    const calls = [];
    const database = {
      milestone: {
        findUnique: async (args) => {
          calls.push(["findUnique", args]);
          return { id: "milestone-1", workspaceId: "workspace-1" };
        },
        update: async (args) => {
          calls.push(["update", args]);
          return { id: "milestone-1", ...args.data };
        },
      },
    };
    const repository = new JuhyungRepository(database);

    const existing = await repository.getMilestoneById("milestone-1");
    const updated = await repository.updateMilestone("milestone-1", {
      title: "MVP Backend Updated",
      endDate: null,
    });

    assert.equal(existing.workspaceId, "workspace-1");
    assert.equal(updated.title, "MVP Backend Updated");
    assert.deepEqual(calls, [
      [
        "findUnique",
        {
          where: {
            id: "milestone-1",
          },
        },
      ],
      [
        "update",
        {
          where: {
            id: "milestone-1",
          },
          data: {
            title: "MVP Backend Updated",
            endDate: null,
          },
        },
      ],
    ]);
  });

  it("writes new tasks with the current workspace member as creator", async () => {
    const calls = [];
    const database = {
      task: {
        create: async (args) => {
          calls.push(args);
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
    ]);
  });

  it("writes task drafts with source metadata and creator member", async () => {
    const calls = [];
    const database = {
      taskDraft: {
        create: async (args) => {
          calls.push(args);
          return { id: "draft-1", ...args.data };
        },
      },
    };
    const repository = new JuhyungRepository(database);

    const draft = await repository.createTaskDraft(
      {
        workspaceId: "workspace-1",
        sourceType: "meeting_action_item",
        sourceId: "action-item-1",
        title: "Process OAuth callback",
        description: "Handle provider callbacks",
        assigneeMemberId: "member-2",
        priority: "high",
        dueDate: new Date("2026-07-03T00:00:00.000Z"),
      },
      "member-1",
    );

    assert.equal(draft.createdByMemberId, "member-1");
    assert.deepEqual(calls, [
      {
        data: {
          workspaceId: "workspace-1",
          sourceType: "meeting_action_item",
          sourceId: "action-item-1",
          title: "Process OAuth callback",
          description: "Handle provider callbacks",
          assigneeMemberId: "member-2",
          priority: "high",
          dueDate: new Date("2026-07-03T00:00:00.000Z"),
          status: "draft",
          taskId: null,
          createdByMemberId: "member-1",
        },
      },
    ]);
  });

  it("reads task drafts by id", async () => {
    const calls = [];
    const database = {
      taskDraft: {
        findUnique: async (args) => {
          calls.push(args);
          return { id: "draft-1", workspaceId: "workspace-1" };
        },
      },
    };
    const repository = new JuhyungRepository(database);

    const draft = await repository.getTaskDraftById("draft-1");

    assert.deepEqual(draft, { id: "draft-1", workspaceId: "workspace-1" });
    assert.deepEqual(calls, [
      {
        where: {
          id: "draft-1",
        },
      },
    ]);
  });

  it("approves task drafts by creating a task and updating the draft in one transaction", async () => {
    const calls = [];
    const transaction = {
      task: {
        create: async (args) => {
          calls.push(["task.create", args]);
          return { id: "task-1", ...args.data };
        },
      },
      taskDraft: {
        updateMany: async (args) => {
          calls.push(["draft.updateMany", args]);
          return { count: 1 };
        },
        update: async (args) => {
          calls.push(["draft.update", args]);
          return { id: "draft-1", status: "approved", ...args.data };
        },
      },
    };
    const database = {
      $transaction: async (callback) => callback(transaction),
    };
    const repository = new JuhyungRepository(database);

    const draft = await repository.approveTaskDraft(
      "draft-1",
      {
        workspaceId: "workspace-1",
        title: "Process OAuth callback",
        description: "Handle provider callbacks",
        assigneeMemberId: "member-2",
        status: "todo",
        priority: "high",
        dueDate: null,
        milestoneId: null,
      },
      "member-1",
    );

    assert.equal(draft.status, "approved");
    assert.equal(draft.taskId, "task-1");
    assert.deepEqual(calls[0][0], "draft.updateMany");
    assert.deepEqual(calls[0][1].where, {
      id: "draft-1",
      status: "draft",
    });
    assert.deepEqual(
      {
        ...calls[0][1].data,
        approvedAt: undefined,
        updatedAt: undefined,
      },
      {
        status: "approved",
        approvedByMemberId: "member-1",
        approvedAt: undefined,
        updatedAt: undefined,
      },
    );
    assert.ok(calls[0][1].data.approvedAt instanceof Date);
    assert.ok(calls[0][1].data.updatedAt instanceof Date);
    assert.deepEqual(calls[1], [
      "task.create",
      {
        data: {
          workspaceId: "workspace-1",
          title: "Process OAuth callback",
          description: "Handle provider callbacks",
          assigneeMemberId: "member-2",
          status: "todo",
          priority: "high",
          dueDate: null,
          milestoneId: null,
          createdByMemberId: "member-1",
        },
      },
    ]);
    assert.deepEqual(calls[2][1].where, { id: "draft-1" });
    assert.deepEqual(
      {
        ...calls[2][1].data,
        updatedAt: undefined,
      },
      {
        taskId: "task-1",
        updatedAt: undefined,
      },
    );
    assert.ok(calls[2][1].data.updatedAt instanceof Date);
  });

  it("does not create a task when task draft approval cannot claim the draft", async () => {
    const calls = [];
    const transaction = {
      task: {
        create: async () => {
          throw new Error("unclaimed drafts should not create tasks");
        },
      },
      taskDraft: {
        updateMany: async (args) => {
          calls.push(["draft.updateMany", args]);
          return { count: 0 };
        },
      },
    };
    const database = {
      $transaction: async (callback) => callback(transaction),
    };
    const repository = new JuhyungRepository(database);

    const draft = await repository.approveTaskDraft(
      "draft-1",
      {
        workspaceId: "workspace-1",
        title: "Process OAuth callback",
        description: "Handle provider callbacks",
        assigneeMemberId: "member-2",
        status: "todo",
        priority: "high",
        dueDate: null,
        milestoneId: null,
      },
      "member-1",
    );

    assert.equal(draft, null);
    assert.deepEqual(calls, [
      [
        "draft.updateMany",
        {
          where: {
            id: "draft-1",
            status: "draft",
          },
          data: {
            status: "approved",
            approvedByMemberId: "member-1",
            approvedAt: calls[0][1].data.approvedAt,
            updatedAt: calls[0][1].data.updatedAt,
          },
        },
      ],
    ]);
  });

  it("rejects task drafts without writing a task", async () => {
    const calls = [];
    const database = {
      taskDraft: {
        updateMany: async (args) => {
          calls.push(["draft.updateMany", args]);
          return { count: 1 };
        },
        findUnique: async (args) => {
          calls.push(["draft.findUnique", args]);
          return {
            id: "draft-1",
            status: "rejected",
            rejectedByMemberId: "member-1",
            rejectedAt: calls[0][1].data.rejectedAt,
            updatedAt: calls[0][1].data.updatedAt,
          };
        },
      },
    };
    const repository = new JuhyungRepository(database);

    const draft = await repository.rejectTaskDraft("draft-1", "member-1");

    assert.equal(draft.status, "rejected");
    assert.deepEqual(calls[0][1].where, { id: "draft-1", status: "draft" });
    assert.deepEqual(
      {
        ...calls[0][1].data,
        rejectedAt: undefined,
        updatedAt: undefined,
      },
      {
        status: "rejected",
        rejectedByMemberId: "member-1",
        rejectedAt: undefined,
        updatedAt: undefined,
      },
    );
    assert.ok(calls[0][1].data.rejectedAt instanceof Date);
    assert.ok(calls[0][1].data.updatedAt instanceof Date);
    assert.deepEqual(calls[1], [
      "draft.findUnique",
      {
        where: {
          id: "draft-1",
        },
      },
    ]);
  });

  it("patches task fields and records the changed values", async () => {
    const calls = [];
    const transaction = {
      task: {
        update: async (args) => {
          calls.push(["task.update", args]);
          return { id: "task-1", ...args.data };
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

    const task = await repository.updateTask(
      "task-1",
      {
        title: "Updated task",
        description: "Updated description",
        assigneeMemberId: "member-2",
        dueDate: new Date("2026-07-04T00:00:00.000Z"),
        milestoneId: null,
      },
      "member-1",
      {
        title: "Original task",
        description: null,
        assigneeMemberId: null,
        dueDate: null,
        milestoneId: "milestone-1",
      },
    );

    assert.equal(task.title, "Updated task");
    assert.deepEqual(calls, [
      [
        "task.update",
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
      ],
      [
        "activity.create",
        {
          data: {
            taskId: "task-1",
            actorMemberId: "member-1",
            action: "task.updated",
            beforeValue: {
              title: "Original task",
              description: null,
              assigneeMemberId: null,
              dueDate: null,
              milestoneId: "milestone-1",
            },
            afterValue: {
              title: "Updated task",
              description: "Updated description",
              assigneeMemberId: "member-2",
              dueDate: "2026-07-04",
              milestoneId: null,
            },
          },
        },
      ],
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

  it("updates unchanged task status without writing an activity log", async () => {
    const calls = [];
    const database = {
      task: {
        update: async (args) => {
          calls.push(["task.update", args]);
          return { id: "task-1", status: args.data.status };
        },
      },
      $transaction: async () => {
        throw new Error("same status should not open a transaction");
      },
    };
    const repository = new JuhyungRepository(database);

    const task = await repository.updateTaskStatus(
      "task-1",
      "todo",
      "member-1",
      "todo",
    );

    assert.deepEqual(task, { id: "task-1", status: "todo" });
    assert.deepEqual(calls, [
      [
        "task.update",
        {
          where: {
            id: "task-1",
          },
          data: {
            status: "todo",
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

  it("creates task comments and records comment activity in one transaction", async () => {
    const calls = [];
    const transaction = {
      taskComment: {
        create: async (args) => {
          calls.push(["comment.create", args]);
          return {
            id: "comment-1",
            createdAt: new Date("2026-06-28T09:00:00.000Z"),
            updatedAt: new Date("2026-06-28T09:00:00.000Z"),
            ...args.data,
          };
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

    const comment = await repository.createTaskComment(
      "task-1",
      { body: "Ready for review" },
      "member-1",
    );

    assert.equal(comment.body, "Ready for review");
    assert.deepEqual(calls, [
      [
        "comment.create",
        {
          data: {
            taskId: "task-1",
            body: "Ready for review",
            authorMemberId: "member-1",
          },
        },
      ],
      [
        "activity.create",
        {
          data: {
            taskId: "task-1",
            actorMemberId: "member-1",
            action: "task.comment_created",
            beforeValue: Prisma.JsonNull,
            afterValue: {
              commentId: "comment-1",
            },
          },
        },
      ],
    ]);
  });

  it("reads task comments chronologically", async () => {
    const calls = [];
    const database = {
      taskComment: {
        findMany: async (args) => {
          calls.push(args);
          return [{ id: "comment-1", taskId: "task-1" }];
        },
      },
    };
    const repository = new JuhyungRepository(database);

    const comments = await repository.listTaskComments("task-1");

    assert.deepEqual(comments, [{ id: "comment-1", taskId: "task-1" }]);
    assert.deepEqual(calls, [
      {
        where: {
          taskId: "task-1",
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    ]);
  });

  it("reads task activity logs newest first", async () => {
    const calls = [];
    const database = {
      taskActivityLog: {
        findMany: async (args) => {
          calls.push(args);
          return [{ id: "activity-1", taskId: "task-1" }];
        },
      },
    };
    const repository = new JuhyungRepository(database);

    const activityLogs = await repository.listTaskActivityLogs("task-1");

    assert.deepEqual(activityLogs, [{ id: "activity-1", taskId: "task-1" }]);
    assert.deepEqual(calls, [
      {
        where: {
          taskId: "task-1",
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
    ]);
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
      $transaction: async (callback, options) => {
        calls.push(["transaction", options]);
        return callback(transaction);
      },
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
        "transaction",
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ],
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
    const transaction = {
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
    const database = {
      $transaction: async (callback, options) => {
        calls.push(["transaction", options]);
        return callback(transaction);
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
        "transaction",
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ],
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

  it("retries checklist append when concurrent sort order allocation collides", async () => {
    const calls = [];
    let attempt = 0;
    const transaction = {
      taskChecklistItem: {
        aggregate: async (args) => {
          calls.push(["aggregate", args]);
          return { _max: { sortOrder: attempt === 0 ? 2 : 3 } };
        },
        create: async (args) => {
          calls.push(["create", args]);
          if (attempt === 0) {
            attempt += 1;
            throw { code: "P2002" };
          }
          return { id: "item-4", ...args.data };
        },
      },
    };
    const database = {
      $transaction: async (callback, options) => {
        calls.push(["transaction", options]);
        return callback(transaction);
      },
    };
    const repository = new JuhyungRepository(database);

    const item = await repository.createChecklistItem("task-1", {
      title: "Retry deploy smoke",
      status: "todo",
    });

    assert.equal(item.sortOrder, 4);
    assert.equal(calls.filter(([name]) => name === "transaction").length, 2);
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

  it("creates task dependencies after atomic workspace cycle checks", async () => {
    const calls = [];
    const transaction = {
      task: {
        findFirst: async (args) => {
          calls.push(["task.findFirst", args]);
          return { id: "task-2", workspaceId: "workspace-1" };
        },
        findMany: async (args) => {
          calls.push(["task.findMany", args]);
          return [{ id: "task-1" }, { id: "task-2" }];
        },
      },
      taskDependency: {
        findFirst: async (args) => {
          calls.push(["dependency.findFirst", args]);
          return null;
        },
        findMany: async (args) => {
          calls.push(["dependency.findMany", args]);
          return [];
        },
        create: async (args) => {
          calls.push(["dependency.create", args]);
          return { id: "dependency-1", createdAt: new Date(), ...args.data };
        },
      },
    };
    const database = {
      $transaction: async (callback, options) => {
        calls.push(["transaction", options]);
        return callback(transaction);
      },
    };
    const repository = new JuhyungRepository(database);

    const result = await repository.createTaskDependencyForWorkspace(
      "workspace-1",
      "task-1",
      "task-2",
    );

    assert.equal(result.status, "created");
    const dependency = result.dependency;
    assert.equal(dependency.taskId, "task-1");
    assert.equal(dependency.dependsOnTaskId, "task-2");
    assert.deepEqual(calls, [
      [
        "transaction",
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ],
      [
        "task.findFirst",
        {
          where: {
            id: "task-2",
            workspaceId: "workspace-1",
            deletedAt: null,
          },
        },
      ],
      [
        "dependency.findFirst",
        {
          where: {
            taskId: "task-1",
            dependsOnTaskId: "task-2",
          },
        },
      ],
      [
        "task.findMany",
        {
          where: {
            workspaceId: "workspace-1",
            deletedAt: null,
          },
          select: {
            id: true,
          },
        },
      ],
      [
        "dependency.findMany",
        {
          where: {
            taskId: {
              in: ["task-1", "task-2"],
            },
            dependsOnTaskId: {
              in: ["task-1", "task-2"],
            },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      ],
      [
        "dependency.create",
        {
          data: {
            taskId: "task-1",
            dependsOnTaskId: "task-2",
          },
        },
      ],
    ]);
  });

  it("rejects dependency cycles inside the create transaction", async () => {
    const calls = [];
    const transaction = {
      task: {
        findFirst: async () => ({ id: "task-2", workspaceId: "workspace-1" }),
        findMany: async () => [{ id: "task-1" }, { id: "task-2" }],
      },
      taskDependency: {
        findFirst: async () => null,
        findMany: async () => [{ taskId: "task-2", dependsOnTaskId: "task-1" }],
        create: async () => {
          calls.push(["create"]);
          throw new Error("cyclic dependency should not be inserted");
        },
      },
    };
    const database = {
      $transaction: async (callback) => callback(transaction),
    };
    const repository = new JuhyungRepository(database);

    const result = await repository.createTaskDependencyForWorkspace(
      "workspace-1",
      "task-1",
      "task-2",
    );

    assert.deepEqual(result, { status: "cycle" });
    assert.deepEqual(calls, []);
  });

  it("reads an existing task dependency by source and target ids", async () => {
    const calls = [];
    const database = {
      taskDependency: {
        findFirst: async (args) => {
          calls.push(args);
          return { id: "dependency-1", taskId: "task-1" };
        },
      },
    };
    const repository = new JuhyungRepository(database);

    const dependency = await repository.getTaskDependency("task-1", "task-2");

    assert.equal(dependency.id, "dependency-1");
    assert.deepEqual(calls, [
      {
        where: {
          taskId: "task-1",
          dependsOnTaskId: "task-2",
        },
      },
    ]);
  });

  it("lists task dependencies inside one workspace boundary", async () => {
    const calls = [];
    const database = {
      task: {
        findMany: async (args) => {
          calls.push(["task.findMany", args]);
          return [{ id: "task-1" }, { id: "task-2" }];
        },
      },
      taskDependency: {
        findMany: async (args) => {
          calls.push(["dependency.findMany", args]);
          return [{ id: "dependency-1", taskId: "task-1" }];
        },
      },
    };
    const repository = new JuhyungRepository(database);

    const dependencies =
      await repository.listTaskDependenciesForWorkspace("workspace-1");

    assert.deepEqual(dependencies, [{ id: "dependency-1", taskId: "task-1" }]);
    assert.deepEqual(calls, [
      [
        "task.findMany",
        {
          where: {
            workspaceId: "workspace-1",
            deletedAt: null,
          },
          select: {
            id: true,
          },
        },
      ],
      [
        "dependency.findMany",
        {
          where: {
            taskId: {
              in: ["task-1", "task-2"],
            },
            dependsOnTaskId: {
              in: ["task-1", "task-2"],
            },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      ],
    ]);
  });

  it("deletes task dependencies within the source task boundary", async () => {
    const calls = [];
    const database = {
      taskDependency: {
        deleteMany: async (args) => {
          calls.push(args);
          return { count: 1 };
        },
      },
    };
    const repository = new JuhyungRepository(database);

    await repository.deleteTaskDependency("task-1", "task-2");

    assert.deepEqual(calls, [
      {
        where: {
          taskId: "task-1",
          dependsOnTaskId: "task-2",
        },
      },
    ]);
  });
});
