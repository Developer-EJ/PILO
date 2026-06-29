import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
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
  approveAgentAction(@Param("actionId") actionId: string) {
    return this.handleRequest(() => this.service.approveAction({ actionId }));
  }

  @Post("agent-actions/:actionId/reject")
  rejectAgentAction(@Param("actionId") actionId: string) {
    return this.handleRequest(() => this.service.rejectAction({ actionId }));
  }

  private handleRequest<T>(handler: () => T) {
    try {
      return handler();
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
