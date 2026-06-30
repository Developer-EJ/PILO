import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { PullRequestAnalysisRepository } from "../analysis/pull-request-analysis.repository";
import { PullRequestAnalysisRecord } from "../analysis/pull-request-analysis.types";
import { AgentChangedFilesResultService } from "./agent-changed-files-result.service";
import { AgentGraphResultService } from "./agent-graph-result.service";
import { AgentReviewArtifactsResultService } from "./agent-review-artifacts-result.service";
import {
  AgentResultApplicationRecord,
  AgentResultMessage,
  ReviewAnalysisGenerateOutput,
  ReviewAnalysisGenerateGraphOutput,
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
    private readonly analysisRepository: PullRequestAnalysisRepository,
    @Optional()
    private readonly graphResultService?: AgentGraphResultService,
    @Optional()
    private readonly changedFilesResultService?: AgentChangedFilesResultService,
    @Optional()
    private readonly artifactsResultService?: AgentReviewArtifactsResultService,
  ) {}

  async applyResult(
    message: AgentResultMessage,
  ): Promise<PullRequestAnalysisRecord> {
    const resultKey = this.resultKey(message);
    const existingApplication = this.findExistingApplication(message);

    if (existingApplication) {
      const existingAnalysis = await this.analysisRepository.findById(
        existingApplication.analysisId,
      );

      if (existingAnalysis) {
        return existingAnalysis;
      }
    }

    const analysis = await this.findAnalysis(message);
    const appliedAt = message.finishedAt ?? new Date().toISOString();
    const updated =
      message.status === "failed"
        ? this.toFailedAnalysis(analysis, message, appliedAt)
        : this.toSucceededAnalysis(analysis, message.output ?? {}, appliedAt);

    if (message.status === "succeeded") {
      this.applySecondaryOutputs(updated.id, message.output ?? {});
    }

    const saved = await this.analysisRepository.save(updated);

    this.applicationsByResultKey.set(resultKey, {
      jobId: message.jobId,
      runId: message.runId,
      analysisId: saved.id,
      analysisStatus: message.status,
      appliedAt,
    });
    this.applicationKeysByJobId.set(message.jobId, resultKey);
    this.applicationKeysByRunId.set(message.runId, resultKey);

    return saved;
  }

  private async findAnalysis(
    message: AgentResultMessage,
  ): Promise<PullRequestAnalysisRecord> {
    const pullRequestId = message.output?.pullRequestId;

    if (!pullRequestId) {
      throw new BadRequestException(
        "Agent result output.pullRequestId is required",
      );
    }

    const analysis =
      await this.analysisRepository.findByPullRequestId(pullRequestId);

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
    const nodes = (output.graph?.nodes ?? []) as Array<{
      status?: "ok" | "discuss" | "unknown";
      riskLevel?: string | null;
    }>;

    return {
      okCount: nodes.filter((node) => node.status === "ok").length,
      discussCount: nodes.filter((node) => node.status === "discuss").length,
      riskCount: nodes.filter(
        (node) => node.riskLevel && node.riskLevel !== "low",
      ).length,
    };
  }

  private applySecondaryOutputs(
    analysisId: string,
    output: ReviewAnalysisGenerateOutput,
  ): void {
    const graph = this.toPersistableGraph(output.graph);

    if (graph && this.graphResultService) {
      this.graphResultService.applyGraph(
        analysisId,
        graph,
        output.pullRequestId ?? null,
      );
    }

    if (output.changedFiles && this.changedFilesResultService) {
      this.changedFilesResultService.applyChangedFiles(
        analysisId,
        output.changedFiles,
      );
    }

    if (this.hasArtifacts(output) && this.artifactsResultService) {
      this.artifactsResultService.applyArtifacts(analysisId, {
        questions: output.questions,
        risks: output.risks,
        checklist: output.checklist,
      });
    }
  }

  private toPersistableGraph(
    graph: ReviewAnalysisGenerateGraphOutput | undefined,
  ): ReviewAnalysisGenerateGraphOutput | null {
    if (!graph) {
      return null;
    }

    const nodes = graph.nodes ?? [];
    const hasSummary =
      Boolean(graph.summary) ||
      Boolean(graph.intentSummary) ||
      Boolean(graph.reviewStrategy);
    const hasCompleteNodes =
      nodes.length > 0 &&
      nodes.every(
        (node) =>
          typeof node.id === "string" &&
          typeof node.nodeType === "string" &&
          typeof node.label === "string",
      );

    if (!hasSummary && !hasCompleteNodes) {
      return null;
    }

    return hasCompleteNodes ? graph : { ...graph, nodes: [] };
  }

  private hasArtifacts(output: ReviewAnalysisGenerateOutput): boolean {
    return Boolean(
      output.questions?.length ||
        output.risks?.length ||
        output.checklist?.length,
    );
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
