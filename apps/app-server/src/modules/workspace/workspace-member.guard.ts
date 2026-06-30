import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { CurrentUserResponse } from "../auth/auth.service";
import { AuthService } from "../auth/auth.service";
import { WorkspaceCurrentMemberAdapter } from "./workspace-current-member.adapter";
import {
  WorkspaceAccessError,
  type WorkspaceCurrentMemberContext,
} from "./workspace.service";

export type WorkspaceMemberGuardRequest = {
  headers: {
    cookie?: string | string[];
    "x-user-id"?: string | string[];
  };
  params?: {
    workspaceId?: string;
  };
  currentUser?: CurrentUserResponse;
  currentMember?: WorkspaceCurrentMemberContext["currentMember"];
  workspaceAccess?: WorkspaceCurrentMemberContext;
};

@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly currentMemberAdapter: WorkspaceCurrentMemberAdapter,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<WorkspaceMemberGuardRequest>();
    const workspaceId = request.params?.workspaceId;

    if (!workspaceId) {
      throw new BadRequestException("workspaceId is required.");
    }

    const currentUser = this.authService.getCurrentUserFromCookieOrLocalHeader(
      normalizeCookieHeader(request.headers.cookie),
      request.headers["x-user-id"],
    );

    if (!currentUser) {
      throw new UnauthorizedException();
    }

    try {
      const workspaceAccess =
        await this.currentMemberAdapter.requireCurrentMember({
          workspaceId,
          currentUser,
        });

      request.currentUser = currentUser;
      request.currentMember = workspaceAccess.currentMember;
      request.workspaceAccess = workspaceAccess;

      return true;
    } catch (error) {
      if (error instanceof WorkspaceAccessError) {
        throw new NotFoundException(error.message);
      }

      throw error;
    }
  }
}

function normalizeCookieHeader(cookieHeader: string | string[] | undefined) {
  if (Array.isArray(cookieHeader)) {
    return cookieHeader.join("; ");
  }

  return cookieHeader;
}
