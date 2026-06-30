import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { CurrentUserResponse } from "../auth/auth.service";
import { AuthService } from "../auth/auth.service";
import {
  WorkspaceMemberGuard,
  type WorkspaceMemberGuardRequest,
} from "./workspace-member.guard";
import {
  WorkspaceAccessError,
  WorkspaceInviteError,
  WorkspaceService,
  WorkspaceValidationError,
} from "./workspace.service";

@Controller("workspaces")
export class WorkspaceController {
  constructor(
    private readonly authService: AuthService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  @Get()
  listWorkspaces(
    @Headers("cookie") cookieHeader: string | undefined,
    @Headers("x-user-id") userIdHeader?: string | string[],
  ) {
    return this.workspaceService.listWorkspaces({
      currentUser: this.requireCurrentUser(cookieHeader, userIdHeader),
    });
  }

  @Post()
  createWorkspace(
    @Headers("cookie") cookieHeader: string | undefined,
    @Headers("x-user-id") userIdHeader: string | string[] | undefined,
    @Body() body: unknown,
  ) {
    return this.handleWorkspaceRequest(() =>
      this.workspaceService.createWorkspace({
        currentUser: this.requireCurrentUser(cookieHeader, userIdHeader),
        body,
      }),
    );
  }

  @Post(":workspaceId/invites")
  @UseGuards(WorkspaceMemberGuard)
  createWorkspaceInvite(
    @Param("workspaceId") workspaceId: string,
    @Req() request: WorkspaceMemberGuardRequest,
    @Body() body: unknown,
  ) {
    return this.handleWorkspaceRequest(() =>
      this.workspaceService.createWorkspaceInvite({
        currentUser: this.requireGuardCurrentUser(request),
        workspaceId,
        body,
      }),
    );
  }

  @Get(":workspaceId/members")
  @UseGuards(WorkspaceMemberGuard)
  listWorkspaceMembers(
    @Param("workspaceId") workspaceId: string,
    @Req() request: WorkspaceMemberGuardRequest,
  ) {
    return this.handleWorkspaceRequest(() =>
      this.workspaceService.listWorkspaceMembers({
        currentUser: this.requireGuardCurrentUser(request),
        workspaceId,
      }),
    );
  }

  @Get(":workspaceId/dashboard-preferences")
  @UseGuards(WorkspaceMemberGuard)
  getDashboardPreferences(
    @Param("workspaceId") workspaceId: string,
    @Req() request: WorkspaceMemberGuardRequest,
  ) {
    return this.handleWorkspaceRequest(() =>
      this.workspaceService.getDashboardPreferences({
        currentUser: this.requireGuardCurrentUser(request),
        workspaceId,
      }),
    );
  }

  @Put(":workspaceId/dashboard-preferences")
  @UseGuards(WorkspaceMemberGuard)
  updateDashboardPreferences(
    @Param("workspaceId") workspaceId: string,
    @Req() request: WorkspaceMemberGuardRequest,
    @Body() body: unknown,
  ) {
    return this.handleWorkspaceRequest(() =>
      this.workspaceService.updateDashboardPreferences({
        currentUser: this.requireGuardCurrentUser(request),
        workspaceId,
        body,
      }),
    );
  }

  @Get(":workspaceId/dashboard")
  @UseGuards(WorkspaceMemberGuard)
  getWorkspaceDashboard(
    @Param("workspaceId") workspaceId: string,
    @Req() request: WorkspaceMemberGuardRequest,
  ) {
    return this.handleWorkspaceRequest(() =>
      this.workspaceService.getWorkspaceDashboard({
        currentUser: this.requireGuardCurrentUser(request),
        workspaceId,
      }),
    );
  }

  @Get(":workspaceId")
  getWorkspace(
    @Headers("cookie") cookieHeader: string | undefined,
    @Headers("x-user-id") userIdHeader: string | string[] | undefined,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.handleWorkspaceRequest(() =>
      this.workspaceService.getWorkspace({
        currentUser: this.requireCurrentUser(cookieHeader, userIdHeader),
        workspaceId,
      }),
    );
  }

  @Patch(":workspaceId")
  updateWorkspace(
    @Headers("cookie") cookieHeader: string | undefined,
    @Headers("x-user-id") userIdHeader: string | string[] | undefined,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.handleWorkspaceRequest(() =>
      this.workspaceService.updateWorkspace({
        currentUser: this.requireCurrentUser(cookieHeader, userIdHeader),
        workspaceId,
        body,
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

  private requireGuardCurrentUser(
    request: WorkspaceMemberGuardRequest,
  ): CurrentUserResponse {
    if (!request.currentUser) {
      throw new UnauthorizedException();
    }

    return request.currentUser;
  }

  private async handleWorkspaceRequest<T>(handler: () => Promise<T>) {
    try {
      return await handler();
    } catch (error) {
      if (error instanceof WorkspaceValidationError) {
        throw new BadRequestException(error.message);
      }

      if (error instanceof WorkspaceAccessError) {
        if (error.code === "workspace_forbidden") {
          throw new ForbiddenException(error.message);
        }

        throw new NotFoundException(error.message);
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
