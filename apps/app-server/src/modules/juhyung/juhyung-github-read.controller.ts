import { Controller, Get, Headers, Param } from "@nestjs/common";
import { WorkspaceActor } from "../workspace/public/workspace-access-public.service";
import { JuhyungGithubReadService } from "./juhyung-github-read.service";

@Controller()
export class JuhyungGithubReadController {
  constructor(private readonly githubReadService: JuhyungGithubReadService) {}

  @Get("workspaces/:workspaceId/github/repositories")
  listRepositories(
    @Param("workspaceId") workspaceId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.githubReadService.listRepositories(
      workspaceId,
      toCurrentActor(userId, memberId),
    );
  }

  @Get("repositories/:repositoryId/issues")
  listIssues(
    @Param("repositoryId") repositoryId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.githubReadService.listIssues(
      repositoryId,
      toCurrentActor(userId, memberId),
    );
  }

  @Get("repositories/:repositoryId/pull-requests")
  listPullRequests(
    @Param("repositoryId") repositoryId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.githubReadService.listPullRequests(
      repositoryId,
      toCurrentActor(userId, memberId),
    );
  }
}

function toCurrentActor(
  userId?: string | string[],
  memberId?: string | string[],
): WorkspaceActor {
  const resolvedUserId = firstHeader(userId);
  const resolvedMemberId = firstHeader(memberId);

  return {
    ...(resolvedUserId ? { userId: resolvedUserId } : {}),
    ...(resolvedMemberId ? { memberId: resolvedMemberId } : {}),
  };
}

function firstHeader(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
