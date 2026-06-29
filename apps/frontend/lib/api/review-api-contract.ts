import type { PRAnalysisSummary } from "../types/public-contracts";

export interface ReviewApiContract {
  listPrAnalysisSummaries(workspaceId: string): Promise<PRAnalysisSummary[]>;
}
