import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CurrentUserResponse } from "../auth/auth.service";
import { WorkspaceCurrentMemberAdapter } from "../workspace/workspace-current-member.adapter";
import type { NotificationResponseDto } from "./dto/notification-response.dto";
import type { NotificationRepository } from "./repositories/notification.repository";
import { NOTIFICATION_REPOSITORY } from "./repositories/notification.repository";

@Injectable()
export class NotificationService {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepository: NotificationRepository,
    private readonly currentMemberAdapter: WorkspaceCurrentMemberAdapter,
  ) {}

  getScaffoldStatus() {
    return {
      module: "notification" as const,
      repositoryMode: this.notificationRepository.mode,
    };
  }

  async listWorkspaceNotifications(input: {
    workspaceId: string;
    currentUser: CurrentUserResponse;
  }): Promise<NotificationResponseDto[]> {
    const workspaceId = requireId(input.workspaceId, "workspaceId");

    await this.currentMemberAdapter.requireCurrentMember({
      workspaceId,
      currentUser: input.currentUser,
    });

    return this.notificationRepository.listByWorkspaceAndRecipient({
      workspaceId,
      recipientUserId: input.currentUser.id,
    });
  }

  async markNotificationRead(input: {
    notificationId: string;
    currentUser: CurrentUserResponse;
  }): Promise<NotificationResponseDto> {
    const notificationId = requireId(input.notificationId, "notificationId");
    const notification = this.notificationRepository.findById(notificationId);

    if (!notification) {
      throw new NotFoundException("Notification was not found.");
    }

    if (notification.recipientUserId !== input.currentUser.id) {
      throw new ForbiddenException("Notification belongs to another user.");
    }

    await this.currentMemberAdapter.requireCurrentMember({
      workspaceId: notification.workspaceId,
      currentUser: input.currentUser,
    });

    const updatedNotification = this.notificationRepository.markRead({
      notificationId,
      readAt: new Date().toISOString(),
    });

    if (!updatedNotification) {
      throw new NotFoundException("Notification was not found.");
    }

    return updatedNotification;
  }

  async markWorkspaceNotificationsRead(input: {
    workspaceId: string;
    currentUser: CurrentUserResponse;
  }) {
    const workspaceId = requireId(input.workspaceId, "workspaceId");

    await this.currentMemberAdapter.requireCurrentMember({
      workspaceId,
      currentUser: input.currentUser,
    });

    return {
      workspaceId,
      recipientUserId: input.currentUser.id,
      ...this.notificationRepository.markWorkspaceRecipientRead({
        workspaceId,
        recipientUserId: input.currentUser.id,
        readAt: new Date().toISOString(),
      }),
    };
  }
}

function requireId(value: string, name: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new BadRequestException(`${name} is required.`);
  }

  return trimmedValue;
}
