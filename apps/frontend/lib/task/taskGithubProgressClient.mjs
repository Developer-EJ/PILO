import {
  buildWorkspaceApiUrl,
  defaultWorkspaceApiBaseUrl,
  WorkspaceApiError,
} from "../workspace/workspaceClient.mjs";
import { createWorkspaceDashboardFixture } from "../workspace/dashboardClient.mjs";
import { workspaceDashboardFixture } from "../workspace/workspaceDashboardFixture.mjs";

const DEFAULT_TASK_DOMAIN_MODE = "mock";
const mockStores = new Map();

export const taskStatuses = [
  "todo",
  "in_progress",
  "in_review",
  "done",
  "blocked",
];

export const taskPriorities = ["low", "medium", "high", "urgent"];
export const milestoneStatuses = ["planned", "in_progress", "done"];
export const taskActionTypes = [
  "task.create",
  "task.create.draft",
  "task.update",
  "task.update.status",
  "task.complete",
];

function defaultTaskDomainMode() {
  return (
    process.env.NEXT_PUBLIC_PILO_JUHYUNG_MODE ??
    process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE ??
    DEFAULT_TASK_DOMAIN_MODE
  );
}

export function resolveTaskGithubProgressClientMode(
  mode = defaultTaskDomainMode(),
) {
  return mode === "api" ? "api" : "mock";
}

export class TaskGithubProgressApiError extends WorkspaceApiError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "TaskGithubProgressApiError";
  }
}

