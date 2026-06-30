import { Injectable, NotFoundException } from "@nestjs/common";
import { PullRequestAnalysisService } from "../analysis/pull-request-analysis.service";
import { PullRequestAnalysisRecord } from "../analysis/pull-request-analysis.types";
import { ChangedFilesService } from "../changes/changed-files.service";
import {
  CodeReviewRoomSummary,
  PullRequestSummaryRef,
} from "../room/code-review-room.types";
import { ReviewRoomService } from "../room/review-room.service";
import {
  PRAnalysisSummary,
  PRAnalysisSummarySource,
  ReviewAnalysisStatus,
  ReviewRiskLevel,
  toPRAnalysisSummary,
} from "./pr-analysis-summary.adapter";

const REVIEW_ANALYSIS_FIXTURE: PRAnalysisSummarySource = {
  id: "88888888-8888-4888-8888-888888888881",
  pullRequestId: "66666666-6666-4666-8666-666666666661",
  purposeSummary: "OAuth callback 화면 골격을 추가했다.",
  impactSummary: "Auth route와 session redirect flow에 영향이 있다.",
  testRecommendation:
    "성공/실패 redirect smoke test와 session 만료 케이스를 확인한다.",
  riskLevel: "medium",
  analysisStatus: "succeeded",
  okCount: 3,
  discussCount: 1,
  riskCount: 1,
  conclusion: "리뷰 후 merge 가능",
};

const REVIEW_ANALYSIS_SUMMARY_FIXTURE = toPRAnalysisSummary(
  REVIEW_ANALYSIS_FIXTURE,
);

type ReviewSummarySource = "runtime" | "fixture" | "missing";

export interface WorkspaceReviewPullRequestSummary {
  pullRequestId: string;
  repositoryId: string;
  number: number;
  title: string;
  authorLogin: string | null;
  state: PullRequestSummaryRef["state"];
  branch: string | null;
  baseBranch: string | null;
  url: string;
  linkedTaskIds: string[];
  changedFilesCount: number;
  analyzedChangedFilesCount: number;
  additions: number;
  deletions: number;
  roomId: string | null;
  reviewRoomStatus: CodeReviewRoomSummary["status"] | null;
  analysisId: string | null;
  analysisStatus: ReviewAnalysisStatus | null;
  riskLevel: ReviewRiskLevel | null;
  okCount: number;
  discussCount: number;
  riskCount: number;
  analysisSource: ReviewSummarySource;
}

export interface WorkspaceReviewSummary {
  workspaceId: string;
  reviewPendingPullRequestCount: number;
  totalChangedFilesCount: number;
  analyzedChangedFilesCount: number;
  totalRiskCount: number;
  runningAnalysisCount: number;
  failedAnalysisCount: number;
  highRiskPullRequestCount: number;
  pullRequests: WorkspaceReviewPullRequestSummary[];
  source: "review_runtime";
  warnings: string[];
  generatedAt: string;
}

const REVIEW_PENDING_PR_STATES = new Set<PullRequestSummaryRef["state"]>([
  "open",
  "review_requested",
  "changes_requested",
]);

@Injectable()
export class ReviewPublicService {
  private readonly analysisSummaries = new Map<string, PRAnalysisSummary>([
    [
      REVIEW_ANALYSIS_SUMMARY_FIXTURE.pullRequestId,
      REVIEW_ANALYSIS_SUMMARY_FIXTURE,
    ],
  ]);

  constructor(
    private readonly analysisService: PullRequestAnalysisService,
    private readonly changedFilesService: ChangedFilesService,
    private readonly reviewRoomService: ReviewRoomService,
  ) {}

  getAnalysisSummary(pullRequestId: string): PRAnalysisSummary {
    const runtimeAnalysis =
      this.analysisService.findAnalysisByPullRequestId(pullRequestId);
    const summary = runtimeAnalysis
      ? toPRAnalysisSummary(runtimeAnalysis)
      : this.analysisSummaries.get(pullRequestId);

    if (!summary) {
      throw new NotFoundException(
        `PR analysis summary was not found for pullRequestId=${pullRequestId}`,
      );
    }

    return summary;
  }

