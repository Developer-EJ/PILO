import { Injectable } from "@nestjs/common";
import {
  CreatePullRequestAnalysisInput,
  PullRequestAnalysisRecord,
} from "./pull-request-analysis.types";
import { PullRequestAnalysisRepository } from "./pull-request-analysis.repository";

@Injectable()
export class InMemoryPullRequestAnalysisRepository
  implements PullRequestAnalysisRepository
{
  private readonly analysesById = new Map<string, PullRequestAnalysisRecord>();
  private readonly analysisIdsByPullRequestId = new Map<string, string>();

  findById(analysisId: string): PullRequestAnalysisRecord | null {
    return this.cloneNullable(this.analysesById.get(analysisId));
  }

  findByPullRequestId(pullRequestId: string): PullRequestAnalysisRecord | null {
    const analysisId = this.analysisIdsByPullRequestId.get(pullRequestId);
    return analysisId ? this.findById(analysisId) : null;
  }

  create(input: CreatePullRequestAnalysisInput): PullRequestAnalysisRecord {
    const existing = this.findByPullRequestId(input.pullRequestId);

    if (existing) {
      return existing;
    }

    const analysis: PullRequestAnalysisRecord = {
      id: input.id,
      pullRequestId: input.pullRequestId,
      purposeSummary: null,
      impactSummary: null,
      testRecommendation: null,
      riskLevel: "low",
      analysisStatus: "pending",
      okCount: 0,
      discussCount: 0,
      riskCount: 0,
      conclusion: null,
      errorTrace: [],
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };

    this.analysesById.set(analysis.id, analysis);
    this.analysisIdsByPullRequestId.set(analysis.pullRequestId, analysis.id);
    return this.clone(analysis);
  }

  save(analysis: PullRequestAnalysisRecord): PullRequestAnalysisRecord {
    this.analysesById.set(analysis.id, this.clone(analysis));
    this.analysisIdsByPullRequestId.set(analysis.pullRequestId, analysis.id);
    return this.clone(analysis);
  }

  private clone(
    analysis: PullRequestAnalysisRecord,
  ): PullRequestAnalysisRecord {
    return { ...analysis, errorTrace: [...analysis.errorTrace] };
  }

  private cloneNullable(
    analysis: PullRequestAnalysisRecord | null | undefined,
  ): PullRequestAnalysisRecord | null {
    return analysis ? this.clone(analysis) : null;
  }
}
