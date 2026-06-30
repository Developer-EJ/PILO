import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { WorkspaceActor } from "../workspace/public/workspace-access-public.service";
import {
  firstHeader,
  parseAgentOnboardingTurnBody,
  parseAgentChatMessageBody,
  parseAgentRunCreateBody,
  parseProjectPlanCreateBody,
} from "./agent-runtime.input";
import { AgentRuntimeService } from "./agent-runtime.service";

@Controller()
export class AgentRuntimeController {
  constructor(
    private readonly agentRuntimeService: AgentRuntimeService,
    private readonly authService: AuthService,
  ) {}

  @Post("agent-onboarding/turn")
  runOnboardingTurn(@Body() body: unknown) {
    return this.agentRuntimeService.runOnboardingTurn(
      parseAgentOnboardingTurnBody(body),
    );
  }

  @Post("workspaces/:workspaceId/agent-runs")
  createAgentRun(
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
    @Headers("cookie") cookieHeader?: string | string[],
  ) {
    return this.agentRuntimeService.createAgentRun(
      workspaceId,
      parseAgentRunCreateBody(body),
      this.toCurrentActor(userId, memberId, cookieHeader),
    );
  }

  @Get("agent-runs/:runId")
  getAgentRun(
    @Param("runId") runId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
    @Headers("cookie") cookieHeader?: string | string[],
  ) {
    return this.agentRuntimeService.getAgentRun(
      runId,
      this.toCurrentActor(userId, memberId, cookieHeader),
    );
  }

  @Post("agent-actions/:actionId/approve")
  approveAgentAction(
    @Param("actionId") actionId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
    @Headers("cookie") cookieHeader?: string | string[],
  ) {
    return this.agentRuntimeService.approveAction(
      actionId,
      this.toCurrentActor(userId, memberId, cookieHeader),
    );
  }

  @Post("agent-actions/:actionId/reject")
  rejectAgentAction(
    @Param("actionId") actionId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
    @Headers("cookie") cookieHeader?: string | string[],
  ) {
    return this.agentRuntimeService.rejectAction(
      actionId,
      this.toCurrentActor(userId, memberId, cookieHeader),
    );
  }

  @Get("workspaces/:workspaceId/agent-chat/messages")
  listAgentChatMessages(
    @Param("workspaceId") workspaceId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
    @Headers("cookie") cookieHeader?: string | string[],
  ) {
    return this.agentRuntimeService.listChatMessages(
      workspaceId,
      this.toCurrentActor(userId, memberId, cookieHeader),
    );
  }

  @Post("workspaces/:workspaceId/agent-chat/messages")
  sendAgentChatMessage(
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
    @Headers("cookie") cookieHeader?: string | string[],
  ) {
    return this.agentRuntimeService.sendChatMessage(
      workspaceId,
      parseAgentChatMessageBody(body),
      this.toCurrentActor(userId, memberId, cookieHeader),
    );
  }

  @Get("workspaces/:workspaceId/agent-recommendations")
  listAgentRecommendations(
    @Param("workspaceId") workspaceId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
    @Headers("cookie") cookieHeader?: string | string[],
  ) {
    return this.agentRuntimeService.listRecommendations(
      workspaceId,
      this.toCurrentActor(userId, memberId, cookieHeader),
    );
  }

  @Post("workspaces/:workspaceId/project-plan-drafts")
  createProjectPlanDraft(
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
    @Headers("cookie") cookieHeader?: string | string[],
  ) {
    return this.agentRuntimeService.createProjectPlanDraft(
      workspaceId,
      parseProjectPlanCreateBody(body),
      this.toCurrentActor(userId, memberId, cookieHeader),
    );
  }

  @Get("project-plan-drafts/:draftId")
  getProjectPlanDraft(
    @Param("draftId") draftId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
    @Headers("cookie") cookieHeader?: string | string[],
  ) {
    return this.agentRuntimeService.getProjectPlanDraft(
      draftId,
      this.toCurrentActor(userId, memberId, cookieHeader),
    );
  }

  @Post("project-plan-drafts/:draftId/recommend-tech-stack")
  recommendTechStack(
    @Param("draftId") draftId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
    @Headers("cookie") cookieHeader?: string | string[],
  ) {
    return this.agentRuntimeService.recommendTechStack(
      draftId,
      this.toCurrentActor(userId, memberId, cookieHeader),
    );
  }

  @Post("project-plan-drafts/:draftId/breakdown-features")
  breakdownFeatures(
    @Param("draftId") draftId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
    @Headers("cookie") cookieHeader?: string | string[],
  ) {
    return this.agentRuntimeService.breakdownFeatures(
      draftId,
      this.toCurrentActor(userId, memberId, cookieHeader),
    );
  }

  @Post("project-plan-drafts/:draftId/assign-roles")
  assignRoles(
    @Param("draftId") draftId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
    @Headers("cookie") cookieHeader?: string | string[],
  ) {
    return this.agentRuntimeService.assignRoles(
      draftId,
      this.toCurrentActor(userId, memberId, cookieHeader),
    );
  }

  @Post("project-plan-drafts/:draftId/approve")
  approveProjectPlanDraft(
    @Param("draftId") draftId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
    @Headers("cookie") cookieHeader?: string | string[],
  ) {
    return this.agentRuntimeService.approveProjectPlanDraft(
      draftId,
      this.toCurrentActor(userId, memberId, cookieHeader),
    );
  }

  private toCurrentActor(
    userId?: string | string[],
    memberId?: string | string[],
    cookieHeader?: string | string[],
  ): WorkspaceActor {
    const headerActor = toCurrentActor(userId, memberId);
    if (headerActor.userId || headerActor.memberId) {
      return headerActor;
    }

    const currentUser = this.authService.getCurrentUserFromCookieHeader(
      normalizeCookieHeader(cookieHeader),
    );

    return currentUser ? { userId: currentUser.id } : {};
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

function normalizeCookieHeader(cookieHeader: string | string[] | undefined) {
  return Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
}
