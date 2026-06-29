import type { CanvasBoardSummary } from "../types/public-contracts";

export interface CanvasApiContract {
  listCanvasBoards(workspaceId: string): Promise<CanvasBoardSummary[]>;
}
