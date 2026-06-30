export type NotificationRepositoryMode = "mock";

export type NotificationType =
  | "task_assigned"
  | "review_requested"
  | "agent_approval_required"
  | "report_created"
  | "github_sync_failed";

export type NotificationRelatedObject = {
  type:
    | "task"
    | "pull_request"
    | "agent_action"
    | "meeting_report"
    | "github_connection";
  id: string;
};

export type NotificationRecord = {
  id: string;
  workspaceId: string;
  recipientUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  readAt: string | null;
  relatedObject: NotificationRelatedObject | null;
  createdAt: string;
};

export type CreateNotificationInput = Omit<
  NotificationRecord,
  "id" | "readAt" | "createdAt"
> & {
  id?: string;
  readAt?: string | null;
  createdAt?: string;
};
