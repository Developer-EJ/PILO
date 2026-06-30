import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type { ReviewAnalysisStatus } from "../public";
import { ReviewGraphService } from "../graph/review-graph.service";
import { PullRequestSummaryRegistry } from "../room/pull-request-summary.registry";
import { InMemoryPullRequestAnalysisRepository } from "./in-memory-pull-request-analysis.repository";
import {
  CompletePullRequestAnalysisInput,
  PullRequestAnalysisRecord,
  ReviewAnalysisCompletedEvent,
  ReviewAnalysisRequestedEvent,
} from "./pull-request-analysis.types";

const ALLOWED_TRANSITIONS: Record<
  ReviewAnalysisStatus,
  ReviewAnalysisStatus[]
> = {
  pending: ["running"],
  running: ["succeeded", "failed"],
  succeeded: [],
  failed: [],
};
const FIXTURE_PULL_REQUEST_ID = "66666666-6666-4666-8666-666666666661";
const FIXTURE_ANALYSIS_ID = "88888888-8888-4888-8888-888888888881";

export interface PullRequestAnalysisServiceOptions {
  seedFixture?: boolean;
}

@Injectable()
export class PullRequestAnalysisService {
  constructor(
    private readonly analysisRepository: InMemoryPullRequestAnalysisRepository,
    @Optional()
    options: PullRequestAnalysisServiceOptions = {},
    private readonly pullRequestRegistry: PullRequestSummaryRegistry = new PullRequestSummaryRegistry(),
    @Optional()
    private readonly graphService?: ReviewGraphService,
  ) {
    if (options.seedFixture) {
      this.seedFixture();
    }
  }

  requestAnalysis(pullRequestId: string): PullRequestAnalysisRecord {
    this.assertKnownPullRequest(pullRequestId);

    const existing = this.analysisRepository.findByPullRequestId(pullRequestId);

    if (existing) {
      this.ensurePendingGraph(existing);
      return existing;
    }

    const created = this.analysisRepository.create({
      id: randomUUID(),
      pullRequestId,
      createdAt: new Date().toISOString(),
    });

    this.ensurePendingGraph(created);
    return created;
  }

  getAnalysis(pullRequestId: string): PullRequestAnalysisRecord {
    const analysis = this.analysisRepository.findByPullRequestId(pullRequestId);

    if (!analysis) {
      throw new NotFoundException(
        `Pull request analysis was not found: ${pullRequestId}`,
      );
    }

    return analysis;
  }

  transitionAnalysis(
    analysisId: string,
    nextStatus: ReviewAnalysisStatus,
    result: CompletePullRequestAnalysisInput = {},
  ): PullRequestAnalysisRecord {
    const analysis = this.analysisRepository.findById(analysisId);

    if (!analysis) {
      throw new NotFoundException(
        `Pull request analysis was not found: ${analysisId}`,
      );
    }

    if (!ALLOWED_TRANSITIONS[analysis.analysisStatus].includes(nextStatus)) {
      throw new BadRequestException(
        `Invalid review analysis transition: ${analysis.analysisStatus} -> ${nextStatus}`,
      );
    }

    const updated: PullRequestAnalysisRecord = {
      ...analysis,
      ...this.toResultPatch(nextStatus, result),
      analysisStatus: nextStatus,
      updatedAt: new Date().toISOString(),
    };

    return this.analysisRepository.save(updated);
  }

  toAnalysisRequestedEvent(
    analysis: PullRequestAnalysisRecord,
  ): ReviewAnalysisRequestedEvent {
    return {
      eventType: "review.analysis_requested",
      analysisId: analysis.id,
      pullRequestId: analysis.pullRequestId,
      occurredAt: analysis.createdAt,
    };
  }

  toAnalysisCompletedEvent(
    analysis: PullRequestAnalysisRecord,
  ): ReviewAnalysisCompletedEvent {
    if (
      analysis.analysisStatus !== "succeeded" &&
      analysis.analysisStatus !== "failed"
    ) {
      throw new BadRequestException(
        `Analysis is not completed: ${analysis.analysisStatus}`,
      );
    }

    return {
      eventType: "review.analysis_completed",
      analysisId: analysis.id,
      pullRequestId: analysis.pullRequestId,
      analysisStatus: analysis.analysisStatus,
      errorTrace: analysis.errorTrace,
      occurredAt: analysis.updatedAt,
    };
  }

  private assertKnownPullRequest(pullRequestId: string): void {
    if (!this.pullRequestRegistry.has(pullRequestId)) {
      throw new NotFoundException(
        `PullRequestSummary was not found: ${pullRequestId}`,
      );
    }
  }

  private ensurePendingGraph(analysis: PullRequestAnalysisRecord): void {
    if (analysis.analysisStatus !== "pending") {
      return;
    }

    this.graphService?.ensurePendingGraph(analysis.id);
  }

  private toResultPatch(
    nextStatus: ReviewAnalysisStatus,
    result: CompletePullRequestAnalysisInput,
  ): CompletePullRequestAnalysisInput {
    if (nextStatus === "running") {
      return {};
    }

    return {
      purposeSummary: result.purposeSummary ?? null,
      impactSummary: result.impactSummary ?? null,
      testRecommendation: result.testRecommendation ?? null,
      riskLevel: result.riskLevel ?? "low",
      okCount: this.countOrDefault("okCount", result.okCount),
      discussCount: this.countOrDefault("discussCount", result.discussCount),
      riskCount: this.countOrDefault("riskCount", result.riskCount),
      conclusion: result.conclusion ?? null,
      errorTrace: result.errorTrace ?? [],
    };
  }

  private countOrDefault(fieldName: string, value?: number): number {
    if (value === undefined) {
      return 0;
    }

    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException(
        `${fieldName} must be a non-negative integer`,
      );
    }

    return value;
  }

  private seedFixture(): void {
    this.analysisRepository.save({
      id: FIXTURE_ANALYSIS_ID,
      pullRequestId: FIXTURE_PULL_REQUEST_ID,
      purposeSummary: "Adds an OAuth callback route and visible result state.",
      impactSummary:
        "Touches auth routing, login redirects, and session recovery.",
      testRecommendation:
        "Smoke test provider success, provider error, and expired session redirects.",
      riskLevel: "medium",
      analysisStatus: "succeeded",
      okCount: 3,
      discussCount: 1,
      riskCount: 1,
      conclusion: "Ready after the failure redirect behavior is confirmed.",
      errorTrace: [],
      createdAt: "2026-06-27T10:00:00.000Z",
      updatedAt: "2026-06-27T10:00:00.000Z",
    });
  }
}
