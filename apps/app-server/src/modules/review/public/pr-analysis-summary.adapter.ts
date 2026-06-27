export type ReviewRiskLevel = "low" | "medium" | "high" | "critical";
export type ReviewAnalysisStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed";

export interface PRAnalysisSummary {
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
}

export interface PRAnalysisSummarySource {
  id: string;
  pullRequestId?: string | null;
  pull_request_id?: string | null;
  purposeSummary?: string | null;
  purpose_summary?: string | null;
  impactSummary?: string | null;
  impact_summary?: string | null;
  testRecommendation?: string | null;
  test_recommendation?: string | null;
  riskLevel?: ReviewRiskLevel | null;
  risk_level?: ReviewRiskLevel | null;
  analysisStatus?: ReviewAnalysisStatus | null;
  analysis_status?: ReviewAnalysisStatus | null;
  okCount?: number | null;
  ok_count?: number | null;
  discussCount?: number | null;
  discuss_count?: number | null;
  riskCount?: number | null;
  risk_count?: number | null;
  conclusion?: string | null;
}

function firstValue<T>(...values: Array<T | null | undefined>): T | null {
  return values.find((value) => value !== undefined && value !== null) ?? null;
}

function countValue(value: number | null): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

export function toPRAnalysisSummary(
  source: PRAnalysisSummarySource,
): PRAnalysisSummary {
  const pullRequestId = firstValue(
    source.pullRequestId,
    source.pull_request_id,
  );

  if (!pullRequestId) {
    throw new Error("PRAnalysisSummary requires pullRequestId");
  }

  return {
    id: source.id,
    pullRequestId,
    purposeSummary: firstValue(source.purposeSummary, source.purpose_summary),
    impactSummary: firstValue(source.impactSummary, source.impact_summary),
    testRecommendation: firstValue(
      source.testRecommendation,
      source.test_recommendation,
    ),
    riskLevel: firstValue(source.riskLevel, source.risk_level) ?? "low",
    analysisStatus:
      firstValue(source.analysisStatus, source.analysis_status) ?? "pending",
    okCount: countValue(firstValue(source.okCount, source.ok_count)),
    discussCount: countValue(
      firstValue(source.discussCount, source.discuss_count),
    ),
    riskCount: countValue(firstValue(source.riskCount, source.risk_count)),
    conclusion: firstValue(source.conclusion),
  };
}
