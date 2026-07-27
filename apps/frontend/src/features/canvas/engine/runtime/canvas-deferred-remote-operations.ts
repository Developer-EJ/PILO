import type { CanvasShapeOperationPayload } from "@/features/canvas/api/canvas-types";
import type {
  PiloCanvasFreeformShape,
  PiloCanvasLocalInteractionState,
} from "../canvas-engine-types";
import { collectCanvasFrameDescendantShapeIds } from "./canvas-remote-operations";
import { getFreeformShapeId } from "./canvas-runtime-utils";

const MAX_DEFERRED_REMOTE_OPERATIONS = 80;

export type DeferredRemoteOperationReason =
  | "local-interaction"
  | "pending-local-sync";

export type DeferredRemoteOperation = {
  deferredAt: number;
  operation: CanvasShapeOperationPayload;
  reason: DeferredRemoteOperationReason;
};

export function isRemoteOperationProtectedByLocalInteraction({
  localInteractionState,
  operation,
}: {
  localInteractionState: PiloCanvasLocalInteractionState;
  operation: CanvasShapeOperationPayload;
}) {
  return localInteractionState.activeMutationShapeIds.includes(
    operation.shapeId,
  );
}

export function isRemoteShapeDeletionProtected({
  currentShapes,
  protectedShapeIds,
  shapeDetailCache,
  shapeId,
}: {
  currentShapes: PiloCanvasFreeformShape[];
  protectedShapeIds: ReadonlySet<string>;
  shapeDetailCache: Map<string, PiloCanvasFreeformShape>;
  shapeId: string;
}) {
  if (protectedShapeIds.has(shapeId)) {
    return true;
  }

  const shape =
    currentShapes.find((candidate) => getFreeformShapeId(candidate) === shapeId) ??
    shapeDetailCache.get(shapeId);

  if (shape?.type !== "frame") {
    return false;
  }

  const descendantIds = collectCanvasFrameDescendantShapeIds(
    [...shapeDetailCache.values(), ...currentShapes],
    shapeId,
  );

  return [...descendantIds].some((descendantId) =>
    protectedShapeIds.has(descendantId),
  );
}

export function queueDeferredRemoteOperation(
  queue: Map<number, DeferredRemoteOperation>,
  operation: CanvasShapeOperationPayload,
  reason: DeferredRemoteOperationReason,
) {
  queue.forEach((deferredOperation, opSeq) => {
    if (
      deferredOperation.operation.shapeId === operation.shapeId &&
      opSeq < operation.opSeq
    ) {
      queue.delete(opSeq);
    }
  });

  queue.set(operation.opSeq, {
    deferredAt: Date.now(),
    operation,
    reason,
  });

  if (queue.size <= MAX_DEFERRED_REMOTE_OPERATIONS) {
    return;
  }

  const orderedEntries = Array.from(queue.entries()).sort(
    ([, left], [, right]) => left.operation.opSeq - right.operation.opSeq,
  );
  const latestOpSeqByShapeId = new Map<string, number>();

  orderedEntries.forEach(([opSeq, deferredOperation]) => {
    latestOpSeqByShapeId.set(deferredOperation.operation.shapeId, opSeq);
  });

  for (const [opSeq, deferredOperation] of orderedEntries) {
    if (queue.size <= MAX_DEFERRED_REMOTE_OPERATIONS) break;
    if (deferredOperation.operation.operationType === "delete") continue;
    if (latestOpSeqByShapeId.get(deferredOperation.operation.shapeId) === opSeq) {
      continue;
    }

    queue.delete(opSeq);
  }

  for (const [opSeq] of orderedEntries) {
    if (queue.size <= MAX_DEFERRED_REMOTE_OPERATIONS) break;
    queue.delete(opSeq);
  }

  console.warn("Canvas deferred remote operation queue was compacted.", {
    limit: MAX_DEFERRED_REMOTE_OPERATIONS,
    reason,
    shapeId: operation.shapeId,
  });
}

export function readDeferredRemoteOperations(
  queue: Map<number, DeferredRemoteOperation>,
) {
  return Array.from(queue.values())
    .sort((left, right) => left.operation.opSeq - right.operation.opSeq)
    .map(({ operation }) => operation);
}
