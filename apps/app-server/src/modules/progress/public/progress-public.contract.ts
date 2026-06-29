import { ProgressSummary } from "../../../common/contracts/public-contracts";

export interface ProgressPublicContract {
  getProgressSummary(workspaceId: string): Promise<ProgressSummary>;
}
