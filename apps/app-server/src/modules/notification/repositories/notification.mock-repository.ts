import { Injectable } from "@nestjs/common";
import type {
  CreateNotificationInput,
  NotificationRecord,
  NotificationRepositoryMode,
} from "../notification.types";
import type { NotificationRepository } from "./notification.repository";

const DEFAULT_CREATED_AT = "2026-06-30T00:00:00.000Z";

@Injectable()
export class MockNotificationRepository implements NotificationRepository {
  readonly mode: NotificationRepositoryMode = "mock";

  private readonly notifications = new Map<string, NotificationRecord>();

  private readonly seededRecipientKeys = new Set<string>();

  listByWorkspaceAndRecipient(input: {
    workspaceId: string;
    recipientUserId: string;
  }): NotificationRecord[] {
    this.ensureSeeded(input.workspaceId, input.recipientUserId);

    return this.sortNewestFirst(
      [...this.notifications.values()].filter(
        (notification) =>
          notification.workspaceId === input.workspaceId &&
          notification.recipientUserId === input.recipientUserId,
      ),
    );
  }

  findById(notificationId: string): NotificationRecord | null {
    return this.notifications.get(notificationId) ?? null;
  }

  create(input: CreateNotificationInput): NotificationRecord {
    const notification: NotificationRecord = {
      ...input,
      id:
        input.id ??
        `notification-${this.notifications.size + 1}-${Date.now()}`,
      readAt: input.readAt ?? null,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };

    this.notifications.set(notification.id, notification);

    return notification;
  }

  markRead(input: {
    notificationId: string;
    readAt: string;
  }): NotificationRecord | null {
    const notification = this.notifications.get(input.notificationId);

    if (!notification) {
      return null;
    }

    const nextNotification = {
      ...notification,
      readAt: notification.readAt ?? input.readAt,
    };

    this.notifications.set(nextNotification.id, nextNotification);

    return nextNotification;
  }

  markWorkspaceRecipientRead(input: {
    workspaceId: string;
    recipientUserId: string;
    readAt: string;
  }): {
    updatedCount: number;
    notifications: NotificationRecord[];
  } {
    this.ensureSeeded(input.workspaceId, input.recipientUserId);

    let updatedCount = 0;

    for (const notification of this.notifications.values()) {
      if (
        notification.workspaceId !== input.workspaceId ||
        notification.recipientUserId !== input.recipientUserId ||
        notification.readAt
      ) {
        continue;
      }

      this.notifications.set(notification.id, {
        ...notification,
        readAt: input.readAt,
      });
      updatedCount += 1;
    }

    return {
      updatedCount,
      notifications: this.listByWorkspaceAndRecipient(input),
    };
  }

  private ensureSeeded(workspaceId: string, recipientUserId: string) {
    const seedKey = `${workspaceId}:${recipientUserId}`;

    if (this.seededRecipientKeys.has(seedKey)) {
      return;
    }

    this.seededRecipientKeys.add(seedKey);

    for (const notification of createSeedNotifications(
      workspaceId,
      recipientUserId,
    )) {
      this.notifications.set(notification.id, notification);
    }
  }

  private sortNewestFirst(notifications: NotificationRecord[]) {
    return notifications.sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    );
  }
}

function createSeedNotifications(
  workspaceId: string,
  recipientUserId: string,
): NotificationRecord[] {
  return [
    {
      id: createSeedId(workspaceId, recipientUserId, "agent-approval"),
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
      createdAt: DEFAULT_CREATED_AT,
    },
    {
      id: createSeedId(workspaceId, recipientUserId, "review-request"),
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
      id: createSeedId(workspaceId, recipientUserId, "task-assigned"),
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

function createSeedId(workspaceId: string, recipientUserId: string, key: string) {
  return `notification-${workspaceId}-${recipientUserId}-${key}`.replace(
    /[^a-zA-Z0-9-]/g,
    "-",
  );
}
