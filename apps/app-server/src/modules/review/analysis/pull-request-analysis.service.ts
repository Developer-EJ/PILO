import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ReviewAnalysisStatus } from "../public";
import { REVIEW_ROOM_PULL_REQUEST_FIXTURES } from "../room/review-room.fixtures";
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

@Injectable()
export class PullRequestAnalysisService {
  private readonly pullRequestSummaries: ReadonlyMap<string, unknown> =
    REVIEW_ROOM_PULL_REQUEST_FIXTURES;

  constructor(
    private readonly analysisRepository: InMemoryPullRequestAnalysisRepository,
  ) {}

  requestAnalysis(pullRequestId: string): PullRequestAnalysisRecord {
    this.assertKnownPullRequest(pullRequestId);

    const existing = this.analysisRepository.findByPullRequestId(pullRequestId);

    if (existing) {
      return existing;
    }

    return this.analysisRepository.create({
      id: randomUUID(),
      pullRequestId,
      createdAt: new Date().toISOString(),
    });
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

  findAnalysisByPullRequestId(
    pullRequestId: string,
  ): PullRequestAnalysisRecord | null {
    return this.analysisRepository.findByPullRequestId(pullRequestId);
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
    if (!this.pullRequestSummaries.has(pullRequestId)) {
      throw new NotFoundException(
        `PullRequestSummary fixture was not found: ${pullRequestId}`,
      );
    }
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
}
