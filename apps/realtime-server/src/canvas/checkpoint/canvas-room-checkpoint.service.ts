import type {
  CanvasRoomCheckpointStatusPayload,
  CanvasRoomRef,
} from "../contracts/canvas-types";
import type {
  CanvasRoomCheckpointSnapshot,
  CanvasRoomStateService,
} from "../state/canvas-room-state.service";

const CANVAS_CHECKPOINT_IDLE_MS = 60 * 1_000;
const CANVAS_CHECKPOINT_MAX_DIRTY_AGE_MS = 5 * 60 * 1_000;
const CANVAS_CHECKPOINT_EMPTY_ROOM_GRACE_MS = 7_500;
const CANVAS_CHECKPOINT_MAX_OPERATIONS = 100;
const CANVAS_CHECKPOINT_MAX_PAYLOAD_BYTES = 1024 * 1024;
const CANVAS_CHECKPOINT_BATCH_YIELD_MS = 75;
const CANVAS_CHECKPOINT_MAX_CONCURRENT_ROOMS = 4;
const CANVAS_CHECKPOINT_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
const SPLITTABLE_CHECKPOINT_STATUSES = new Set([400, 409, 422]);

type CheckpointMode = "drain" | "snapshot";

type CheckpointRequest = {
  mode: CheckpointMode;
  waiters: Array<{
    reject: (error: unknown) => void;
    resolve: () => void;
  }>;
};

type RoomCheckpointLifecycle = {
  emptyCleanupRequested: boolean;
  emptyRoomTimer: ReturnType<typeof setTimeout> | null;
  firstDirtyAt: number | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  lastDirtyAt: number | null;
  maxAgeTimer: ReturnType<typeof setTimeout> | null;
  participants: Set<string>;
  retryAttempt: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
};

export type CanvasRoomCheckpointService = {
  close: () => Promise<void>;
  flushCheckpointNow: (
    room: CanvasRoomRef,
    token?: string,
    userId?: string,
  ) => Promise<void>;
  registerRoomParticipant: (
    room: CanvasRoomRef,
    socketId: string,
    token: string,
    userId: string,
  ) => void;
  revokeRoomAuthorization: (room: CanvasRoomRef, userId: string) => void;
  scheduleCheckpoint: (
    room: CanvasRoomRef,
    token: string,
    userId: string,
  ) => void;
  unregisterRoomParticipant: (
    room: CanvasRoomRef,
    socketId: string,
  ) => void;
};

export type CanvasRoomCheckpointServiceOptions = {
  appServerUrl: string;
  batchYieldMs?: number;
  emptyRoomGraceMs?: number;
  idleCheckpointMs?: number;
  maxConcurrentRooms?: number;
  maxDirtyAgeMs?: number;
  onCheckpointStatus?: (payload: CanvasRoomCheckpointStatusPayload) => void;
  retryDelaysMs?: number[];
  roomStateService: CanvasRoomStateService;
};

function createRoomKey(room: CanvasRoomRef) {
  return `${room.workspaceId}:${room.canvasId}`;
}

async function readResponseJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function summarizeOperations(
  operations: CanvasRoomCheckpointSnapshot["operations"],
) {
  return operations.slice(0, 5).map((operation) => ({
    shapeId: operation.shapeId,
    type: operation.type,
  }));
}

function shouldSplitCheckpointFailure(status: number, body: unknown) {
  if (SPLITTABLE_CHECKPOINT_STATUSES.has(status)) return true;
  return status === 404 && isCanvasShapeNotFoundResponse(body);
}

function isCanvasShapeNotFoundResponse(body: unknown) {
  if (typeof body !== "object" || body === null) return false;

  const error = "error" in body ? body.error : null;

  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    error.message === "Canvas shape not found"
  );
}

