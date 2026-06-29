import type { ProgressSummary } from "../types/public-contracts";

export interface ProgressApiContract {
  getProgressSummary(workspaceId: string): Promise<ProgressSummary>;
}
