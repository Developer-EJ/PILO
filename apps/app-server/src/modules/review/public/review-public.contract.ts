import { PRAnalysisSummary } from "../../../common/contracts/public-contracts";

export interface ReviewPublicContract {
  listPrAnalysisSummaries(workspaceId: string): Promise<PRAnalysisSummary[]>;
}
