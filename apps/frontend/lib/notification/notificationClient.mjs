import {
  buildWorkspaceApiUrl,
  defaultWorkspaceApiBaseUrl,
  LOCAL_MVP_USER_ID,
  localMvpActorHeaders,
  WorkspaceApiError,
} from "../workspace/workspaceClient.mjs";

const DEFAULT_NOTIFICATION_MODE = "mock";
const DEFAULT_USER_ID = LOCAL_MVP_USER_ID;
const DEFAULT_NOW = "2026-06-30T00:00:00.000Z";

const mockNotificationsByWorkspaceId = new Map();

export function defaultNotificationMode() {
  return (
    process.env.NEXT_PUBLIC_PILO_NOTIFICATION_MODE ??
    process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE ??
    DEFAULT_NOTIFICATION_MODE
  );
}

export function resolveNotificationClientMode(
  mode = defaultNotificationMode(),
) {
  return mode === "api" ? "api" : "mock";
}

export function buildNotificationApiUrl(
  path,
  baseUrl = defaultWorkspaceApiBaseUrl(),
) {
  if (!path.startsWith("/api/")) {
    throw new NotificationApiError(
      "Notification API path must start with /api/",
      { path },
    );
  }

  return buildWorkspaceApiUrl(path, baseUrl);
}

export class NotificationApiError extends WorkspaceApiError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "NotificationApiError";
  }
}

async function readNotificationJson(response, path) {
  try {
    return await response.json();
  } catch (error) {
    throw new NotificationApiError("Notification API returned invalid JSON", {
      status: response.status,
      path,
    });
  }
}

async function requestNotificationJson(path, init, { baseUrl, fetcher }) {
  const response = await fetcher(buildNotificationApiUrl(path, baseUrl), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...localMvpActorHeaders(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new NotificationApiError("Notification API request failed", {
      status: response.status,
      path,
    });
  }

  if (response.status === 204) {
    return null;
  }

  return readNotificationJson(response, path);
}

export function createNotificationFixture(
  workspaceId,
  recipientUserId = DEFAULT_USER_ID,
) {
  return [
    {
      id: `notification-${workspaceId}-${recipientUserId}-agent-approval`,
      workspaceId,
      recipientUserId,
      type: "agent_approval_required",
      title: "Agent action needs approval",
      body: "A generated task draft is waiting for your approval.",
      readAt: null,
      relatedObject: {
        type: "agent_action",
        id: "99999999-9999-4999-8999-999999999991",
      },
      createdAt: DEFAULT_NOW,
    },
    {
      id: `notification-${workspaceId}-${recipientUserId}-review-request`,
      workspaceId,
      recipientUserId,
      type: "review_requested",
      title: "Pull request review requested",
      body: "A pull request linked to the workspace needs review.",
      readAt: null,
      relatedObject: {
        type: "pull_request",
        id: "66666666-6666-4666-8666-666666666661",
      },
      createdAt: "2026-06-29T09:00:00.000Z",
    },
    {
      id: `notification-${workspaceId}-${recipientUserId}-task-assigned`,
      workspaceId,
      recipientUserId,
      type: "task_assigned",
      title: "Task assigned",
      body: "A workspace task was assigned to you.",
      readAt: null,
      relatedObject: {
        type: "task",
        id: "44444444-4444-4444-8444-444444444441",
      },
      createdAt: "2026-06-28T09:00:00.000Z",
    },
  ];
}

function notificationsForWorkspace(workspaceId) {
  if (!mockNotificationsByWorkspaceId.has(workspaceId)) {
    mockNotificationsByWorkspaceId.set(
      workspaceId,
      createNotificationFixture(workspaceId),
    );
  }

  return mockNotificationsByWorkspaceId.get(workspaceId);
}

function sortNewestFirst(notifications) {
  return [...notifications].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export function createMockNotificationClient() {
  return {
    async listNotifications(workspaceId) {
      return sortNewestFirst(notificationsForWorkspace(workspaceId));
    },

    async markNotificationRead(notificationId, { workspaceId } = {}) {
      const resolvedWorkspaceId = workspaceId ?? findWorkspaceId(notificationId);

      if (!resolvedWorkspaceId) {
        throw new NotificationApiError("Notification not found", {
          status: 404,
          path: `/api/notifications/${notificationId}/read`,
        });
      }

      const notifications = notificationsForWorkspace(resolvedWorkspaceId);
      const notificationIndex = notifications.findIndex(
        (notification) => notification.id === notificationId,
      );

      if (notificationIndex === -1) {
        throw new NotificationApiError("Notification not found", {
          status: 404,
          path: `/api/notifications/${notificationId}/read`,
        });
      }

      const notification = notifications[notificationIndex];
      const updatedNotification = {
        ...notification,
        readAt: notification.readAt ?? new Date().toISOString(),
      };

      notifications[notificationIndex] = updatedNotification;
      mockNotificationsByWorkspaceId.set(resolvedWorkspaceId, [
        ...notifications,
      ]);

      return updatedNotification;
    },

    async markWorkspaceNotificationsRead(workspaceId) {
      const notifications = notificationsForWorkspace(workspaceId);
      const readAt = new Date().toISOString();
      let updatedCount = 0;
      const updatedNotifications = notifications.map((notification) => {
        if (notification.readAt) {
          return notification;
        }

        updatedCount += 1;

        return {
          ...notification,
          readAt,
        };
      });

      mockNotificationsByWorkspaceId.set(workspaceId, updatedNotifications);

      return {
        workspaceId,
        recipientUserId: DEFAULT_USER_ID,
        updatedCount,
        notifications: sortNewestFirst(updatedNotifications),
      };
    },
  };
}

function findWorkspaceId(notificationId) {
  for (const [workspaceId, notifications] of mockNotificationsByWorkspaceId) {
    if (
      notifications.some((notification) => notification.id === notificationId)
    ) {
      return workspaceId;
    }
  }

  return null;
}

export function createNotificationApiClient({
  baseUrl = defaultWorkspaceApiBaseUrl(),
  fetcher = fetch,
} = {}) {
  const requestOptions = { baseUrl, fetcher };

  return {
    async listNotifications(workspaceId) {
      return requestNotificationJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/notifications`,
        undefined,
        requestOptions,
      );
    },

    async markNotificationRead(notificationId) {
      return requestNotificationJson(
        `/api/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: "PATCH" },
        requestOptions,
      );
    },

    async markWorkspaceNotificationsRead(workspaceId) {
      return requestNotificationJson(
        `/api/workspaces/${encodeURIComponent(
          workspaceId,
        )}/notifications/read-all`,
        { method: "PATCH" },
        requestOptions,
      );
    },
  };
}

export function createNotificationClient(options = {}) {
  const mode = resolveNotificationClientMode(options.mode);

  if (mode === "api") {
    return createNotificationApiClient(options);
  }

  return createMockNotificationClient();
}
