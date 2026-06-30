import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTaskGithubProgressApiUrl,
  calculateProgressSummary,
  createMockTaskGithubProgressClient,
  createTaskGithubProgressApiClient,
  resolveTaskGithubProgressClientMode,
} from "../lib/task/taskGithubProgressClient.mjs";
import { mockWorkspaces } from "../lib/workspace/workspaceClient.mjs";

describe("task/github/progress frontend client", () => {
  it("builds API URLs and sends actor headers for Current Runtime calls", async () => {
    const workspaceId = mockWorkspaces[0].id;
    const requests = [];
    const fetcher = async (url, init = {}) => {
      requests.push({ url, init });

      if (url.endsWith(`/workspaces/${workspaceId}/tasks?status=todo`)) {
        return Response.json([]);
      }

      if (url.endsWith(`/workspaces/${workspaceId}/tasks`)) {
        return Response.json({ id: "task-1", ...JSON.parse(init.body) });
      }

      if (url.endsWith(`/workspaces/${workspaceId}/github/connections`)) {
        return Response.json([]);
      }

      if (
        url.endsWith(
          `/workspaces/${workspaceId}/progress/summary?milestoneId=milestone-1`,
        )
      ) {
        return Response.json({
          workspaceId,
          milestoneId: "milestone-1",
          totalTasks: 2,
          doneTasks: 1,
          blockedTasks: 0,
          reviewTasks: 1,
          delayedTasks: 0,
          progressRate: 50,
          capturedAt: "2026-06-30T00:00:00.000Z",
        });
      }

      return Response.json({});
    };
    const client = createTaskGithubProgressApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher,
      actor: {
        userId: "user-1",
        memberId: "member-1",
      },
    });

    assert.equal(
      buildTaskGithubProgressApiUrl("/tasks/task-1", ""),
      "/api/tasks/task-1",
    );
    assert.equal(resolveTaskGithubProgressClientMode("api"), "api");
    assert.equal(resolveTaskGithubProgressClientMode("fixture"), "mock");

    await client.listTasks(workspaceId, { status: "todo" });
    await client.createTask(workspaceId, {
      title: "Connect Task API",
      status: "todo",
      priority: "medium",
    });
    await client.listGithubConnections(workspaceId);
    const progress = await client.calculateProgress(workspaceId, [], {
      milestoneId: "milestone-1",
    });

    assert.deepEqual(
      requests.map((request) => request.init.method ?? "GET"),
      ["GET", "POST", "GET", "GET"],
    );
    assert.equal(
      requests[0].url,
      `https://api.pilo.dev/api/workspaces/${workspaceId}/tasks?status=todo`,
    );
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.headers["x-member-id"], "member-1");
    assert.equal(requests[1].init.headers["Content-Type"], "application/json");
    assert.equal(
      requests[3].url,
      `https://api.pilo.dev/api/workspaces/${workspaceId}/progress/summary?milestoneId=milestone-1`,
    );
    assert.equal(progress.progressRate, 50);
  });

  it("keeps mock Task mutations and progress deterministic", async () => {
    const workspaceId = "mock-task-workspace";
    const client = createMockTaskGithubProgressClient();
    const initialTasks = await client.listTasks(workspaceId);
    const created = await client.createTask(workspaceId, {
      title: "Finish Task MVP",
      status: "todo",
      priority: "urgent",
      dueDate: "2026-07-03",
    });

    assert.equal(created.title, "Finish Task MVP");

    const updated = await client.updateTaskStatus(created.id, "done");
    const draft = await client.createTaskDraft(workspaceId, {
      title: "Draft from meeting",
      priority: "medium",
    });
    const approved = await client.approveTaskDraft(draft.id);
    const tasks = await client.listTasks(workspaceId);
    const progress = calculateProgressSummary(tasks, { workspaceId });

    assert.equal(updated.status, "done");
    assert.equal(approved.status, "approved");
    assert.equal(tasks.length, initialTasks.length + 2);
    assert.equal(progress.workspaceId, workspaceId);
    assert.equal(progress.totalTasks, tasks.length);
    assert.equal(progress.doneTasks >= 1, true);
  });
});
