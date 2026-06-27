import { Injectable, NotFoundException } from "@nestjs/common";
import {
  PRAnalysisSummary,
  PRAnalysisSummarySource,
  toPRAnalysisSummary,
} from "./pr-analysis-summary.adapter";

const REVIEW_ANALYSIS_FIXTURE: PRAnalysisSummarySource = {
  id: "88888888-8888-4888-8888-888888888881",
  pullRequestId: "66666666-6666-4666-8666-666666666661",
  purposeSummary: "OAuth callback 화면 골격 추가",
  impactSummary: "Auth route와 session redirect flow에 영향",
  testRecommendation:
    "성공/실패 redirect smoke test와 session 만료 케이스를 확인한다.",
  riskLevel: "medium",
  analysisStatus: "succeeded",
  okCount: 3,
  discussCount: 1,
  riskCount: 1,
  conclusion: "리뷰 가능",
};

@Injectable()
export class ReviewPublicService {
  private readonly analysisSummaries = new Map<string, PRAnalysisSummarySource>(
    [
      [
        REVIEW_ANALYSIS_FIXTURE.pullRequestId as string,
        REVIEW_ANALYSIS_FIXTURE,
      ],
    ],
  );

  getAnalysisSummary(pullRequestId: string): PRAnalysisSummary {
    const source = this.analysisSummaries.get(pullRequestId);

    if (!source) {
      throw new NotFoundException(
        `PR analysis summary was not found for pullRequestId=${pullRequestId}`,
      );
    }

    return toPRAnalysisSummary(source);
  }
}
