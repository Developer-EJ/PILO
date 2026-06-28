import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
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
  listWorkspaces(@Headers("cookie") cookieHeader: string | undefined) {
    return this.workspaceService.listWorkspaces({
      currentUser: this.requireCurrentUser(cookieHeader),
    });
  }

  @Post()
  createWorkspace(
    @Headers("cookie") cookieHeader: string | undefined,
    @Body() body: unknown,
  ) {
    return this.handleWorkspaceRequest(() =>
      this.workspaceService.createWorkspace({
        currentUser: this.requireCurrentUser(cookieHeader),
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

  @Get(":workspaceId")
  getWorkspace(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.handleWorkspaceRequest(() =>
      this.workspaceService.getWorkspace({
        currentUser: this.requireCurrentUser(cookieHeader),
        workspaceId,
      }),
    );
  }

  @Patch(":workspaceId")
  updateWorkspace(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.handleWorkspaceRequest(() =>
      this.workspaceService.updateWorkspace({
        currentUser: this.requireCurrentUser(cookieHeader),
        workspaceId,
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

      throw error;
    }
  }
}