  getWorkspaceReviewSummary(workspaceId: string): WorkspaceReviewSummary {
    const pullRequests = this.reviewRoomService
      .listPullRequestsForWorkspace(workspaceId)
      .map((pullRequest) =>
        this.toWorkspacePullRequestSummary(pullRequest),
      );

    return {
      workspaceId,
      reviewPendingPullRequestCount: pullRequests.filter((pullRequest) =>
        REVIEW_PENDING_PR_STATES.has(pullRequest.state),
      ).length,
      totalChangedFilesCount: pullRequests.reduce(
        (total, pullRequest) => total + pullRequest.changedFilesCount,
        0,
      ),
      analyzedChangedFilesCount: pullRequests.reduce(
        (total, pullRequest) => total + pullRequest.analyzedChangedFilesCount,
        0,
      ),
      totalRiskCount: pullRequests.reduce(
        (total, pullRequest) => total + pullRequest.riskCount,
        0,
      ),
      runningAnalysisCount: pullRequests.filter(
        (pullRequest) => pullRequest.analysisStatus === "running",
      ).length,
      failedAnalysisCount: pullRequests.filter(
        (pullRequest) => pullRequest.analysisStatus === "failed",
      ).length,
      highRiskPullRequestCount: pullRequests.filter(
        (pullRequest) =>
          pullRequest.riskLevel === "high" ||
          pullRequest.riskLevel === "critical",
      ).length,
      pullRequests,
      source: "review_runtime",
      warnings: [
        "GitHub PR provider는 Deferred라 PullRequestSummary fixture/read model 경계만 사용합니다.",
      ],
      generatedAt: new Date().toISOString(),
    };
  }

  private toWorkspacePullRequestSummary(
    pullRequest: PullRequestSummaryRef,
  ): WorkspaceReviewPullRequestSummary {
    const room = this.reviewRoomService.findRoomForPullRequest(pullRequest.id);
    const runtimeAnalysis = this.analysisService.findAnalysisByPullRequestId(
      pullRequest.id,
    );
    const analysisSummary = this.resolveAnalysisSummary(
      pullRequest.id,
      runtimeAnalysis,
    );
    const analysisId = analysisSummary?.id ?? null;
    const changedFiles = analysisId
      ? this.changedFilesService.listChangedFiles(analysisId)
      : [];

    return {
      pullRequestId: pullRequest.id,
      repositoryId: pullRequest.repositoryId,
      number: pullRequest.number,
      title: pullRequest.title,
      authorLogin: pullRequest.authorLogin,
      state: pullRequest.state,
      branch: pullRequest.branch,
      baseBranch: pullRequest.baseBranch,
      url: pullRequest.url,
      linkedTaskIds: [...pullRequest.linkedTaskIds],
      changedFilesCount: pullRequest.changedFilesCount,
      analyzedChangedFilesCount: changedFiles.length,
      additions: pullRequest.additions,
      deletions: pullRequest.deletions,
      roomId: room?.id ?? null,
      reviewRoomStatus: room?.status ?? null,
      analysisId,
      analysisStatus: analysisSummary?.analysisStatus ?? null,
      riskLevel: analysisSummary?.riskLevel ?? null,
      okCount: analysisSummary?.okCount ?? 0,
      discussCount: analysisSummary?.discussCount ?? 0,
      riskCount: analysisSummary?.riskCount ?? 0,
      analysisSource: runtimeAnalysis
        ? "runtime"
        : analysisSummary
          ? "fixture"
          : "missing",
    };
  }

  private resolveAnalysisSummary(
    pullRequestId: string,
    runtimeAnalysis: PullRequestAnalysisRecord | null,
  ): PRAnalysisSummary | null {
    if (runtimeAnalysis) {
      return toPRAnalysisSummary(runtimeAnalysis);
    }

    return this.analysisSummaries.get(pullRequestId) ?? null;
  }
}
