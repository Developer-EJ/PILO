import { Controller, Get, Param, Query } from "@nestjs/common";
import { PaginationQuery } from "../../common/contracts/public-contracts";
import {
  ContractQuerySchema,
  ContractResponseSchema,
} from "../../common/validation/contract-validation.decorators";
import { PlanningService } from "./planning.service";

@Controller("workspaces/:workspaceId/planning")
export class PlanningController {
  constructor(private readonly planningService: PlanningService) {}

  @Get("drafts")
  @ContractQuerySchema("PaginationQuery")
  @ContractResponseSchema("ProjectPlanDraftSummaryPage")
  listPlanningDrafts(
    @Param("workspaceId") workspaceId: string,
    @Query() pagination: PaginationQuery,
  ) {
    return this.planningService.listPlanningDrafts(workspaceId, pagination);
  }
}
