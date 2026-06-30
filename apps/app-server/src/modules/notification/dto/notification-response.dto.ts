import type {
  NotificationRecord,
  NotificationRepositoryMode,
} from "../notification.types";

export interface NotificationScaffoldResponseDto {
  module: "notification";
  repositoryMode: NotificationRepositoryMode;
}

export type NotificationResponseDto = NotificationRecord;

export type MarkWorkspaceNotificationsReadResponseDto = {
  workspaceId: string;
  recipientUserId: string;
  updatedCount: number;
  notifications: NotificationResponseDto[];
};
