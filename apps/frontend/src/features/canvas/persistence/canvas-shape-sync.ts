import PQueue from "p-queue";
import pRetry from "p-retry";
import {
  buildCanvasShapeSyncOperations,
  type CanvasFreeformShapeSnapshot,
  type CanvasShapePayload,
  type CanvasShapeSyncOperation,
} from "./canvas-shape-operations";

export {
  areCanvasFreeformShapesEqual,
  buildCanvasShapeSyncOperations,
  hasCanvasFreeformShapeChanged,
  toCanvasShapePayload,
  type CanvasFreeformShapeSnapshot,
  type CanvasShapePayload,
  type CanvasShapeSyncOperation,
} from "./canvas-shape-operations";

type CanvasShapeMutationPayload = CanvasShapePayload & {
  baseRevision?: number | null;
  clientOperationId?: string;
};

export type CanvasShapeApiClient = {
  syncShapesBatch?: (
    boardId: string,
    body: { operations: CanvasShapeSyncOperation[] },
    options: { workspaceId: string },
  ) => Promise<unknown>;
  createShape: (
    boardId: string,
    body: CanvasShapeMutationPayload,
    options: { workspaceId: string },
  ) => Promise<unknown>;
  updateShape: (
    shapeId: string,
    body: CanvasShapeMutationPayload,
    options: { workspaceId: string },
  ) => Promise<unknown>;
  deleteShape: (
    shapeId: string,
    body: { baseRevision: number | null; clientOperationId: string },
    options: { workspaceId: string },
  ) => Promise<unknown>;
};

export type CanvasShapeSyncQueue = {
  cancel: () => void;
  enqueue: (input: {
    previousShapes: CanvasFreeformShapeSnapshot[];
    nextShapes: CanvasFreeformShapeSnapshot[];
  }) => void;
  flush: () => Promise<void>;
  size: () => number;
  whenIdle: () => Promise<void>;
};

export type CanvasShapeSyncResult = {
  shapeRevisions: Map<string, number>;
};

type CanvasShapeSyncQueueOptions = {
  boardId: string;
  canvasClient: CanvasShapeApiClient;
  debounceMs?: number;
  getBaseRevision?: (shapeId: string) => number | null;
  onError?: (error: unknown) => void;
  onSynced?: (
    operations: CanvasShapeSyncOperation[],
    result: CanvasShapeSyncResult,
  ) => void;
  workspaceId: string;
};

const DEFAULT_CANVAS_SHAPE_SYNC_QUEUE_DEBOUNCE_MS = 500;
const DEFAULT_CANVAS_SHAPE_SYNC_RETRY_ATTEMPTS = 3;
const DEFAULT_CANVAS_SHAPE_SYNC_RETRY_DELAY_MS = 320;
const DEFAULT_CANVAS_SHAPE_SYNC_BATCH_SIZE = 100;
const NON_RETRYABLE_CANVAS_API_STATUSES = new Set([400, 401, 403, 404, 409]);

class CanvasShapeSyncFailure extends Error {
  readonly cause: unknown;
  readonly failedOperations: CanvasShapeSyncOperation[];

