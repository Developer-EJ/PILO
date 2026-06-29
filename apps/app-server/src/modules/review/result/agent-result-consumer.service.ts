import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InMemoryPullRequestAnalysisRepository } from "../analysis/in-memory-pull-request-analysis.repository";
import { PullRequestAnalysisRecord } from "../analysis/pull-request-analysis.types";
import {
  AgentResultApplicationRecord,
  AgentResultMessage,
  ReviewAnalysisGenerateOutput,
} from "./agent-result.types";

@Injectable()
export class AgentResultConsumerService {
  private readonly applicationsByResultKey = new Map<
    string,
    AgentResultApplicationRecord
  >();
  private readonly applicationKeysByJobId = new Map<string, string>();
  private readonly applicationKeysByRunId = new Map<string, string>();

  constructor(
    private readonly analysisRepository: InMemoryPullRequestAnalysisRepository,
  ) {}

  applyResult(message: AgentResultMessage): PullRequestAnalysisRecord {
    const resultKey = this.resultKey(message);
    const existingApplication = this.findExistingApplication(message);

    if (existingApplication) {
      const existingAnalysis = this.analysisRepository.findById(
        existingApplication.analysisId,
      );

      if (existingAnalysis) {
        return existingAnalysis;
      }
    }

    const analysis = this.findAnalysis(message);
    const appliedAt = message.finishedAt ?? new Date().toISOString();
    const updated =
      message.status === "failed"
        ? this.toFailedAnalysis(analysis, message, appliedAt)
        : this.toSucceededAnalysis(analysis, message.output ?? {}, appliedAt);

    this.applicationsByResultKey.set(resultKey, {
      jobId: message.jobId,
      runId: message.runId,
      analysisId: updated.id,
      analysisStatus: message.status,
      appliedAt,
    });
    this.applicationKeysByJobId.set(message.jobId, resultKey);
    this.applicationKeysByRunId.set(message.runId, resultKey);

    return this.analysisRepository.save(updated);
  }

  private findAnalysis(message: AgentResultMessage): PullRequestAnalysisRecord {
    const pullRequestId = message.output?.pullRequestId;

    if (!pullRequestId) {
      throw new BadRequestException(
        "Agent result output.pullRequestId is required",
      );
    }

    const analysis = this.analysisRepository.findByPullRequestId(pullRequestId);

    if (!analysis) {
      throw new NotFoundException(
        `Pull request analysis was not found: ${pullRequestId}`,
      );
    }

    return analysis;
  }

  private toSucceededAnalysis(
    analysis: PullRequestAnalysisRecord,
    output: ReviewAnalysisGenerateOutput,
    appliedAt: string,
  ): PullRequestAnalysisRecord {
    const counts = this.countNodeStatuses(output);

    return {
      ...analysis,
      purposeSummary: output.purposeSummary ?? null,
      impactSummary: output.impactSummary ?? null,
      testRecommendation: output.testRecommendation ?? null,
      riskLevel: output.riskLevel ?? "low",
      analysisStatus: "succeeded",
      okCount: counts.okCount,
      discussCount: counts.discussCount,
      riskCount: output.risks?.length ?? counts.riskCount,
      conclusion: output.conclusion ?? "리뷰 후 merge 가능",
      errorTrace: [],
      updatedAt: appliedAt,
    };
  }

  private toFailedAnalysis(
    analysis: PullRequestAnalysisRecord,
    message: AgentResultMessage,
    appliedAt: string,
  ): PullRequestAnalysisRecord {
    const errorMessage = message.error?.message ?? "Agent result failed";
    const errorCode = message.error?.code ? `[${message.error.code}] ` : "";

    return {
      ...analysis,
      analysisStatus: "failed",
      errorTrace: [`${errorCode}${errorMessage}`],
      updatedAt: appliedAt,
    };
  }

  private countNodeStatuses(output: ReviewAnalysisGenerateOutput): {
    okCount: number;
    discussCount: number;
    riskCount: number;
  } {
    const nodes = output.graph?.nodes ?? [];

    return {
      okCount: nodes.filter((node) => node.status === "ok").length,
      discussCount: nodes.filter((node) => node.status === "discuss").length,
      riskCount: nodes.filter(
        (node) => node.riskLevel && node.riskLevel !== "low",
      ).length,
    };
  }

  private resultKey(message: AgentResultMessage): string {
    return `${message.jobId}:${message.runId}`;
  }

  private findExistingApplication(
    message: AgentResultMessage,
  ): AgentResultApplicationRecord | null {
    const resultKey =
      this.applicationKeysByRunId.get(message.runId) ??
      this.applicationKeysByJobId.get(message.jobId) ??
      this.resultKey(message);

    return this.applicationsByResultKey.get(resultKey) ?? null;
  }
}
