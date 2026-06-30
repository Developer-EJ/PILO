import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { WorkspaceCurrentMemberAdapter } from "../workspace/workspace-current-member.adapter";
import { WorkspaceAccessError } from "../workspace/workspace.service";
import { MeetingService } from "./meeting.service";

type HeaderValue = string | string[] | undefined;

type MeetingRouteGuardRequest = {
  headers: {
    cookie?: HeaderValue;
    "x-user-id"?: HeaderValue;
  };
  params?: {
    workspaceId?: string;
    meetingId?: string;
    reportId?: string;
    actionItemId?: string;
  };
};

@Injectable()
export class MeetingRouteGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly currentMemberAdapter: WorkspaceCurrentMemberAdapter,
    private readonly meetingService: MeetingService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<MeetingRouteGuardRequest>();
    const params = request.params ?? {};
    const workspaceId = await this.meetingService.resolveRouteWorkspaceId({
      workspaceId: params.workspaceId,
      meetingId: params.meetingId,
      reportId: params.reportId,
      actionItemId: params.actionItemId,
    });
    const currentUser = this.authService.getCurrentUserFromCookieOrLocalHeader(
      normalizeCookieHeader(request.headers.cookie),
      request.headers["x-user-id"],
    );

    if (!currentUser) {
      throw new UnauthorizedException();
    }

    try {
      await this.currentMemberAdapter.requireCurrentMember({
        workspaceId,
        currentUser,
      });

      return true;
    } catch (error) {
      if (error instanceof WorkspaceAccessError) {
        throw new NotFoundException(error.message);
      }

      throw error;
    }
  }
}

function normalizeCookieHeader(cookieHeader: HeaderValue) {
  if (Array.isArray(cookieHeader)) {
    return cookieHeader.join("; ");
  }

  return cookieHeader;
}