  constructor(error: unknown, failedOperations: CanvasShapeSyncOperation[]) {
    super("Canvas shape sync failed");
    this.name = "CanvasShapeSyncFailure";
    this.cause = error;
    this.failedOperations = failedOperations;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCanvasApiErrorStatus(error: unknown) {
  return isRecord(error) && typeof error.status === "number"
    ? error.status
    : null;
}

function isNonRetryableCanvasApiError(error: unknown) {
  const status = readCanvasApiErrorStatus(error);

  return status !== null && NON_RETRYABLE_CANVAS_API_STATUSES.has(status);
}

function isMissingCanvasApiError(error: unknown) {
  return readCanvasApiErrorStatus(error) === 404;
}

function readCanvasShapeRevision(shape: CanvasFreeformShapeSnapshot | undefined) {
  const revision = shape?.revision;

  return typeof revision === "number" && Number.isInteger(revision) && revision > 0
    ? revision
    : null;
}

function isStaleMissingShapeOperation(
  error: unknown,
  operation: CanvasShapeSyncOperation,
) {
  return operation.type !== "create" && isMissingCanvasApiError(error);
}

function isNonRetryableCanvasShapeSyncError(error: unknown) {
  if (isNonRetryableCanvasApiError(error)) {
    return true;
  }

  return (
    error instanceof CanvasShapeSyncFailure &&
    isNonRetryableCanvasApiError(error.cause)
  );
}

function readInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function readShapeRevisionEntry(value: unknown) {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }

  const revision = readInteger(value.revision);

  if (revision === null || revision <= 0) {
    return null;
  }

  return {
    revision,
    shapeId: value.id,
  };
}

function mergeCanvasShapeSyncResults(
  target: CanvasShapeSyncResult,
  source: CanvasShapeSyncResult,
) {
  source.shapeRevisions.forEach((revision, shapeId) => {
    target.shapeRevisions.set(
      shapeId,
      Math.max(target.shapeRevisions.get(shapeId) ?? 0, revision),
    );
  });

  return target;
}

function readCanvasShapeSyncResult(value: unknown): CanvasShapeSyncResult {
  const result: CanvasShapeSyncResult = {
    shapeRevisions: new Map<string, number>(),
  };

  if (!isRecord(value)) {
    return result;
  }

  const shapeEntries = [
    ...(Array.isArray(value.shapes) ? value.shapes : []),
    ...(Array.isArray(value.deletedShapes) ? value.deletedShapes : []),
    value,
  ];

  shapeEntries.forEach((entry) => {
    const revisionEntry = readShapeRevisionEntry(entry);

    if (!revisionEntry) return;

    result.shapeRevisions.set(
      revisionEntry.shapeId,
      Math.max(
        result.shapeRevisions.get(revisionEntry.shapeId) ?? 0,
        revisionEntry.revision,
      ),
    );
  });

  return result;
}

function mergeQueuedCanvasShapeSyncOperation(
  pendingOperations: Map<string, CanvasShapeSyncOperation>,
  operation: CanvasShapeSyncOperation,
) {
  const pendingOperation = pendingOperations.get(operation.shapeId);

  if (!pendingOperation) {
    pendingOperations.set(operation.shapeId, operation);
    return;
  }

  if (operation.type === "create") {
    pendingOperations.set(
      operation.shapeId,
      pendingOperation.type === "create"
        ? operation
        : {
            baseRevision:
              pendingOperation.baseRevision ?? operation.baseRevision ?? null,
            clientOperationId: operation.clientOperationId,
            type: "update",
            shapeId: operation.shapeId,
            payload: operation.payload,
          },
    );
    return;
  }

  if (operation.type === "update") {
    pendingOperations.set(
      operation.shapeId,
      pendingOperation.type === "create"
        ? {
            baseRevision: null,
            clientOperationId: pendingOperation.clientOperationId,
            type: "create",
            shapeId: operation.shapeId,
            payload: operation.payload,
          }
        : {
            ...operation,
            baseRevision:
              pendingOperation.baseRevision ?? operation.baseRevision,
          },
    );
    return;
  }

  if (pendingOperation.type === "create") {
    pendingOperations.delete(operation.shapeId);
    return;
  }

  pendingOperations.set(operation.shapeId, {
    ...operation,
    baseRevision: pendingOperation.baseRevision ?? operation.baseRevision,
  });
}

function runCanvasShapeSyncOperation({
  boardId,
  canvasClient,
  operation,
  workspaceId,
}: {
  boardId: string;
  canvasClient: CanvasShapeApiClient;
  operation: CanvasShapeSyncOperation;
  workspaceId: string;
}): Promise<unknown> {
  if (operation.type === "create") {
    return canvasClient.createShape(
      boardId,
      {
        ...operation.payload,
        baseRevision: operation.baseRevision ?? null,
        clientOperationId: operation.clientOperationId,
      },
      {
        workspaceId,
      },
    );
  }

  if (operation.type === "update") {
    return canvasClient.updateShape(
      operation.shapeId,
      {
        ...operation.payload,
        baseRevision: operation.baseRevision,
        clientOperationId: operation.clientOperationId,
      },
      {
        workspaceId,
      },
    );
  }

  return canvasClient.deleteShape(
    operation.shapeId,
    {
      baseRevision: operation.baseRevision,
      clientOperationId: operation.clientOperationId,
    },
    {
      workspaceId,
    },
  );
}

function runWithRetry(task: () => Promise<unknown>) {
  return pRetry(task, {
    factor: 2,
    minTimeout: DEFAULT_CANVAS_SHAPE_SYNC_RETRY_DELAY_MS,
    retries: DEFAULT_CANVAS_SHAPE_SYNC_RETRY_ATTEMPTS,
    shouldRetry({ error }) {
      return !isNonRetryableCanvasApiError(error);
    },
  });
}

async function runCanvasShapeSyncOperations({
  boardId,
  canvasClient,
  operations,
  workspaceId,
}: {
  boardId: string;
  canvasClient: CanvasShapeApiClient;
  operations: CanvasShapeSyncOperation[];
  workspaceId: string;
}): Promise<CanvasShapeSyncResult> {
  const result: CanvasShapeSyncResult = {
    shapeRevisions: new Map<string, number>(),
  };

  if (!operations.length) {
    return result;
  }

  const syncShapesBatch = canvasClient.syncShapesBatch;

  if (syncShapesBatch) {
    const runSyncShapesBatch = syncShapesBatch;

    async function runBatchOperationsIndividually(
      batchOperations: CanvasShapeSyncOperation[],
    ) {
      for (let index = 0; index < batchOperations.length; index += 1) {
        const operation = batchOperations[index];

        try {
          await runWithRetry(async () => {
            const response = await runSyncShapesBatch(
              boardId,
              {
                operations: [operation],
              },
              {
                workspaceId,
              },
            );

            mergeCanvasShapeSyncResults(
              result,
              readCanvasShapeSyncResult(response),
            );
          });
        } catch (error) {
          if (isStaleMissingShapeOperation(error, operation)) {
            continue;
          }

          throw new CanvasShapeSyncFailure(
            error,
            batchOperations.slice(index),
          );
        }
      }
    }

    for (
      let index = 0;
      index < operations.length;
      index += DEFAULT_CANVAS_SHAPE_SYNC_BATCH_SIZE
    ) {
      const batchOperations = operations.slice(
        index,
        index + DEFAULT_CANVAS_SHAPE_SYNC_BATCH_SIZE,
      );

      try {
        await runWithRetry(async () => {
          const response = await runSyncShapesBatch(
            boardId,
            {
              operations: batchOperations,
            },
            {
              workspaceId,
            },
          );

          mergeCanvasShapeSyncResults(
            result,
            readCanvasShapeSyncResult(response),
          );
        });
      } catch (error) {
        if (
          batchOperations.length > 1 &&
          isNonRetryableCanvasApiError(error)
        ) {
          try {
            await runBatchOperationsIndividually(batchOperations);
            continue;
          } catch (fallbackError) {
            if (fallbackError instanceof CanvasShapeSyncFailure) {
              throw fallbackError;
            }
          }
        }

        throw new CanvasShapeSyncFailure(error, operations.slice(index));
      }
    }

    return result;
  }

  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];

