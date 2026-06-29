import type { ReviewAnalysisStatus, ReviewRiskLevel } from "../public";
import type { AgentChangedFileResult } from "./agent-changed-files-result.service";
import type {
  AgentReviewGraphResult,
  AgentReviewNodeResult,
} from "./agent-graph-result.service";
import type { AgentReviewArtifactsResult } from "./agent-review-artifacts-result.service";

export interface AgentResultMessage {
  jobId: string;
  runId: string;
  status: "succeeded" | "failed";
  output?: ReviewAnalysisGenerateOutput | null;
  error?: { message?: string; code?: string } | null;
  finishedAt?: string;
}

export type ReviewAnalysisGenerateGraphOutput = AgentReviewGraphResult & {
  nodes?: Array<
    AgentReviewNodeResult & {
      status?: "ok" | "discuss" | "unknown";
      riskLevel?: ReviewRiskLevel;
    }
  >;
};

export interface ReviewAnalysisGenerateOutput
  extends AgentReviewArtifactsResult {
  pullRequestId?: string;
  purposeSummary?: string | null;
  impactSummary?: string | null;
  testRecommendation?: string | null;
  riskLevel?: ReviewRiskLevel;
  conclusion?: string | null;
  graph?: ReviewAnalysisGenerateGraphOutput;
  changedFiles?: AgentChangedFileResult[];
}

export interface AgentResultApplicationRecord {
  jobId: string;
  runId: string;
  analysisId: string;
  analysisStatus: Extract<ReviewAnalysisStatus, "succeeded" | "failed">;
  appliedAt: string;
}
