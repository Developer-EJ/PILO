import { Controller, Headers, Param, Post, Req } from "@nestjs/common";
import { WorkspaceActor } from "../workspace/public/workspace-access-public.service";
import { JuhyungGithubSyncService } from "./juhyung-github-sync.service";

type HeaderValue = string | string[] | undefined;

interface AuthenticatedRequestContext {
  auth?: {
    actor?: WorkspaceActor;
  };
}

@Controller("workspaces/:workspaceId/github/repositories")
export class JuhyungGithubSyncController {
  constructor(private readonly githubSyncService: JuhyungGithubSyncService) {}

  @Post("sync")
  syncRepositories(
    @Param("workspaceId") workspaceId: string,
    @Headers("x-user-id") userId?: HeaderValue,
    @Headers("x-member-id") memberId?: HeaderValue,
    @Req() request: AuthenticatedRequestContext = {},
  ) {
    return this.githubSyncService.syncRepositories(
      workspaceId,
      this.actorFromRequest(request, userId, memberId),
    );
  }

  private actorFromRequest(
    request: AuthenticatedRequestContext,
    userId?: HeaderValue,
    memberId?: HeaderValue,
  ): WorkspaceActor | undefined {
    const authActor = request.auth?.actor;

    if (authActor) {
      return authActor;
    }

    const resolvedUserId = this.firstValue(userId);
    const resolvedMemberId = this.firstValue(memberId);

    if (!resolvedUserId && !resolvedMemberId) {
      return undefined;
    }

    return {
      ...(resolvedUserId ? { userId: resolvedUserId } : {}),
      ...(resolvedMemberId ? { memberId: resolvedMemberId } : {}),
    };
  }

  private firstValue(value?: HeaderValue) {
    return Array.isArray(value) ? value[0] : value;
  }
}
