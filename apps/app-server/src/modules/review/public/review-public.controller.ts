import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { PRAnalysisSummary } from "./pr-analysis-summary.adapter";
import {
  ReviewPublicService,
  WorkspaceReviewContext,
  WorkspaceReviewSummary,
} from "./review-public.service";

@Controller()
export class ReviewPublicController {
  constructor(private readonly reviewPublicService: ReviewPublicService) {}

  @Get("pull-requests/:pullRequestId/analysis-summary")
  getAnalysisSummary(
    @Param("pullRequestId", ParseUUIDPipe) pullRequestId: string,
  ): PRAnalysisSummary {
    return this.reviewPublicService.getAnalysisSummary(pullRequestId);
  }

  @Get("workspaces/:workspaceId/review-summary")
  getWorkspaceReviewSummary(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
  ): WorkspaceReviewSummary {
    return this.reviewPublicService.getWorkspaceReviewSummary(workspaceId);
  }

  @Get("workspaces/:workspaceId/review-context")
  getWorkspaceReviewContext(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
  ): WorkspaceReviewContext {
    return this.reviewPublicService.getWorkspaceReviewContext(workspaceId);
  }
}