export function buildTaskGithubProgressApiUrl(
  path,
  baseUrl = defaultWorkspaceApiBaseUrl(),
) {
  return buildWorkspaceApiUrl(path, baseUrl);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function currentFixtureMember(workspaceId) {
  const fixture = createWorkspaceDashboardFixture(workspaceId);
  const currentMember = fixture.currentMember;

  return {
    memberId: currentMember.memberId,
    userId: currentMember.userId,
  };
}

function actorHeaders(actor) {
  const headers = {};

  if (actor?.userId) {
    headers["x-user-id"] = actor.userId;
  }

  if (actor?.memberId) {
    headers["x-member-id"] = actor.memberId;
  }

  return headers;
}

async function readJson(response, path) {
  if (response.status === 204) {
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    throw new TaskGithubProgressApiError(
      "Task/GitHub/Progress API returned invalid JSON",
      {
        status: response.status,
        path,
      },
    );
  }
}

async function requestJson(path, init = {}, { baseUrl, fetcher, actor }) {
  const response = await fetcher(buildTaskGithubProgressApiUrl(path, baseUrl), {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...actorHeaders(actor),
      ...(init.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new TaskGithubProgressApiError("Task/GitHub API request failed", {
      status: response.status,
      path,
    });
  }

  return readJson(response, path);
}

function withJsonBody(body, init = {}) {
  return {
    ...init,
    body: JSON.stringify(body),
  };
}

function toQueryString(query = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      value.filter(Boolean).forEach((entry) => params.append(key, entry));
      continue;
    }

    params.set(key, String(value));
  }

  const serialized = params.toString();

  return serialized ? `?${serialized}` : "";
}

function nowIso() {
  return new Date().toISOString();
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysDateOnly(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);

  return date.toISOString().slice(0, 10);
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTask(task, workspaceId) {
  return {
    id: task.id,
    workspaceId: task.workspaceId ?? workspaceId,
    milestoneId: task.milestoneId ?? null,
    title: task.title,
    description: task.description ?? null,
    status: task.status ?? "todo",
    priority: task.priority ?? "medium",
    assignee: task.assignee ?? null,
    dueDate: task.dueDate ?? null,
    isDelayed:
      task.isDelayed ??
      Boolean(
        task.dueDate &&
          task.status !== "done" &&
          task.dueDate < todayDateOnly(),
      ),
    linkedIssueCount: task.linkedIssueCount ?? 0,
    linkedPrCount: task.linkedPrCount ?? 0,
    updatedAt: task.updatedAt ?? nowIso(),
  };
}

function normalizeMilestone(milestone, workspaceId) {
  return {
    id: milestone.id,
    workspaceId: milestone.workspaceId ?? workspaceId,
    title: milestone.title,
    status: milestone.status ?? "planned",
    startDate: milestone.startDate ?? null,
    endDate: milestone.endDate ?? null,
    updatedAt: milestone.updatedAt ?? nowIso(),
  };
}

function normalizeDraft(draft, workspaceId) {
  return {
    id: draft.id,
    workspaceId: draft.workspaceId ?? workspaceId,
    sourceType: draft.sourceType ?? null,
    sourceId: draft.sourceId ?? null,
    title: draft.title,
    description: draft.description ?? null,
    assigneeMemberId: draft.assigneeMemberId ?? null,
    priority: draft.priority ?? "medium",
    dueDate: draft.dueDate ?? null,
    status: draft.status ?? "draft",
    taskId: draft.taskId ?? null,
    createdAt: draft.createdAt ?? nowIso(),
    updatedAt: draft.updatedAt ?? nowIso(),
  };
}

function deriveRepositories({ githubIssues = [], pullRequests = [] }) {
  const repositoryIds = [
    ...githubIssues.map((issue) => issue.repositoryId),
    ...pullRequests.map((pullRequest) => pullRequest.repositoryId),
  ].filter(Boolean);

  return [...new Set(repositoryIds)].map((id, index) => ({
    id,
    workspaceId: workspaceDashboardFixture.workspace.id,
    owner: "example",
    repoName: index === 0 ? "pilo" : `pilo-${index + 1}`,
    url: `https://github.com/example/${index === 0 ? "pilo" : `pilo-${index + 1}`}`,
    defaultBranch: "temp-dev",
    syncedAt: "2026-06-27T12:00:00.000Z",
  }));
}

export function getDeferredGithubReadModel(workspaceId) {
  const fixture = createWorkspaceDashboardFixture(workspaceId);

  return {
    repositories: deriveRepositories(fixture).map((repository) => ({
      ...repository,
      workspaceId,
    })),
    issues: fixture.githubIssues,
    pullRequests: fixture.pullRequests,
    pullRequestChangedFiles: fixture.pullRequestChangedFiles,
    source: "fixture",
    deferred: true,
  };
}

export function calculateProgressSummary(
  tasks,
  { workspaceId, milestoneId = null, capturedAt = nowIso() } = {},
) {
  const includedTasks = tasks.filter(
    (task) => !milestoneId || task.milestoneId === milestoneId,
  );
  const totalTasks = includedTasks.length;
  const doneTasks = includedTasks.filter(
    (task) => task.status === "done",
  ).length;
  const blockedTasks = includedTasks.filter(
    (task) => task.status === "blocked",
  ).length;
  const reviewTasks = includedTasks.filter(
    (task) => task.status === "in_review",
  ).length;
  const today = todayDateOnly();
  const delayedTasks = includedTasks.filter(
    (task) => task.dueDate && task.dueDate < today && task.status !== "done",
  ).length;
  const progressRate =
    totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 10000) / 100;

  return {
    workspaceId,
    milestoneId,
    totalTasks,
    doneTasks,
    blockedTasks,
    reviewTasks,
    delayedTasks,
    progressRate,
    capturedAt,
  };
}

function definedTaskFields(payload, fields) {
  return fields.reduce((body, field) => {
    if (payload[field] !== undefined) {
      body[field] = payload[field];
    }

    return body;
  }, {});
}

function taskActionPayload(action) {
  if (!isRecord(action)) {
    throw new TaskGithubProgressApiError("Task action must be an object");
  }

  return isRecord(action.payload) ? action.payload : action;
}

function taskActionWorkspaceId(payload, fallbackWorkspaceId) {
  const workspaceId = payload.workspaceId ?? fallbackWorkspaceId;

  if (!workspaceId) {
    throw new TaskGithubProgressApiError("Task action requires workspaceId");
  }

  return workspaceId;
}

function taskActionTaskId(payload) {
  if (!payload.taskId) {
    throw new TaskGithubProgressApiError("Task action requires taskId");
  }

  return payload.taskId;
}

function taskActionStatus(payload) {
  if (!payload.status) {
    throw new TaskGithubProgressApiError("Task status action requires status");
  }

  return payload.status;
}

export async function applyTaskAction(client, action, options = {}) {
  const type = action?.type;
  const payload = taskActionPayload(action);

  if (type === "task.create") {
    const workspaceId = taskActionWorkspaceId(payload, options.workspaceId);

    return client.createTask(
      workspaceId,
      definedTaskFields(payload, [
        "title",
        "description",
        "status",
        "priority",
        "assigneeMemberId",
        "dueDate",
        "milestoneId",
      ]),
    );
  }

  if (type === "task.create.draft") {
    const workspaceId = taskActionWorkspaceId(payload, options.workspaceId);

    const draft = await client.createTaskDraft(
      workspaceId,
      definedTaskFields(payload, [
        "workspaceId",
        "sourceType",
        "sourceId",
        "title",
        "description",
        "assigneeMemberId",
        "priority",
        "dueDate",
      ]),
    );

    if (options.approveTaskDraft === false) {
      return draft;
    }

    return client.approveTaskDraft(draft.id);
  }

  if (type === "task.update") {
    const taskId = taskActionTaskId(payload);
    const updatedTask = await client.updateTask(
      taskId,
      definedTaskFields(payload, [
        "title",
        "description",
        "assigneeMemberId",
        "dueDate",
        "milestoneId",
      ]),
    );

    if (payload.status !== undefined) {
      return client.updateTaskStatus(taskId, payload.status);
    }

    return updatedTask;
  }

  if (type === "task.update.status") {
    const taskId = taskActionTaskId(payload);

    return client.updateTaskStatus(taskId, taskActionStatus(payload));
  }

  if (type === "task.complete") {
    const taskId = taskActionTaskId(payload);

    return client.updateTaskStatus(taskId, "done");
  }

  throw new TaskGithubProgressApiError(
    `Unsupported Task action type: ${String(type)}`,
  );
}

function getMockStore(workspaceId) {
  if (mockStores.has(workspaceId)) {
    return mockStores.get(workspaceId);
  }

  const fixture = createWorkspaceDashboardFixture(workspaceId);
  const juhyungMember =
    fixture.members.find((member) =>
      String(member.displayName ?? "")
        .toLowerCase()
        .includes("task"),
    ) ?? fixture.members[0];
  const now = nowIso();
  const firstTask = normalizeTask(fixture.tasks[0], workspaceId);
  const milestones = [
    normalizeMilestone(
      {
        id: "44444444-4444-4444-8444-4444444444a1",
        title: "MVP 작업 / GitHub",
        status: "in_progress",
        startDate: "2026-06-30",
        endDate: "2026-07-05",
      },
      workspaceId,
    ),
  ];
  const tasks = [
    { ...firstTask, milestoneId: milestones[0].id },
    normalizeTask(
      {
        id: "44444444-4444-4444-8444-4444444444b2",
        workspaceId,
        milestoneId: milestones[0].id,
        title: "작업 보드 상태 변경",
        status: "todo",
        priority: "urgent",
        assignee: {
          memberId: juhyungMember.memberId,
          userId: juhyungMember.userId,
          name: juhyungMember.name ?? juhyungMember.displayName,
        },
        dueDate: addDaysDateOnly(2),
        linkedIssueCount: 0,
        linkedPrCount: 0,
        updatedAt: now,
      },
      workspaceId,
    ),
    normalizeTask(
      {
        id: "44444444-4444-4444-8444-4444444444c3",
        workspaceId,
        milestoneId: null,
        title: "진행률 요약 계산",
        status: "blocked",
        priority: "high",
        assignee: null,
        dueDate: addDaysDateOnly(-1),
        linkedIssueCount: 0,
        linkedPrCount: 1,
        updatedAt: now,
      },
      workspaceId,
    ),
  ];
  const draftSource = fixture.meetingActionItems[0];
  const taskDrafts = draftSource
    ? [
        normalizeDraft(
          {
            id: "99999999-9999-4999-8999-9999999999d1",
            sourceType: "meeting_action_item",
            sourceId: draftSource.id,
            title: draftSource.title,
            description: draftSource.description,
            assigneeMemberId: draftSource.assigneeSuggestionMemberId,
            priority: "medium",
            dueDate: draftSource.dueDateSuggestion,
          },
          workspaceId,
        ),
      ]
    : [];
  const store = {
    workspaceId,
    members: fixture.members,
    tasks,
    milestones,
    taskDrafts,
    checklistItems: new Map([
      [
        firstTask.id,
        [
          {
            id: "checklist-1",
            taskId: firstTask.id,
            title: "실제 런타임 API 연결",
            status: "done",
            sortOrder: 0,
            updatedAt: now,
          },
          {
            id: "checklist-2",
            taskId: firstTask.id,
            title: "상태 변경 버튼 검증",
            status: "todo",
            sortOrder: 1,
            updatedAt: now,
          },
        ],
      ],
    ]),
    comments: new Map(),
    activityLogs: new Map(),
    githubConnections: [
      {
        id: "55555555-5555-4555-8555-5555555555c1",
        workspaceId,
        provider: "github_app",
        installationId: "mock-installation-123",
        githubAccountLogin: "example",
        scopes: ["metadata", "contents"],
        connectedAt: "2026-06-27T12:00:00.000Z",
        revokedAt: null,
      },
    ],
  };

  mockStores.set(workspaceId, store);

  return store;
}

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function findTask(store, taskId) {
  const task = store.tasks.find((item) => item.id === taskId);

  if (!task) {
    throw new TaskGithubProgressApiError("Task not found", {
      status: 404,
      path: `/api/tasks/${taskId}`,
    });
  }

  return task;
}

function applyTaskFilters(tasks, query = {}) {
  const statuses = toFilterSet(query.status);
  const priorities = toFilterSet(query.priority);
  const milestoneId = query.milestoneId || null;
  const dueDateFrom = query.dueDateFrom || null;
  const dueDateTo = query.dueDateTo || null;

  return tasks.filter((task) => {
    if (statuses.size && !statuses.has(task.status)) return false;
    if (priorities.size && !priorities.has(task.priority)) return false;
    if (milestoneId && task.milestoneId !== milestoneId) return false;
    if (dueDateFrom && (!task.dueDate || task.dueDate < dueDateFrom))
      return false;
    if (dueDateTo && (!task.dueDate || task.dueDate > dueDateTo)) return false;

    return true;
  });
}

function toFilterSet(value) {
  if (!value) return new Set();

  const values = Array.isArray(value) ? value : String(value).split(",");

  return new Set(values.filter(Boolean));
}

function addActivity(store, taskId, action, beforeValue, afterValue) {
  const logs = store.activityLogs.get(taskId) ?? [];
  const entry = {
    id: createId("activity"),
    taskId,
    action,
    actor: null,
    beforeValue: beforeValue ?? null,
    afterValue: afterValue ?? null,
    createdAt: nowIso(),
  };

  store.activityLogs.set(taskId, [entry, ...logs]);

  return entry;
}

export function createTaskGithubProgressApiClient({
  baseUrl = defaultWorkspaceApiBaseUrl(),
  fetcher = fetch,
  actor,
} = {}) {
  const requestOptions = { baseUrl, fetcher, actor };

  return {
    async listTasks(workspaceId, query = {}) {
      const path = `/api/workspaces/${encodeURIComponent(workspaceId)}/tasks${toQueryString(query)}`;

      return requestJson(path, undefined, requestOptions);
    },

    async getTask(taskId) {
      return requestJson(
        `/api/tasks/${encodeURIComponent(taskId)}`,
        undefined,
        requestOptions,
      );
    },

    async createTask(workspaceId, body) {
      return requestJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/tasks`,
        withJsonBody(body, { method: "POST" }),
        requestOptions,
      );
    },

    async updateTask(taskId, body) {
      return requestJson(
        `/api/tasks/${encodeURIComponent(taskId)}`,
        withJsonBody(body, { method: "PATCH" }),
        requestOptions,
      );
    },

    async updateTaskStatus(taskId, status) {
      return requestJson(
        `/api/tasks/${encodeURIComponent(taskId)}/status`,
        withJsonBody({ status }, { method: "PATCH" }),
        requestOptions,
      );
    },

    async deleteTask(taskId) {
      return requestJson(
        `/api/tasks/${encodeURIComponent(taskId)}`,
        { method: "DELETE" },
        requestOptions,
      );
    },

    async createChecklistItem(taskId, body) {
      return requestJson(
        `/api/tasks/${encodeURIComponent(taskId)}/checklist-items`,
        withJsonBody(body, { method: "POST" }),
        requestOptions,
      );
    },

    async updateChecklistItem(taskId, itemId, body) {
      return requestJson(
        `/api/tasks/${encodeURIComponent(taskId)}/checklist-items/${encodeURIComponent(itemId)}`,
        withJsonBody(body, { method: "PATCH" }),
        requestOptions,
      );
    },

    async deleteChecklistItem(taskId, itemId) {
      return requestJson(
        `/api/tasks/${encodeURIComponent(taskId)}/checklist-items/${encodeURIComponent(itemId)}`,
        { method: "DELETE" },
        requestOptions,
      );
    },

    async createTaskComment(taskId, body) {
      return requestJson(
        `/api/tasks/${encodeURIComponent(taskId)}/comments`,
        withJsonBody(body, { method: "POST" }),
        requestOptions,
      );
    },

    async listTaskComments(taskId) {
      return requestJson(
        `/api/tasks/${encodeURIComponent(taskId)}/comments`,
        undefined,
        requestOptions,
      );
    },

    async listTaskActivityLogs(taskId) {
      return requestJson(
        `/api/tasks/${encodeURIComponent(taskId)}/activity-logs`,
        undefined,
        requestOptions,
      );
    },

    async listMilestones(workspaceId) {
      return requestJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/milestones`,
        undefined,
        requestOptions,
      );
    },

    async createMilestone(workspaceId, body) {
      return requestJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/milestones`,
        withJsonBody(body, { method: "POST" }),
        requestOptions,
      );
    },

    async updateMilestone(milestoneId, body) {
      return requestJson(
        `/api/milestones/${encodeURIComponent(milestoneId)}`,
        withJsonBody(body, { method: "PATCH" }),
        requestOptions,
      );
    },

    async listTaskDrafts() {
      return [];
    },

    async createTaskDraft(workspaceId, body) {
      return requestJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/task-drafts`,
        withJsonBody(body, { method: "POST" }),
        requestOptions,
      );
    },

    async approveTaskDraft(draftId) {
      return requestJson(
        `/api/task-drafts/${encodeURIComponent(draftId)}/approve`,
        { method: "POST" },
        requestOptions,
      );
    },

    async rejectTaskDraft(draftId) {
      return requestJson(
        `/api/task-drafts/${encodeURIComponent(draftId)}/reject`,
        { method: "POST" },
        requestOptions,
      );
    },

    async listGithubConnections(workspaceId) {
      return requestJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/github/connections`,
        undefined,
        requestOptions,
      );
    },

    async startGithubConnection(workspaceId) {
      return requestJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/github/connections`,
        withJsonBody({}, { method: "POST" }),
        requestOptions,
      );
    },

    async revokeGithubConnection(workspaceId, connectionId) {
      return requestJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/github/connections/${encodeURIComponent(connectionId)}`,
        { method: "DELETE" },
        requestOptions,
      );
    },

    async getDeferredGithubReadModel(workspaceId) {
      return getDeferredGithubReadModel(workspaceId);
    },

    async calculateProgress(workspaceId, tasks, options = {}) {
      return requestJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/progress/summary${toQueryString(
          {
            milestoneId: options.milestoneId ?? null,
          },
        )}`,
        undefined,
        requestOptions,
      );
    },
  };
}

