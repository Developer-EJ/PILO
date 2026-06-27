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
});