    try {
      await runWithRetry(async () => {
        const response = await runCanvasShapeSyncOperation({
          boardId,
          canvasClient,
          operation,
          workspaceId,
        });

        mergeCanvasShapeSyncResults(
          result,
          readCanvasShapeSyncResult(response),
        );
      });
    } catch (error) {
      throw new CanvasShapeSyncFailure(error, operations.slice(index));
    }
  }

  return result;
}

export function createCanvasShapeSyncQueue({
  boardId,
  canvasClient,
  debounceMs = DEFAULT_CANVAS_SHAPE_SYNC_QUEUE_DEBOUNCE_MS,
  getBaseRevision,
  onError,
  onSynced,
  workspaceId,
}: CanvasShapeSyncQueueOptions): CanvasShapeSyncQueue {
  const pendingOperations = new Map<string, CanvasShapeSyncOperation>();
  const requestQueue = new PQueue({ concurrency: 1 });
  const idleWaiters: Array<{
    reject: (error: unknown) => void;
    resolve: () => void;
  }> = [];
  let flushPromise: Promise<void> | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function clearFlushTimer() {
    if (!flushTimer) return;

    clearTimeout(flushTimer);
    flushTimer = null;
  }

  function isIdle() {
    return (
      pendingOperations.size === 0 &&
      !flushTimer &&
      !flushPromise &&
      requestQueue.size === 0 &&
      requestQueue.pending === 0
    );
  }

  function resolveIdleWaiters() {
    if (!isIdle()) return;

    const waiters = idleWaiters.splice(0);

    waiters.forEach((waiter) => waiter.resolve());
  }

  function rejectIdleWaiters(error: unknown) {
    const waiters = idleWaiters.splice(0);

    waiters.forEach((waiter) => waiter.reject(error));
  }

  async function flushPendingOperations(): Promise<void> {
    const operations = Array.from(pendingOperations.values());

    pendingOperations.clear();

    if (!operations.length) return;

    try {
      const result = await runCanvasShapeSyncOperations({
        boardId,
        canvasClient,
        operations,
        workspaceId,
      });
      onSynced?.(operations, result);
    } catch (error) {
      if (isNonRetryableCanvasShapeSyncError(error)) {
        pendingOperations.clear();
        throw error;
      }

      const queuedDuringFlush = Array.from(pendingOperations.values());
      const failedOperations =
        error instanceof CanvasShapeSyncFailure
          ? error.failedOperations
          : operations;

      pendingOperations.clear();
      failedOperations.forEach((operation) => {
        mergeQueuedCanvasShapeSyncOperation(pendingOperations, operation);
      });
      queuedDuringFlush.forEach((operation) => {
        mergeQueuedCanvasShapeSyncOperation(pendingOperations, operation);
      });

      throw error;
    }

    if (pendingOperations.size) {
      await flushPendingOperations();
    }
  }

  function flush() {
    clearFlushTimer();

    if (!flushPromise) {
      flushPromise = requestQueue
        .add(() => flushPendingOperations())
        .catch((error: unknown) => {
          if (pendingOperations.size) {
            scheduleFlush();
          } else {
            rejectIdleWaiters(error);
          }

          throw error;
        })
        .finally(() => {
          flushPromise = null;
          resolveIdleWaiters();
        });
    }

    return flushPromise;
  }

  function scheduleFlush() {
    clearFlushTimer();

    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush().catch(onError);
    }, debounceMs);
  }

  return {
    cancel() {
      clearFlushTimer();
      requestQueue.clear();
      pendingOperations.clear();
      resolveIdleWaiters();
    },
    enqueue({ previousShapes, nextShapes }) {
      const operations = buildCanvasShapeSyncOperations(
        previousShapes,
        nextShapes,
        { getBaseRevision },
      );

      operations.forEach((operation) => {
        mergeQueuedCanvasShapeSyncOperation(pendingOperations, operation);
      });

      if (pendingOperations.size) {
        scheduleFlush();
      }
    },
    flush,
    size() {
      return pendingOperations.size + requestQueue.size + requestQueue.pending;
    },
    whenIdle() {
      if (isIdle()) return Promise.resolve();

      return new Promise<void>((resolve, reject) => {
        idleWaiters.push({ reject, resolve });
      });
    },
  };
}

export async function syncCanvasFreeformShapes({
  boardId,
  canvasClient,
  getBaseRevision,
  nextShapes,
  previousShapes,
  workspaceId,
}: {
  boardId: string;
  canvasClient: CanvasShapeApiClient;
  getBaseRevision?: (shapeId: string) => number | null;
  nextShapes: CanvasFreeformShapeSnapshot[];
  previousShapes: CanvasFreeformShapeSnapshot[];
  workspaceId: string;
}) {
  const operations = buildCanvasShapeSyncOperations(previousShapes, nextShapes, {
    getBaseRevision,
  });

  return runCanvasShapeSyncOperations({
    boardId,
    canvasClient,
    operations,
    workspaceId,
  });
}
