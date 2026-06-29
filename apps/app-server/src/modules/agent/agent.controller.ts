import { Controller, Get, Param, Query } from "@nestjs/common";
import { PaginationQuery } from "../../common/contracts/public-contracts";
import {
  ContractQuerySchema,
  ContractResponseSchema,
} from "../../common/validation/contract-validation.decorators";
import { AgentService } from "./agent.service";

@Controller("workspaces/:workspaceId/agent")
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get("actions")
  @ContractQuerySchema("PaginationQuery")
  @ContractResponseSchema("AgentActionPage")
  listAgentActions(
    @Param("workspaceId") workspaceId: string,
    @Query() pagination: PaginationQuery,
  ) {
    return this.agentService.listAgentActions(workspaceId, pagination);
  }
}
