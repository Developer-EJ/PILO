import {
  buildWorkspaceApiUrl,
  defaultWorkspaceApiBaseUrl,
  WorkspaceApiError,
} from "../workspace/workspaceClient.mjs";
import { createWorkspaceDashboardFixture } from "../workspace/dashboardClient.mjs";
import { workspaceDashboardFixture } from "../workspace/workspaceDashboardFixture.mjs";

const DEFAULT_TASK_MODE = "mock";
const taskStatuses = ["todo", "in_progress", "in_review", "done", "blocked"];
const taskPriorities = ["low", "medium", "high", "urgent"];

export function defaultTaskMode() {
  return (
    process.env.NEXT_PUBLIC_PILO_TASK_MODE ??
    process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE ??
    DEFAULT_TASK_MODE
  );
}

export function resolveTaskClientMode(mode = defaultTaskMode()) {
  return mode === "api" ? "api" : "mock";
}

export function buildTaskApiUrl(
  path,
  baseUrl = defaultWorkspaceApiBaseUrl(),
) {
  if (!path.startsWith("/api/")) {
    throw new TaskApiError("Task API path must start with /api/", { path });
  }

  return buildWorkspaceApiUrl(path, baseUrl);
}

export class TaskApiError extends WorkspaceApiError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "TaskApiError";
  }
}

async function readTaskJson(response, path) {
  try {
    return await response.json();
  } catch (error) {
    throw new TaskApiError("Task API returned invalid JSON", {
      status: response.status,
      path,
    });
  }
}

