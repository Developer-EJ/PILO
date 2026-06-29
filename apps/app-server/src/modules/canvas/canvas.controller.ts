import { Controller, Get, Param } from "@nestjs/common";
import { ContractResponseSchema } from "../../common/validation/contract-validation.decorators";
import { CanvasService } from "./canvas.service";

@Controller("workspaces/:workspaceId/canvas")
export class CanvasController {
  constructor(private readonly canvasService: CanvasService) {}

  @Get("boards")
  @ContractResponseSchema({ schemaName: "CanvasBoardSummary", isArray: true })
  listCanvasBoards(@Param("workspaceId") workspaceId: string) {
    return this.canvasService.listCanvasBoards(workspaceId);
  }
}
