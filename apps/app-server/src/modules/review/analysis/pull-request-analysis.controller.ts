import { Controller, Get, Param, Post } from "@nestjs/common";
import { PullRequestAnalysisRecord } from "./pull-request-analysis.types";
import { PullRequestAnalysisService } from "./pull-request-analysis.service";

@Controller("pull-requests")
export class PullRequestAnalysisController {
  constructor(private readonly analysisService: PullRequestAnalysisService) {}

  @Post(":pullRequestId/analysis")
  requestAnalysis(
    @Param("pullRequestId") pullRequestId: string,
  ): PullRequestAnalysisRecord {
    return this.analysisService.requestAnalysis(pullRequestId);
  }

  @Get(":pullRequestId/analysis")
  getAnalysis(
    @Param("pullRequestId") pullRequestId: string,
  ): PullRequestAnalysisRecord {
    return this.analysisService.getAnalysis(pullRequestId);
  }
}
