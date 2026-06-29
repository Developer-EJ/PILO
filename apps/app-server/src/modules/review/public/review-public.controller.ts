import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { PRAnalysisSummary } from "./pr-analysis-summary.adapter";
import { ReviewPublicService } from "./review-public.service";

@Controller("pull-requests")
export class ReviewPublicController {
  constructor(private readonly reviewPublicService: ReviewPublicService) {}

  @Get(":pullRequestId/analysis-summary")
  getAnalysisSummary(
    @Param("pullRequestId", ParseUUIDPipe) pullRequestId: string,
  ): PRAnalysisSummary {
    return this.reviewPublicService.getAnalysisSummary(pullRequestId);
  }
}
