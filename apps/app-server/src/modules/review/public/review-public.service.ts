import { Injectable, NotFoundException } from "@nestjs/common";
import { PullRequestAnalysisService } from "../analysis/pull-request-analysis.service";
import { PullRequestAnalysisRecord } from "../analysis/pull-request-analysis.types";
import { ChangedFileWithFunctions } from "../changes/changed-file.types";
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

type ReviewContextSignalType =
  | "large_change_file"
  | "analysis_risk"
  | "analysis_attention";

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

export interface WorkspaceReviewContextHighlights {
  pendingReviewCount: number;
  riskyPullRequestCount: number;
  runningAnalysisCount: number;
  failedAnalysisCount: number;
  changedFileSignalCount: number;
  totalRiskCount: number;
}

export interface WorkspaceReviewContextPullRequest {
  pullRequestId: string;
  number: number;
  title: string;
  authorLogin: string | null;
  state: PullRequestSummaryRef["state"];
  branch: string | null;
  baseBranch: string | null;
  url: string;
  roomId: string | null;
  analysisId: string | null;
  analysisStatus: ReviewAnalysisStatus | null;
  riskLevel: ReviewRiskLevel | null;
  changedFilesCount: number;
  additions: number;
  deletions: number;
  riskCount: number;
  discussCount: number;
  purposeSummary: string | null;
  impactSummary: string | null;
  testRecommendation: string | null;
  conclusion: string | null;
  source: ReviewSummarySource;
}

export interface WorkspaceReviewContextAnalysisStatus {
  pullRequestId: string;
  number: number;
  title: string;
  analysisId: string | null;
  analysisStatus: ReviewAnalysisStatus | null;
  riskLevel: ReviewRiskLevel | null;
  riskCount: number;
  source: ReviewSummarySource;
}

export interface WorkspaceReviewContextChangedFileSignal {
  type: ReviewContextSignalType;
  severity: ReviewRiskLevel;
  pullRequestId: string;
  number: number;
  title: string;
  analysisId: string;
  filePath: string;
  changeType: ChangedFileWithFunctions["changeType"];
  additions: number;
  deletions: number;
  touchedLines: number;
  summary: string | null;
  functionNames: string[];
  reason: string;
}

export interface WorkspaceReviewContext {
  workspaceId: string;
  summaryText: string;
  highlights: WorkspaceReviewContextHighlights;
  pendingPullRequests: WorkspaceReviewContextPullRequest[];
  riskyPullRequests: WorkspaceReviewContextPullRequest[];
  analysisStatuses: WorkspaceReviewContextAnalysisStatus[];
  changedFileSignals: WorkspaceReviewContextChangedFileSignal[];
  source: "review_runtime";
  warnings: string[];
  generatedAt: string;
}

