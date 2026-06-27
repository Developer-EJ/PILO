import type { ReviewAnalysisStatus, ReviewRiskLevel } from "../public";

export interface PullRequestAnalysisRecord {
  id: string;
  pullRequestId: string;
  purposeSummary: string | null;
  impactSummary: string | null;
  testRecommendation: string | null;
  riskLevel: ReviewRiskLevel;
  analysisStatus: ReviewAnalysisStatus;
  okCount: number;
  discussCount: number;
  riskCount: number;
  conclusion: string | null;
  errorTrace: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePullRequestAnalysisInput {
  id: string;
  pullRequestId: string;
  createdAt: string;
}

export interface CompletePullRequestAnalysisInput {
  purposeSummary?: string | null;
  impactSummary?: string | null;
  testRecommendation?: string | null;
  riskLevel?: ReviewRiskLevel;
  okCount?: number;
  discussCount?: number;
  riskCount?: number;
  conclusion?: string | null;
  errorTrace?: string[];
}

export interface ReviewAnalysisRequestedEvent {
  eventType: "review.analysis_requested";
  analysisId: string;
  pullRequestId: string;
  occurredAt: string;
}

export interface ReviewAnalysisCompletedEvent {
  eventType: "review.analysis_completed";
  analysisId: string;
  pullRequestId: string;
  analysisStatus: Extract<ReviewAnalysisStatus, "succeeded" | "failed">;
  errorTrace: string[];
  occurredAt: string;
}
