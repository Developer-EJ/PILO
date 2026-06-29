import { CanvasBoardSummary } from "../../../common/contracts/public-contracts";

export interface CanvasPublicContract {
  listCanvasBoards(workspaceId: string): Promise<CanvasBoardSummary[]>;
}
