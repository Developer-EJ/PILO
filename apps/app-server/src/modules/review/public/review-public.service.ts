import { Injectable } from "@nestjs/common";
import { PullRequestAnalysisService } from "../analysis/pull-request-analysis.service";
import {
  PRAnalysisSummary,
  toPRAnalysisSummary,
} from "./pr-analysis-summary.adapter";

@Injectable()
export class ReviewPublicService {
  constructor(private readonly analysisService: PullRequestAnalysisService) {}

  async getAnalysisSummary(pullRequestId: string): Promise<PRAnalysisSummary> {
    return toPRAnalysisSummary(
      await this.analysisService.getAnalysis(pullRequestId),
    );
  }
}
