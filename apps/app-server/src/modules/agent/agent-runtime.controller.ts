import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import { WorkspaceActor } from "../workspace/public/workspace-access-public.service";
import { AgentRuntimeService } from "./agent-runtime.service";
import {
  AgentRuntimeNotFoundError,
  AgentRuntimeValidationError,
} from "./agent-runtime.types";

@Controller()
export class AgentRuntimeController {
  constructor(private readonly service: AgentRuntimeService) {}

  @Post("workspaces/:workspaceId/agent-runs")
  createAgentRun(
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.handleRequest(() =>
      this.service.createRun({
        workspaceId,
        body: body ?? {},
      }),
    );
  }

  @Get("agent-runs/:runId")
  getAgentRun(@Param("runId") runId: string) {
    return this.handleRequest(() => this.service.getRun(runId));
  }

  @Get("workspaces/:workspaceId/agent-actions")
  listWorkspaceAgentActions(@Param("workspaceId") workspaceId: string) {
    return this.service.listWorkspaceActions(workspaceId);
  }

  @Post("agent-actions/:actionId/approve")
  approveAgentAction(
    @Param("actionId") actionId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.handleRequest(() =>
      this.service.approveAction({
        actionId,
        actor: toCurrentActor(userId, memberId),
      }),
    );
  }

  @Post("agent-actions/:actionId/reject")
  rejectAgentAction(
    @Param("actionId") actionId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.handleRequest(() =>
      this.service.rejectAction({
        actionId,
        actor: toCurrentActor(userId, memberId),
      }),
    );
  }

  private async handleRequest<T>(handler: () => T | Promise<T>): Promise<T> {
    try {
      return await handler();
    } catch (error) {
      if (error instanceof AgentRuntimeValidationError) {
        throw new BadRequestException(error.message);
      }

      if (error instanceof AgentRuntimeNotFoundError) {
        throw new NotFoundException(error.message);
      }

      throw error;
    }
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