function isAlreadyDeletedCheckpointFailure(
  status: number,
  body: unknown,
  operations: CanvasRoomCheckpointSnapshot["operations"],
) {
  return (
    status === 404 &&
    operations.length === 1 &&
    operations[0]?.type === "delete" &&
    isCanvasShapeNotFoundResponse(body)
  );
}

function waitForEventLoop(delayMs: number) {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export function createCanvasRoomCheckpointService({
  appServerUrl,
  batchYieldMs = CANVAS_CHECKPOINT_BATCH_YIELD_MS,
  emptyRoomGraceMs = CANVAS_CHECKPOINT_EMPTY_ROOM_GRACE_MS,
  idleCheckpointMs = CANVAS_CHECKPOINT_IDLE_MS,
  maxConcurrentRooms = CANVAS_CHECKPOINT_MAX_CONCURRENT_ROOMS,
  maxDirtyAgeMs = CANVAS_CHECKPOINT_MAX_DIRTY_AGE_MS,
  onCheckpointStatus,
  retryDelaysMs = CANVAS_CHECKPOINT_RETRY_DELAYS_MS,
  roomStateService,
}: CanvasRoomCheckpointServiceOptions): CanvasRoomCheckpointService {
  const authorizationsByRoom = new Map<string, Map<string, string>>();
  const lifecycleByRoom = new Map<string, RoomCheckpointLifecycle>();
  const pendingRequestsByRoom = new Map<string, CheckpointRequest>();
  const queuedRoomKeys = new Set<string>();
  const checkpointQueue: string[] = [];
  const roomsByKey = new Map<string, CanvasRoomRef>();
  const runningCheckpointsByRoom = new Map<string, Promise<void>>();
  let activeRoomCheckpoints = 0;
  let isClosing = false;

  function getLifecycle(roomKey: string) {
    let lifecycle = lifecycleByRoom.get(roomKey);

    if (!lifecycle) {
      lifecycle = {
        emptyCleanupRequested: false,
        emptyRoomTimer: null,
        firstDirtyAt: null,
        idleTimer: null,
        lastDirtyAt: null,
        maxAgeTimer: null,
        participants: new Set<string>(),
        retryAttempt: 0,
        retryTimer: null,
      };
      lifecycleByRoom.set(roomKey, lifecycle);
    }

    return lifecycle;
  }

  function clearTimer(timer: ReturnType<typeof setTimeout> | null) {
    if (timer) clearTimeout(timer);
  }

  function clearDirtyTimers(lifecycle: RoomCheckpointLifecycle) {
    clearTimer(lifecycle.idleTimer);
    clearTimer(lifecycle.maxAgeTimer);
    lifecycle.idleTimer = null;
    lifecycle.maxAgeTimer = null;
  }

  function clearRetryTimer(lifecycle: RoomCheckpointLifecycle) {
    clearTimer(lifecycle.retryTimer);
    lifecycle.retryTimer = null;
  }

  function clearAllTimers(lifecycle: RoomCheckpointLifecycle) {
    clearDirtyTimers(lifecycle);
    clearRetryTimer(lifecycle);
    clearTimer(lifecycle.emptyRoomTimer);
    lifecycle.emptyRoomTimer = null;
  }

  async function persistOperations(
    room: CanvasRoomRef,
    token: string,
    operations: CanvasRoomCheckpointSnapshot["operations"],
  ): Promise<{
    failures: Array<{
      body: unknown;
      operations: CanvasRoomCheckpointSnapshot["operations"];
      status: number | null;
    }>;
    successes: Array<{
      operations: CanvasRoomCheckpointSnapshot["operations"];
      result: unknown;
    }>;
  }> {
    const path = `/workspaces/${encodeURIComponent(
      room.workspaceId,
    )}/canvases/${encodeURIComponent(room.canvasId)}/shapes/batch`;

    try {
      const response = await fetch(`${appServerUrl}${path}`, {
        body: JSON.stringify({ operations }),
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const responseBody = await readResponseJson(response);

      if (response.ok) {
        return {
          failures: [],
          successes: [{ operations, result: responseBody }],
        };
      }

      if (
        isAlreadyDeletedCheckpointFailure(
          response.status,
          responseBody,
          operations,
        )
      ) {
        return {
          failures: [],
          successes: [{ operations, result: responseBody }],
        };
      }

      if (
        operations.length > 1 &&
        shouldSplitCheckpointFailure(response.status, responseBody)
      ) {
        const middle = Math.ceil(operations.length / 2);
        const left = await persistOperations(
          room,
          token,
          operations.slice(0, middle),
        );
        const right = await persistOperations(
          room,
          token,
          operations.slice(middle),
        );

        return {
          failures: [...left.failures, ...right.failures],
          successes: [...left.successes, ...right.successes],
        };
      }

      return {
        failures: [
          {
            body: responseBody,
            operations,
            status: response.status,
          },
        ],
        successes: [],
      };
    } catch (error) {
      return {
        failures: [
          {
            body: error,
            operations,
            status: null,
          },
        ],
        successes: [],
      };
    }
  }

  function emitCheckpointStatus(
    room: CanvasRoomRef,
    status: CanvasRoomCheckpointStatusPayload["status"],
    pendingOperations: number,
  ) {
    const checkpointState = roomStateService.getCheckpointState(room);

    onCheckpointStatus?.({
      ...room,
      checkpointHistorySeq: checkpointState.checkpointHistorySeq,
      checkpointVersion: checkpointState.checkpointVersion,
      historySeq: checkpointState.historySeq,
      pendingOperations,
      status,
      updatedAt: new Date().toISOString(),
    });
  }

  function rememberRoom(
    room: CanvasRoomRef,
    token?: string,
    userId?: string,
  ) {
    const roomKey = createRoomKey(room);

    roomsByKey.set(roomKey, room);
    if (token && userId) {
      const roomAuthorizations = authorizationsByRoom.get(roomKey) ?? new Map();

      roomAuthorizations.set(userId, token);
      authorizationsByRoom.set(roomKey, roomAuthorizations);
    }

    return roomKey;
  }

  function resetDirtyLifecycle(roomKey: string) {
    const lifecycle = lifecycleByRoom.get(roomKey);

    if (!lifecycle) return;

    clearDirtyTimers(lifecycle);
    clearRetryTimer(lifecycle);
    lifecycle.firstDirtyAt = null;
    lifecycle.lastDirtyAt = null;
    lifecycle.retryAttempt = 0;
  }

  function scheduleRetry(roomKey: string) {
    if (isClosing) return;

    const lifecycle = getLifecycle(roomKey);
    const delays = retryDelaysMs.length
      ? retryDelaysMs
      : CANVAS_CHECKPOINT_RETRY_DELAYS_MS;
    const retryIndex = Math.min(lifecycle.retryAttempt, delays.length - 1);
    const retryDelay = delays[retryIndex] ?? 30_000;

    lifecycle.retryAttempt += 1;
    clearDirtyTimers(lifecycle);
    clearRetryTimer(lifecycle);
    lifecycle.retryTimer = setTimeout(() => {
      lifecycle.retryTimer = null;
      void enqueueCheckpoint(roomKey, "snapshot").catch((error: unknown) => {
        console.warn("Canvas room checkpoint retry failed.", error);
      });
    }, retryDelay);
  }

  function scheduleDirtyTimers(roomKey: string) {
    if (isClosing) return;

    const room = roomsByKey.get(roomKey);
    if (!room || !roomStateService.getDirtyState(room).shapeCount) return;

    const lifecycle = getLifecycle(roomKey);
    const now = Date.now();
    const firstDirtyAt = lifecycle.firstDirtyAt ?? now;
    const lastDirtyAt = lifecycle.lastDirtyAt ?? now;

    lifecycle.firstDirtyAt = firstDirtyAt;
    lifecycle.lastDirtyAt = lastDirtyAt;
    clearDirtyTimers(lifecycle);

    const idleDelay = Math.max(0, lastDirtyAt + idleCheckpointMs - now);
    const maxAgeDelay = Math.max(0, firstDirtyAt + maxDirtyAgeMs - now);

    lifecycle.idleTimer = setTimeout(() => {
      lifecycle.idleTimer = null;
      void enqueueCheckpoint(roomKey, "snapshot").catch((error: unknown) => {
        console.warn("Canvas idle checkpoint failed.", error);
      });
    }, idleDelay);
    lifecycle.maxAgeTimer = setTimeout(() => {
      lifecycle.maxAgeTimer = null;
      void enqueueCheckpoint(roomKey, "snapshot").catch((error: unknown) => {
        console.warn("Canvas max-age checkpoint failed.", error);
      });
    }, maxAgeDelay);
  }

  function updateLifecycleAfterSuccessfulCycle(roomKey: string) {
    const room = roomsByKey.get(roomKey);
    const lifecycle = lifecycleByRoom.get(roomKey);

    if (!room || !lifecycle) return;

    clearRetryTimer(lifecycle);
    lifecycle.retryAttempt = 0;
    if (!roomStateService.getDirtyState(room).shapeCount) {
      resetDirtyLifecycle(roomKey);
      return;
    }

    // Anything still dirty was created while the saved snapshot was in flight.
    // Give that newer state its own idle and hard-age window.
    lifecycle.firstDirtyAt = lifecycle.lastDirtyAt ?? Date.now();
    scheduleDirtyTimers(roomKey);
  }

  async function runCheckpointCycle(roomKey: string, mode: CheckpointMode) {
    const room = roomsByKey.get(roomKey);
    const roomAuthorizations = authorizationsByRoom.get(roomKey);
    const authorization = roomAuthorizations
      ? Array.from(roomAuthorizations, ([userId, token]) => ({ token, userId })).at(-1)
      : null;

    if (!room || !authorization) return;

    const initialDirtyState = roomStateService.getDirtyState(room);
    if (!initialDirtyState.shapeCount) {
      resetDirtyLifecycle(roomKey);
      return;
    }

    emitCheckpointStatus(room, "saving", initialDirtyState.shapeCount);
    let hadFailures = false;
    let completedCycle = false;

    do {
      const snapshot = roomStateService.getCheckpointSnapshot(room);
      if (!snapshot.operations.length) break;

      const results: Awaited<ReturnType<typeof persistOperations>>[] = [];

      for (
        let offset = 0;
        offset < snapshot.operations.length;
        offset += CANVAS_CHECKPOINT_MAX_OPERATIONS
      ) {
        const operations = snapshot.operations.slice(
          offset,
          offset + CANVAS_CHECKPOINT_MAX_OPERATIONS,
        );

        results.push(
          await persistOperations(room, authorization.token, operations),
        );
        if (offset + CANVAS_CHECKPOINT_MAX_OPERATIONS < snapshot.operations.length) {
          await waitForEventLoop(batchYieldMs);
        }
      }

      const failures = results.flatMap((result) => result.failures);
      const successes = results.flatMap((result) => result.successes);

      successes.forEach((success, index) => {
        roomStateService.markCheckpointSucceeded(
          room,
          success.operations,
          success.result,
          {
            advanceCheckpoint:
              failures.length === 0 && index === successes.length - 1,
          },
        );
      });

      failures.forEach((failure) => {
        console.warn("Canvas room checkpoint failed.", {
          body: failure.body,
          canvasId: room.canvasId,
          operationCount: failure.operations.length,
          operations: summarizeOperations(failure.operations),
          status: failure.status,
          workspaceId: room.workspaceId,
        });
      });

      hadFailures = failures.length > 0;
      completedCycle = true;
      if (hadFailures || mode === "snapshot") break;

      if (roomStateService.getDirtyState(room).shapeCount) {
        await waitForEventLoop(batchYieldMs);
      }
    } while (roomStateService.getDirtyState(room).shapeCount);

    const pendingOperations = roomStateService.getDirtyState(room).shapeCount;

    if (hadFailures) {
      emitCheckpointStatus(room, "delayed", pendingOperations);
      scheduleRetry(roomKey);
      return;
    }

    if (completedCycle) {
      emitCheckpointStatus(room, "saved", pendingOperations);
    }
    updateLifecycleAfterSuccessfulCycle(roomKey);
  }

  function queueRoomKey(roomKey: string) {
    if (queuedRoomKeys.has(roomKey) || runningCheckpointsByRoom.has(roomKey)) {
      return;
    }

    queuedRoomKeys.add(roomKey);
    checkpointQueue.push(roomKey);
  }

  function clearEmptyRoomIfReady(roomKey: string) {
    const room = roomsByKey.get(roomKey);
    const lifecycle = lifecycleByRoom.get(roomKey);

    if (
      !room ||
      !lifecycle?.emptyCleanupRequested ||
      lifecycle.participants.size ||
      roomStateService.getDirtyState(room).shapeCount ||
      pendingRequestsByRoom.has(roomKey) ||
      runningCheckpointsByRoom.has(roomKey)
    ) {
      return;
    }

    clearRoom(roomKey);
  }

  function pumpCheckpointQueue() {
    while (
      activeRoomCheckpoints < Math.max(1, maxConcurrentRooms) &&
      checkpointQueue.length
    ) {
      const roomKey = checkpointQueue.shift();
      if (!roomKey) continue;

      queuedRoomKeys.delete(roomKey);
      if (runningCheckpointsByRoom.has(roomKey)) continue;

      const request = pendingRequestsByRoom.get(roomKey);
      if (!request) continue;

      pendingRequestsByRoom.delete(roomKey);
      activeRoomCheckpoints += 1;

      const checkpoint = runCheckpointCycle(roomKey, request.mode);

      runningCheckpointsByRoom.set(roomKey, checkpoint);
      void checkpoint
        .then(() => {
          request.waiters.forEach(({ resolve }) => resolve());
        })
        .catch((error: unknown) => {
          request.waiters.forEach(({ reject }) => reject(error));
        })
        .finally(() => {
          runningCheckpointsByRoom.delete(roomKey);
          activeRoomCheckpoints -= 1;
          if (pendingRequestsByRoom.has(roomKey)) {
            queueRoomKey(roomKey);
          }
          clearEmptyRoomIfReady(roomKey);
          pumpCheckpointQueue();
        });
    }
  }

  function enqueueCheckpoint(
    roomKey: string,
    mode: CheckpointMode,
    options: { allowClosing?: boolean } = {},
  ) {
    if (isClosing && !options.allowClosing) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const currentRequest = pendingRequestsByRoom.get(roomKey);

      if (currentRequest) {
        if (mode === "drain") currentRequest.mode = "drain";
        currentRequest.waiters.push({ reject, resolve });
      } else {
        pendingRequestsByRoom.set(roomKey, {
          mode,
          waiters: [{ reject, resolve }],
        });
      }

      queueRoomKey(roomKey);
      pumpCheckpointQueue();
    });
  }

  function clearRoom(roomKey: string) {
    const room = roomsByKey.get(roomKey);
    const lifecycle = lifecycleByRoom.get(roomKey);

    if (lifecycle) clearAllTimers(lifecycle);
    if (room) roomStateService.clearRoomState(room);

    authorizationsByRoom.delete(roomKey);
    lifecycleByRoom.delete(roomKey);
    pendingRequestsByRoom.delete(roomKey);
    queuedRoomKeys.delete(roomKey);
    roomsByKey.delete(roomKey);
  }

  function scheduleEmptyRoomCleanup(roomKey: string) {
    const lifecycle = getLifecycle(roomKey);

    clearTimer(lifecycle.emptyRoomTimer);
    lifecycle.emptyRoomTimer = setTimeout(() => {
      lifecycle.emptyRoomTimer = null;
      if (lifecycle.participants.size) return;
      lifecycle.emptyCleanupRequested = true;

      void enqueueCheckpoint(roomKey, "drain")
        .then(() => {
          const room = roomsByKey.get(roomKey);
          if (
            room &&
            !lifecycle.participants.size &&
            !roomStateService.getDirtyState(room).shapeCount
          ) {
            clearRoom(roomKey);
          }
        })
        .catch((error: unknown) => {
          console.warn("Canvas empty room checkpoint failed.", error);
        });
    }, emptyRoomGraceMs);
  }

  return {
    async close() {
      if (isClosing) return;
      isClosing = true;

      lifecycleByRoom.forEach((lifecycle) => {
        clearAllTimers(lifecycle);
      });

      const checkpointResults = await Promise.allSettled(
        Array.from(roomsByKey.keys(), (roomKey) =>
          enqueueCheckpoint(roomKey, "drain", { allowClosing: true }),
        ),
      );

      checkpointResults.forEach((result) => {
        if (result.status === "rejected") {
          console.warn("Canvas shutdown checkpoint failed.", result.reason);
        }
      });

      authorizationsByRoom.clear();
      lifecycleByRoom.clear();
      pendingRequestsByRoom.clear();
      queuedRoomKeys.clear();
      checkpointQueue.length = 0;
      roomsByKey.clear();
      runningCheckpointsByRoom.clear();
    },

    async flushCheckpointNow(room, token, userId) {
      if (isClosing) return;

      const roomKey = rememberRoom(room, token, userId);

      await enqueueCheckpoint(roomKey, "snapshot");
    },

    registerRoomParticipant(room, socketId, token, userId) {
      if (isClosing) return;

      const roomKey = rememberRoom(room, token, userId);
      const lifecycle = getLifecycle(roomKey);

      clearTimer(lifecycle.emptyRoomTimer);
      lifecycle.emptyRoomTimer = null;
      lifecycle.emptyCleanupRequested = false;
      lifecycle.participants.add(socketId);
    },

    revokeRoomAuthorization(room, userId) {
      const roomKey = createRoomKey(room);
      const roomAuthorizations = authorizationsByRoom.get(roomKey);

      roomAuthorizations?.delete(userId);
      if (!roomAuthorizations?.size) {
        authorizationsByRoom.delete(roomKey);
      }
    },

    scheduleCheckpoint(room, token, userId) {
      if (isClosing) return;

      const roomKey = rememberRoom(room, token, userId);
      const lifecycle = getLifecycle(roomKey);
      const now = Date.now();
      const dirtyState = roomStateService.getDirtyState(room);

      if (!dirtyState.shapeCount) {
        resetDirtyLifecycle(roomKey);
        return;
      }

      lifecycle.firstDirtyAt ??= now;
      lifecycle.lastDirtyAt = now;
      clearRetryTimer(lifecycle);
      scheduleDirtyTimers(roomKey);

      if (
        dirtyState.shapeCount >= CANVAS_CHECKPOINT_MAX_OPERATIONS ||
        dirtyState.payloadBytes >= CANVAS_CHECKPOINT_MAX_PAYLOAD_BYTES
      ) {
        void enqueueCheckpoint(roomKey, "snapshot").catch((error: unknown) => {
          console.warn("Canvas threshold checkpoint failed.", error);
        });
      }
    },

    unregisterRoomParticipant(room, socketId) {
      const roomKey = createRoomKey(room);
      const lifecycle = lifecycleByRoom.get(roomKey);

      if (!lifecycle) return;

      lifecycle.participants.delete(socketId);
      if (!lifecycle.participants.size && !isClosing) {
        scheduleEmptyRoomCleanup(roomKey);
      }
    },
  };
}
