import type { ReviewAnalysisStatus, ReviewRiskLevel } from "../public";

export interface AgentResultMessage {
  jobId: string;
  runId: string;
  status: "succeeded" | "failed";
  output?: ReviewAnalysisGenerateOutput | null;
  error?: { message?: string; code?: string } | null;
  finishedAt?: string;
}

export interface ReviewAnalysisGenerateOutput {
  pullRequestId?: string;
  purposeSummary?: string | null;
  impactSummary?: string | null;
  testRecommendation?: string | null;
  riskLevel?: ReviewRiskLevel;
  conclusion?: string | null;
  graph?: {
    nodes?: Array<{
      status?: "ok" | "discuss" | "unknown";
      riskLevel?: ReviewRiskLevel;
    }>;
  };
  risks?: unknown[];
}

export interface AgentResultApplicationRecord {
  jobId: string;
  runId: string;
  analysisId: string;
  analysisStatus: Extract<ReviewAnalysisStatus, "succeeded" | "failed">;
  appliedAt: string;
}
