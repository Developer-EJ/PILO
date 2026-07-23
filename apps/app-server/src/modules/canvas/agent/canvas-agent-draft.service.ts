import { Injectable } from "@nestjs/common";
import type { SyncCanvasShapesBatchRequest } from "../contracts/canvas.types";
import type { CanvasDraftSpec } from "./canvas-agent.types";
import { canvasAgentDraftToShapeBatch } from "./canvas-agent-draft-shape-batch";

@Injectable()
export class CanvasAgentDraftService {
  toShapeBatch(
    spec: CanvasDraftSpec,
    clientOperationId: string
  ): SyncCanvasShapesBatchRequest {
    return canvasAgentDraftToShapeBatch(spec, clientOperationId);
  }
}
