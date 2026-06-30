import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  UnauthorizedException,
} from "@nestjs/common";
import type { CurrentUserResponse } from "../auth/auth.service";
import { AuthService } from "../auth/auth.service";
import { WorkspaceAccessError } from "../workspace/workspace.service";
import type {
  MarkWorkspaceNotificationsReadResponseDto,
  NotificationResponseDto,
  NotificationScaffoldResponseDto,
} from "./dto/notification-response.dto";
import { NotificationService } from "./notification.service";

@Controller()
export class NotificationController {
  constructor(
    private readonly authService: AuthService,
    private readonly notificationService: NotificationService,
  ) {}

  @Get("notifications")
  getScaffoldStatus(): NotificationScaffoldResponseDto {
    return this.notificationService.getScaffoldStatus();
  }

  @Get("workspaces/:workspaceId/notifications")
  listWorkspaceNotifications(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("workspaceId") workspaceId: string,
    @Headers("x-user-id") userIdHeader?: string | string[],
  ): Promise<NotificationResponseDto[]> {
    return this.handleNotificationRequest(() =>
      this.notificationService.listWorkspaceNotifications({
        workspaceId,
        currentUser: this.requireCurrentUser(cookieHeader, userIdHeader),
      }),
    );
  }

  @Patch("notifications/:notificationId/read")
  markNotificationRead(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("notificationId") notificationId: string,
    @Headers("x-user-id") userIdHeader?: string | string[],
  ): Promise<NotificationResponseDto> {
    return this.handleNotificationRequest(() =>
      this.notificationService.markNotificationRead({
        notificationId,
        currentUser: this.requireCurrentUser(cookieHeader, userIdHeader),
      }),
    );
  }

  @Patch("workspaces/:workspaceId/notifications/read-all")
  markWorkspaceNotificationsRead(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("workspaceId") workspaceId: string,
    @Headers("x-user-id") userIdHeader?: string | string[],
  ): Promise<MarkWorkspaceNotificationsReadResponseDto> {
    return this.handleNotificationRequest(() =>
      this.notificationService.markWorkspaceNotificationsRead({
        workspaceId,
        currentUser: this.requireCurrentUser(cookieHeader, userIdHeader),
      }),
    );
  }

  private requireCurrentUser(
    cookieHeader: string | undefined,
    userIdHeader: string | string[] | undefined,
  ): CurrentUserResponse {
    const currentUser =
      this.authService.getCurrentUserFromCookieOrLocalHeader(
        cookieHeader,
        userIdHeader,
      );

    if (!currentUser) {
      throw new UnauthorizedException();
    }

    return currentUser;
  }

  private async handleNotificationRequest<T>(handler: () => Promise<T>) {
    try {
      return await handler();
    } catch (error) {
      if (error instanceof WorkspaceAccessError) {
        if (error.code === "workspace_forbidden") {
          throw new ForbiddenException(error.message);
        }

        throw new NotFoundException(error.message);
      }

      throw error;
    }
  }
}
