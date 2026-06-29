import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Headers,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import type { CurrentUserResponse } from "../auth/auth.service";
import { AuthService } from "../auth/auth.service";
import {
  WorkspaceInviteError,
  WorkspaceService,
  WorkspaceValidationError,
} from "./workspace.service";

@Controller("workspace-invites")
export class WorkspaceInviteController {
  constructor(
    private readonly authService: AuthService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  @Post(":inviteId/accept")
  acceptWorkspaceInvite(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("inviteId") inviteId: string,
    @Body() body: unknown,
  ) {
    return this.handleInviteRequest(() =>
      this.workspaceService.acceptWorkspaceInvite({
        currentUser: this.requireCurrentUser(cookieHeader),
        inviteId,
        body,
      }),
    );
  }

  private requireCurrentUser(
    cookieHeader: string | undefined,
  ): CurrentUserResponse {
    const currentUser =
      this.authService.getCurrentUserFromCookieHeader(cookieHeader);

    if (!currentUser) {
      throw new UnauthorizedException();
    }

    return currentUser;
  }

  private async handleInviteRequest<T>(handler: () => Promise<T>) {
    try {
      return await handler();
    } catch (error) {
      if (error instanceof WorkspaceValidationError) {
        throw new BadRequestException(error.message);
      }

      if (error instanceof WorkspaceInviteError) {
        if (
          error.code === "workspace_invite_not_found" ||
          error.code === "workspace_invite_token_invalid"
        ) {
          throw new NotFoundException(error.message);
        }

        if (error.code === "workspace_invite_email_mismatch") {
          throw new ForbiddenException(error.message);
        }

        throw new ConflictException(error.message);
      }

      throw error;
    }
  }
}
