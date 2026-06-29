import { Injectable } from "@nestjs/common";
import type {
  CanvasShapeMutationPayload,
  CanvasShapeServerState,
} from "./canvas-realtime.contract";

export type CanvasShapeStateApplyResult =
  | {
      ok: true;
      shape: CanvasShapeServerState;
    }
  | {
      ok: false;
      currentVersion: number;
    };

@Injectable()
export class CanvasShapeStateStore {
  private readonly shapesByKey = new Map<string, CanvasShapeServerState>();

  applyShapeMutation(
    payload: CanvasShapeMutationPayload,
    updatedByMemberId: string,
  ): CanvasShapeStateApplyResult {
    const key = createShapeStateKey(payload.boardId, payload.shapeId);
    const currentShape = this.shapesByKey.get(key);
    const currentVersion = currentShape?.version ?? 0;

    if (payload.baseVersion !== currentVersion) {
      return {
        ok: false,
        currentVersion,
      };
    }

    const shape: CanvasShapeServerState = {
      ...payload,
      width:
        payload.width === null && currentShape
          ? currentShape.width
          : payload.width,
      height:
        payload.height === null && currentShape
          ? currentShape.height
          : payload.height,
      version: currentVersion + 1,
      updatedByMemberId,
    };

    this.shapesByKey.set(key, shape);

    return {
      ok: true,
      shape,
    };
  }
}

function createShapeStateKey(boardId: string, shapeId: string) {
  return `${boardId}:${shapeId}`;
}