async function requestTaskJson(path, init, { baseUrl, fetcher }) {
  const response = await fetcher(buildTaskApiUrl(path, baseUrl), {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new TaskApiError("Task API request failed", {
      status: response.status,
      path,
    });
  }

  if (response.status === 204) {
    return null;
  }

  return readTaskJson(response, path);
}

export function createTaskFixture(workspaceId) {
  const dashboard = createWorkspaceDashboardFixture(workspaceId);
  const members = dashboard.members;
  const primaryAssignee = {
    memberId: members[1]?.memberId ?? members[0]?.memberId ?? "member-task",
    userId: members[1]?.userId ?? members[0]?.userId ?? undefined,
    name: members[1]?.name ?? "Juhyung",
  };
  const secondaryAssignee = {
    memberId: members[0]?.memberId ?? "member-dashboard",
    userId: members[0]?.userId ?? undefined,
    name: members[0]?.name ?? "Donghyun",
  };

  return [
    ...dashboard.tasks,
    {
      id: "task-fixture-juhyung-board",
      workspaceId,
      milestoneId: null,
      title: "Task board route and client",
      status: "in_progress",
      priority: "high",
      assignee: primaryAssignee,
      dueDate: "2026-07-02",
      isDelayed: false,
      linkedIssueCount: 1,
      linkedPrCount: 0,
      updatedAt: "2026-06-29T10:00:00.000Z",
    },
    {
      id: "task-fixture-progress-summary",
      workspaceId,
      milestoneId: null,
      title: "Progress summary endpoint",
      status: "todo",
      priority: "medium",
      assignee: primaryAssignee,
      dueDate: "2026-07-05",
      isDelayed: false,
      linkedIssueCount: 0,
      linkedPrCount: 0,
      updatedAt: "2026-06-29T11:00:00.000Z",
    },
    {
      id: "task-fixture-dashboard-link",
      workspaceId,
      milestoneId: null,
      title: "Dashboard link destination smoke",
      status: "blocked",
      priority: "urgent",
      assignee: secondaryAssignee,
      dueDate: "2026-06-29",
      isDelayed: true,
      linkedIssueCount: 0,
      linkedPrCount: 1,
      updatedAt: "2026-06-29T12:00:00.000Z",
    },
  ];
}

export function createTaskDraftFixture(workspaceId) {
  const action = workspaceDashboardFixture.agentActions[0];
  const payload = action?.payload ?? {};

  return [
    {
      id: "task-draft-fixture-1",
      workspaceId,
      sourceType: "meeting_action_item",
      sourceId: "77777777-7777-4777-8777-777777777772",
      title: payload.title ?? "Add OAuth error state UI",
      description: "Prepared from meeting notes.",
      assigneeMemberId: workspaceDashboardFixture.members[1]?.memberId ?? null,
      priority: payload.priority ?? "medium",
      dueDate: "2026-07-03",
      status: "draft",
      taskId: null,
      createdAt: "2026-06-29T09:00:00.000Z",
      updatedAt: "2026-06-29T09:00:00.000Z",
    },
  ];
}

export function createProgressFixture(workspaceId) {
  const tasks = createTaskFixture(workspaceId);
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((task) => task.status === "done").length;
  const blockedTasks = tasks.filter((task) => task.status === "blocked").length;
  const reviewTasks = tasks.filter(
    (task) => task.status === "in_review",
  ).length;
  const delayedTasks = tasks.filter((task) => task.isDelayed).length;

  return {
    workspaceId,
    milestoneId: null,
    totalTasks,
    doneTasks,
    blockedTasks,
    reviewTasks,
    delayedTasks,
    progressRate: totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0,
    capturedAt: new Date().toISOString(),
  };
}

export function createMockTaskClient() {
  const taskByWorkspaceId = new Map();
  const draftByWorkspaceId = new Map();

  function tasksForWorkspace(workspaceId) {
    if (!taskByWorkspaceId.has(workspaceId)) {
      taskByWorkspaceId.set(workspaceId, createTaskFixture(workspaceId));
    }

    return taskByWorkspaceId.get(workspaceId);
  }

  function draftsForWorkspace(workspaceId) {
    if (!draftByWorkspaceId.has(workspaceId)) {
      draftByWorkspaceId.set(workspaceId, createTaskDraftFixture(workspaceId));
    }

    return draftByWorkspaceId.get(workspaceId);
  }

  return {
    async listTasks(workspaceId) {
      return [...tasksForWorkspace(workspaceId)];
    },
    async createTask(workspaceId, input) {
      const task = normalizeCreatedTask(workspaceId, input);
      taskByWorkspaceId.set(workspaceId, [task, ...tasksForWorkspace(workspaceId)]);
      return task;
    },
    async updateTaskStatus(taskId, status, { workspaceId } = {}) {
      const resolvedWorkspaceId = workspaceId ?? "mock-workspace";
      const tasks = tasksForWorkspace(resolvedWorkspaceId);
      const updatedTasks = tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status,
              isDelayed: task.dueDate
                ? task.dueDate < new Date().toISOString().slice(0, 10) &&
                  status !== "done"
                : false,
              updatedAt: new Date().toISOString(),
            }
          : task,
      );
      taskByWorkspaceId.set(resolvedWorkspaceId, updatedTasks);
      return updatedTasks.find((task) => task.id === taskId) ?? null;
    },
    async listTaskDrafts(workspaceId) {
      return [...draftsForWorkspace(workspaceId)];
    },
    async approveTaskDraft(draftId, { workspaceId } = {}) {
      const resolvedWorkspaceId = workspaceId ?? "mock-workspace";
      const drafts = draftsForWorkspace(resolvedWorkspaceId);
      const draftIndex = drafts.findIndex((draft) => draft.id === draftId);

      if (draftIndex === -1) {
        throw new TaskApiError("Task draft not found", {
          status: 404,
          path: `/api/task-drafts/${draftId}/approve`,
        });
      }

      const draft = drafts[draftIndex];

      if (draft.status !== "draft") {
        return draft;
      }

      const task = normalizeCreatedTask(resolvedWorkspaceId, {
        title: draft.title,
        description: draft.description,
        priority: draft.priority,
        dueDate: draft.dueDate,
      });
      const approvedDraft = {
        ...draft,
        status: "approved",
        taskId: task.id,
        updatedAt: new Date().toISOString(),
      };

      drafts[draftIndex] = approvedDraft;
      draftByWorkspaceId.set(resolvedWorkspaceId, [...drafts]);
      taskByWorkspaceId.set(resolvedWorkspaceId, [
        task,
        ...tasksForWorkspace(resolvedWorkspaceId),
      ]);

      return approvedDraft;
    },
    async rejectTaskDraft(draftId, { workspaceId } = {}) {
      const resolvedWorkspaceId = workspaceId ?? "mock-workspace";
      const drafts = draftsForWorkspace(resolvedWorkspaceId);
      const draftIndex = drafts.findIndex((draft) => draft.id === draftId);

      if (draftIndex === -1) {
        throw new TaskApiError("Task draft not found", {
          status: 404,
          path: `/api/task-drafts/${draftId}/reject`,
        });
      }

      const rejectedDraft = {
        ...drafts[draftIndex],
        status: "rejected",
        updatedAt: new Date().toISOString(),
      };

      drafts[draftIndex] = rejectedDraft;
      draftByWorkspaceId.set(resolvedWorkspaceId, [...drafts]);

      return rejectedDraft;
    },
    async getProgressSummary(workspaceId) {
      return createProgressFixture(workspaceId);
    },
    async listProgressHistory(workspaceId) {
      return [
        {
          id: "progress-fixture-1",
          ...createProgressFixture(workspaceId),
          capturedAt: "2026-06-29T09:00:00.000Z",
        },
      ];
    },
  };
}

