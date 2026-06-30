import type {
  CreateNotificationInput,
  NotificationRecord,
  NotificationRepositoryMode,
} from "../notification.types";

export const NOTIFICATION_REPOSITORY = Symbol("NOTIFICATION_REPOSITORY");

export interface NotificationRepository {
  readonly mode: NotificationRepositoryMode;

  listByWorkspaceAndRecipient(input: {
    workspaceId: string;
    recipientUserId: string;
  }): NotificationRecord[];

  findById(notificationId: string): NotificationRecord | null;

  create(input: CreateNotificationInput): NotificationRecord;

  markRead(input: {
    notificationId: string;
    readAt: string;
  }): NotificationRecord | null;

  markWorkspaceRecipientRead(input: {
    workspaceId: string;
    recipientUserId: string;
    readAt: string;
  }): {
    updatedCount: number;
    notifications: NotificationRecord[];
  };
}