export function createMockTaskGithubProgressClient() {
  return {
    async listTasks(workspaceId, query = {}) {
      const store = getMockStore(workspaceId);

      return clone(applyTaskFilters(store.tasks, query));
    },

    async getTask(taskId) {
      for (const store of mockStores.values()) {
        const task = store.tasks.find((item) => item.id === taskId);

        if (task) {
          return {
            ...clone(task),
            checklistItems: clone(store.checklistItems.get(taskId) ?? []),
          };
        }
      }

      throw new TaskGithubProgressApiError("Task not found", {
        status: 404,
        path: `/api/tasks/${taskId}`,
      });
    },

    async createTask(workspaceId, body) {
      const store = getMockStore(workspaceId);
      const now = nowIso();
      const member = store.members.find(
        (item) => item.memberId === body.assigneeMemberId,
      );
      const task = normalizeTask(
        {
          id: createId("task"),
          workspaceId,
          milestoneId: body.milestoneId ?? null,
          title: body.title,
          status: body.status ?? "todo",
          priority: body.priority ?? "medium",
          assignee: body.assigneeMemberId
            ? {
                memberId: body.assigneeMemberId,
                userId: member?.userId,
                name:
                  member?.name ?? member?.displayName ?? body.assigneeMemberId,
              }
            : null,
          dueDate: body.dueDate ?? null,
          updatedAt: now,
        },
        workspaceId,
      );

      store.tasks = [task, ...store.tasks];
      addActivity(store, task.id, "task.created", null, task.title);

      return clone(task);
    },

    async updateTask(taskId, body) {
      for (const store of mockStores.values()) {
        const task = store.tasks.find((item) => item.id === taskId);

        if (!task) continue;

        const before = clone(task);
        const member = store.members.find(
          (item) => item.memberId === body.assigneeMemberId,
        );

        Object.assign(task, {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.description !== undefined
            ? { description: body.description }
            : {}),
          ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
          ...(body.milestoneId !== undefined
            ? { milestoneId: body.milestoneId }
            : {}),
          ...(body.assigneeMemberId !== undefined
            ? {
                assignee: body.assigneeMemberId
                  ? {
                      memberId: body.assigneeMemberId,
                      userId: member?.userId,
                      name:
                        member?.name ??
                        member?.displayName ??
                        body.assigneeMemberId,
                    }
                  : null,
              }
            : {}),
          updatedAt: nowIso(),
        });

        addActivity(store, taskId, "task.updated", before, task);

        return clone(task);
      }

      return findTask(
        getMockStore(workspaceDashboardFixture.workspace.id),
        taskId,
      );
    },

    async updateTaskStatus(taskId, status) {
      for (const store of mockStores.values()) {
        const task = store.tasks.find((item) => item.id === taskId);

        if (!task) continue;

        const beforeStatus = task.status;
        task.status = status;
        task.updatedAt = nowIso();
        task.isDelayed = Boolean(
          task.dueDate && status !== "done" && task.dueDate < todayDateOnly(),
        );
        addActivity(store, taskId, "task.status_changed", beforeStatus, status);

        return clone(task);
      }

      throw new TaskGithubProgressApiError("Task not found", {
        status: 404,
        path: `/api/tasks/${taskId}/status`,
      });
    },

    async deleteTask(taskId) {
      for (const store of mockStores.values()) {
        const beforeLength = store.tasks.length;
        store.tasks = store.tasks.filter((task) => task.id !== taskId);

        if (beforeLength !== store.tasks.length) {
          addActivity(store, taskId, "task.deleted", taskId, null);
          return null;
        }
      }

      return null;
    },

    async createChecklistItem(taskId, body) {
      for (const store of mockStores.values()) {
        if (!store.tasks.some((task) => task.id === taskId)) continue;

        const items = store.checklistItems.get(taskId) ?? [];
        const item = {
          id: createId("checklist"),
          taskId,
          title: body.title,
          status: body.status ?? "todo",
          sortOrder: body.sortOrder ?? items.length,
          updatedAt: nowIso(),
        };

        store.checklistItems.set(taskId, [...items, item]);
        addActivity(
          store,
          taskId,
          "task.checklist_item_created",
          null,
          item.title,
        );

        return clone(item);
      }

      throw new TaskGithubProgressApiError("Task not found", {
        status: 404,
        path: `/api/tasks/${taskId}/checklist-items`,
      });
    },

    async updateChecklistItem(taskId, itemId, body) {
      for (const store of mockStores.values()) {
        const items = store.checklistItems.get(taskId) ?? [];
        const item = items.find((entry) => entry.id === itemId);

        if (!item) continue;

        Object.assign(item, {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.sortOrder !== undefined
            ? { sortOrder: body.sortOrder }
            : {}),
          updatedAt: nowIso(),
        });
        addActivity(store, taskId, "task.checklist_item_updated", null, item);

        return clone(item);
      }

      throw new TaskGithubProgressApiError("Checklist item not found", {
        status: 404,
        path: `/api/tasks/${taskId}/checklist-items/${itemId}`,
      });
    },

    async deleteChecklistItem(taskId, itemId) {
      for (const store of mockStores.values()) {
        const items = store.checklistItems.get(taskId) ?? [];

        store.checklistItems.set(
          taskId,
          items.filter((item) => item.id !== itemId),
        );
        addActivity(store, taskId, "task.checklist_item_deleted", itemId, null);
      }

      return null;
    },

    async createTaskComment(taskId, body) {
      for (const store of mockStores.values()) {
        if (!store.tasks.some((task) => task.id === taskId)) continue;

        const comments = store.comments.get(taskId) ?? [];
        const currentMember = currentFixtureMember(store.workspaceId);
        const comment = {
          id: createId("comment"),
          taskId,
          body: body.body,
          author: {
            memberId: currentMember.memberId,
            userId: currentMember.userId,
            name: "워크스페이스 / 캔버스",
          },
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };

        store.comments.set(taskId, [comment, ...comments]);
        addActivity(store, taskId, "task.comment_created", null, body.body);

        return clone(comment);
      }

      throw new TaskGithubProgressApiError("Task not found", {
        status: 404,
        path: `/api/tasks/${taskId}/comments`,
      });
    },

    async listTaskComments(taskId) {
      for (const store of mockStores.values()) {
        if (store.comments.has(taskId)) {
          return clone(store.comments.get(taskId));
        }
      }

      return [];
    },

    async listTaskActivityLogs(taskId) {
      for (const store of mockStores.values()) {
        if (store.activityLogs.has(taskId)) {
          return clone(store.activityLogs.get(taskId));
        }
      }

      return [];
    },

    async listMilestones(workspaceId) {
      return clone(getMockStore(workspaceId).milestones);
    },

    async createMilestone(workspaceId, body) {
      const store = getMockStore(workspaceId);
      const milestone = normalizeMilestone(
        {
          id: createId("milestone"),
          ...body,
          updatedAt: nowIso(),
        },
        workspaceId,
      );

      store.milestones = [milestone, ...store.milestones];

      return clone(milestone);
    },

    async updateMilestone(milestoneId, body) {
      for (const store of mockStores.values()) {
        const milestone = store.milestones.find(
          (item) => item.id === milestoneId,
        );

        if (!milestone) continue;

        Object.assign(milestone, body, { updatedAt: nowIso() });

        return clone(milestone);
      }

      throw new TaskGithubProgressApiError("Milestone not found", {
        status: 404,
        path: `/api/milestones/${milestoneId}`,
      });
    },

    async listTaskDrafts(workspaceId) {
      return clone(getMockStore(workspaceId).taskDrafts);
    },

    async createTaskDraft(workspaceId, body) {
      const store = getMockStore(workspaceId);
      const draft = normalizeDraft(
        {
          id: createId("task-draft"),
          ...body,
        },
        workspaceId,
      );

      store.taskDrafts = [draft, ...store.taskDrafts];

      return clone(draft);
    },

    async approveTaskDraft(draftId) {
      for (const store of mockStores.values()) {
        const draft = store.taskDrafts.find((item) => item.id === draftId);

        if (!draft) continue;
        if (draft.status !== "draft") return clone(draft);

        const task = await this.createTask(store.workspaceId, {
          title: draft.title,
          description: draft.description,
          assigneeMemberId: draft.assigneeMemberId,
          priority: draft.priority,
          dueDate: draft.dueDate,
        });

        draft.status = "approved";
        draft.taskId = task.id;
        draft.updatedAt = nowIso();

        return clone(draft);
      }

      throw new TaskGithubProgressApiError("Task draft not found", {
        status: 404,
        path: `/api/task-drafts/${draftId}/approve`,
      });
    },

    async rejectTaskDraft(draftId) {
      for (const store of mockStores.values()) {
        const draft = store.taskDrafts.find((item) => item.id === draftId);

        if (!draft) continue;

        draft.status = "rejected";
        draft.updatedAt = nowIso();

        return clone(draft);
      }

      throw new TaskGithubProgressApiError("Task draft not found", {
        status: 404,
        path: `/api/task-drafts/${draftId}/reject`,
      });
    },

    async listGithubConnections(workspaceId) {
      return clone(getMockStore(workspaceId).githubConnections);
    },

    async startGithubConnection(workspaceId) {
      const store = getMockStore(workspaceId);
      const state = createId("github-state");
      const connection = {
        id: createId("github-connection"),
        workspaceId,
        provider: "github_app",
        installationId: "mock-installation-local",
        githubAccountLogin: "example",
        scopes: ["metadata", "contents"],
        connectedAt: nowIso(),
        revokedAt: null,
      };

      store.githubConnections = [connection, ...store.githubConnections];

      return {
        state,
        installationUrl: `https://github.com/apps/pilo/installations/new?state=${encodeURIComponent(state)}`,
      };
    },

    async revokeGithubConnection(workspaceId, connectionId) {
      const store = getMockStore(workspaceId);
      const connection = store.githubConnections.find(
        (item) => item.id === connectionId,
      );

      if (!connection) {
        return null;
      }

      connection.revokedAt = nowIso();

      return clone(connection);
    },

    async getDeferredGithubReadModel(workspaceId) {
      return getDeferredGithubReadModel(workspaceId);
    },

    async calculateProgress(workspaceId, tasks, options = {}) {
      return calculateProgressSummary(tasks, { workspaceId, ...options });
    },
  };
}

export function createTaskGithubProgressClient(options = {}) {
  const mode = resolveTaskGithubProgressClientMode(options.mode);

  if (mode === "api") {
    return createTaskGithubProgressApiClient({
      ...options,
      actor: options.actor ?? currentFixtureMember(options.workspaceId),
    });
  }

  return createMockTaskGithubProgressClient();
}
