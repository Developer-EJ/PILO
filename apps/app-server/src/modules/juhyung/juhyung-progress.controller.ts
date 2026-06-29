import { Controller, Get, Headers, Param } from "@nestjs/common";
import { WorkspaceActor } from "../workspace/public/workspace-access-public.service";
import { JuhyungProgressService } from "./juhyung-progress.service";

@Controller("workspaces/:workspaceId/progress")
export class JuhyungProgressController {
  constructor(private readonly progressService: JuhyungProgressService) {}

  @Get("summary")
  getProgressSummary(
    @Param("workspaceId") workspaceId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.progressService.getProgressSummary(
      workspaceId,
      toCurrentActor(userId, memberId),
    );
  }

  @Get("history")
  listProgressHistory(
    @Param("workspaceId") workspaceId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.progressService.listProgressHistory(
      workspaceId,
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
