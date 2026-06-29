import { Controller, Get, Param } from "@nestjs/common";
import { ContractResponseSchema } from "../../common/validation/contract-validation.decorators";
import { ReviewService } from "./review.service";

@Controller("workspaces/:workspaceId/review")
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get("pr-analyses/summary")
  @ContractResponseSchema({ schemaName: "PRAnalysisSummary", isArray: true })
  listPrAnalysisSummaries(@Param("workspaceId") workspaceId: string) {
    return this.reviewService.listPrAnalysisSummaries(workspaceId);
  }
}