const REVIEW_PENDING_PR_STATES = new Set<PullRequestSummaryRef["state"]>([
  "open",
  "review_requested",
  "changes_requested",
]);
const REVIEW_CONTEXT_RISK_LEVELS = new Set<ReviewRiskLevel>([
  "medium",
  "high",
  "critical",
]);
const REVIEW_CONTEXT_HIGH_RISK_LEVELS = new Set<ReviewRiskLevel>([
  "high",
  "critical",
]);
const LARGE_CHANGED_FILE_TOUCHED_LINES = 40;
const MAX_CONTEXT_ITEMS = 5;

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
      .map((pullRequest) => this.toWorkspacePullRequestSummary(pullRequest));

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

  getWorkspaceReviewContext(workspaceId: string): WorkspaceReviewContext {
    const summary = this.getWorkspaceReviewSummary(workspaceId);
    const pendingPullRequests = summary.pullRequests
      .filter((pullRequest) => REVIEW_PENDING_PR_STATES.has(pullRequest.state))
      .map((pullRequest) => this.toContextPullRequest(pullRequest))
      .slice(0, MAX_CONTEXT_ITEMS);
    const riskyPullRequestSummaries = summary.pullRequests.filter(
      (pullRequest) => this.isRiskyPullRequest(pullRequest),
    );
    const riskyPullRequests = riskyPullRequestSummaries
      .map((pullRequest) => this.toContextPullRequest(pullRequest))
      .slice(0, MAX_CONTEXT_ITEMS);
    const allChangedFileSignals = this.toChangedFileSignals(
      summary.pullRequests,
    );
    const changedFileSignals = allChangedFileSignals.slice(
      0,
      MAX_CONTEXT_ITEMS,
    );
    const analysisStatuses = summary.pullRequests.map((pullRequest) => ({
      pullRequestId: pullRequest.pullRequestId,
      number: pullRequest.number,
      title: pullRequest.title,
      analysisId: pullRequest.analysisId,
      analysisStatus: pullRequest.analysisStatus,
      riskLevel: pullRequest.riskLevel,
      riskCount: pullRequest.riskCount,
      source: pullRequest.analysisSource,
    }));
    const highlights: WorkspaceReviewContextHighlights = {
      pendingReviewCount: summary.reviewPendingPullRequestCount,
      riskyPullRequestCount: riskyPullRequestSummaries.length,
      runningAnalysisCount: summary.runningAnalysisCount,
      failedAnalysisCount: summary.failedAnalysisCount,
      changedFileSignalCount: allChangedFileSignals.length,
      totalRiskCount: summary.totalRiskCount,
    };

    return {
      workspaceId,
      summaryText: this.toContextSummaryText(highlights),
      highlights,
      pendingPullRequests,
      riskyPullRequests,
      analysisStatuses,
      changedFileSignals,
      source: "review_runtime",
      warnings: [
        ...summary.warnings,
        "현재 Review context는 workspaceId 기준입니다. 로그인 사용자별 리뷰 요청 여부는 GitHub/Workspace member 계약이 연결된 뒤 판별할 수 있습니다.",
      ],
      generatedAt: summary.generatedAt,
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

  private toContextPullRequest(
    pullRequest: WorkspaceReviewPullRequestSummary,
  ): WorkspaceReviewContextPullRequest {
    const runtimeAnalysis = this.analysisService.findAnalysisByPullRequestId(
      pullRequest.pullRequestId,
    );
    const analysisSummary = this.resolveAnalysisSummary(
      pullRequest.pullRequestId,
      runtimeAnalysis,
    );

    return {
      pullRequestId: pullRequest.pullRequestId,
      number: pullRequest.number,
      title: pullRequest.title,
      authorLogin: pullRequest.authorLogin,
      state: pullRequest.state,
      branch: pullRequest.branch,
      baseBranch: pullRequest.baseBranch,
      url: pullRequest.url,
      roomId: pullRequest.roomId,
      analysisId: pullRequest.analysisId,
      analysisStatus: pullRequest.analysisStatus,
      riskLevel: pullRequest.riskLevel,
      changedFilesCount: pullRequest.changedFilesCount,
      additions: pullRequest.additions,
      deletions: pullRequest.deletions,
      riskCount: pullRequest.riskCount,
      discussCount: pullRequest.discussCount,
      purposeSummary: analysisSummary?.purposeSummary ?? null,
      impactSummary: analysisSummary?.impactSummary ?? null,
      testRecommendation: analysisSummary?.testRecommendation ?? null,
      conclusion: analysisSummary?.conclusion ?? null,
      source: pullRequest.analysisSource,
    };
  }

  private isRiskyPullRequest(
    pullRequest: WorkspaceReviewPullRequestSummary,
  ): boolean {
    return (
      Boolean(
        pullRequest.riskLevel &&
          REVIEW_CONTEXT_RISK_LEVELS.has(pullRequest.riskLevel),
      ) ||
      pullRequest.riskCount > 0 ||
      pullRequest.discussCount > 0 ||
      pullRequest.analysisStatus === "failed"
    );
  }

  private toChangedFileSignals(
    pullRequests: WorkspaceReviewPullRequestSummary[],
  ): WorkspaceReviewContextChangedFileSignal[] {
    return pullRequests
      .flatMap((pullRequest) => {
        if (!pullRequest.analysisId) {
          return [];
        }

        return this.changedFilesService
          .listChangedFiles(pullRequest.analysisId)
          .map((changedFile) =>
            this.toChangedFileSignal(pullRequest, changedFile),
          )
          .filter(
            (signal): signal is WorkspaceReviewContextChangedFileSignal =>
              signal !== null,
          );
      })
      .sort(
        (left, right) =>
          this.riskWeight(right.severity) - this.riskWeight(left.severity) ||
          right.touchedLines - left.touchedLines ||
          left.filePath.localeCompare(right.filePath),
      );
  }

  private toChangedFileSignal(
    pullRequest: WorkspaceReviewPullRequestSummary,
    changedFile: ChangedFileWithFunctions,
  ): WorkspaceReviewContextChangedFileSignal | null {
    const touchedLines = changedFile.additions + changedFile.deletions;
    const reasons = [
      touchedLines >= LARGE_CHANGED_FILE_TOUCHED_LINES
        ? `변경량 ${touchedLines}줄`
        : null,
      pullRequest.riskCount > 0
        ? `PR 분석 리스크 ${pullRequest.riskCount}건`
        : null,
      pullRequest.riskLevel &&
      REVIEW_CONTEXT_RISK_LEVELS.has(pullRequest.riskLevel)
        ? `PR 위험도 ${pullRequest.riskLevel}`
        : null,
      pullRequest.analysisStatus === "failed" ? "분석 실패" : null,
    ].filter((reason): reason is string => Boolean(reason));

    if (reasons.length === 0 || !pullRequest.analysisId) {
      return null;
    }

    return {
      type: this.toSignalType(pullRequest, touchedLines),
      severity: this.toSignalSeverity(pullRequest.riskLevel, touchedLines),
      pullRequestId: pullRequest.pullRequestId,
      number: pullRequest.number,
      title: pullRequest.title,
      analysisId: pullRequest.analysisId,
      filePath: changedFile.filePath,
      changeType: changedFile.changeType,
      additions: changedFile.additions,
      deletions: changedFile.deletions,
      touchedLines,
      summary: changedFile.summary,
      functionNames: changedFile.functions.map((func) => func.name),
      reason: reasons.join(", "),
    };
  }

  private toSignalType(
    pullRequest: WorkspaceReviewPullRequestSummary,
    touchedLines: number,
  ): ReviewContextSignalType {
    if (touchedLines >= LARGE_CHANGED_FILE_TOUCHED_LINES) {
      return "large_change_file";
    }

    if (pullRequest.riskCount > 0) {
      return "analysis_risk";
    }

    return "analysis_attention";
  }

  private toSignalSeverity(
    riskLevel: ReviewRiskLevel | null,
    touchedLines: number,
  ): ReviewRiskLevel {
    if (riskLevel && REVIEW_CONTEXT_HIGH_RISK_LEVELS.has(riskLevel)) {
      return riskLevel;
    }

    if (touchedLines >= 200) {
      return "high";
    }

    if (
      riskLevel === "medium" ||
      touchedLines >= LARGE_CHANGED_FILE_TOUCHED_LINES
    ) {
      return "medium";
    }

    return "low";
  }

  private riskWeight(riskLevel: ReviewRiskLevel): number {
    return {
      low: 0,
      medium: 1,
      high: 2,
      critical: 3,
    }[riskLevel];
  }

  private toContextSummaryText(
    highlights: WorkspaceReviewContextHighlights,
  ): string {
    return [
      `리뷰 대기 PR ${highlights.pendingReviewCount}건`,
      `위험 신호 PR ${highlights.riskyPullRequestCount}건`,
      `변경 파일 신호 ${highlights.changedFileSignalCount}건`,
      `전체 리스크 ${highlights.totalRiskCount}건`,
      `실행 중 분석 ${highlights.runningAnalysisCount}건`,
      `실패한 분석 ${highlights.failedAnalysisCount}건`,
    ].join(", ");
  }
}
