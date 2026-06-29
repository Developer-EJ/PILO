import { Injectable } from "@nestjs/common";
import {
  CanvasBoardSummary,
  NotImplementedError,
} from "../../common/contracts/public-contracts";
import { CanvasPublicContract } from "./public/canvas-public.contract";

@Injectable()
export class CanvasService implements CanvasPublicContract {
  listCanvasBoards(workspaceId: string): Promise<CanvasBoardSummary[]> {
    void workspaceId;
    throw new NotImplementedError("CanvasPublicContract.listCanvasBoards");
  }
}