export function createTaskApiClient({
  baseUrl = defaultWorkspaceApiBaseUrl(),
  fetcher = fetch,
} = {}) {
  return {
    async listTasks(workspaceId) {
      return requestTaskJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/tasks`,
        undefined,
        { baseUrl, fetcher },
      );
    },
    async createTask(workspaceId, input) {
      return requestTaskJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/tasks`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
        { baseUrl, fetcher },
      );
    },
    async updateTaskStatus(taskId, status) {
      return requestTaskJson(
        `/api/tasks/${encodeURIComponent(taskId)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
        { baseUrl, fetcher },
      );
    },
    async listTaskDrafts(workspaceId) {
      return requestTaskJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/task-drafts`,
        undefined,
        { baseUrl, fetcher },
      );
    },
    async approveTaskDraft(draftId) {
      return requestTaskJson(
        `/api/task-drafts/${encodeURIComponent(draftId)}/approve`,
        { method: "POST" },
        { baseUrl, fetcher },
      );
    },
    async rejectTaskDraft(draftId) {
      return requestTaskJson(
        `/api/task-drafts/${encodeURIComponent(draftId)}/reject`,
        { method: "POST" },
        { baseUrl, fetcher },
      );
    },
    async getProgressSummary(workspaceId) {
      return requestTaskJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/progress/summary`,
        undefined,
        { baseUrl, fetcher },
      );
    },
    async listProgressHistory(workspaceId) {
      return requestTaskJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/progress/history`,
        undefined,
        { baseUrl, fetcher },
      );
    },
  };
}

export function createTaskClient(options = {}) {
  const mode = resolveTaskClientMode(options.mode);

  if (mode === "api") {
    return createTaskApiClient(options);
  }

  return createMockTaskClient(options.mock);
}

export function normalizeCreatedTask(workspaceId, input = {}) {
  const status = taskStatuses.includes(input.status) ? input.status : "todo";
  const priority = taskPriorities.includes(input.priority)
    ? input.priority
    : "medium";
  const dueDate = typeof input.dueDate === "string" && input.dueDate
    ? input.dueDate
    : null;

  return {
    id: `task-local-${Date.now()}`,
    workspaceId,
    milestoneId: input.milestoneId ?? null,
    title: String(input.title ?? "Untitled task").trim() || "Untitled task",
    status,
    priority,
    assignee: null,
    dueDate,
    isDelayed: Boolean(
      dueDate && dueDate < new Date().toISOString().slice(0, 10) && status !== "done",
    ),
    linkedIssueCount: 0,
    linkedPrCount: 0,
    updatedAt: new Date().toISOString(),
  };
}
