export const SQL_ERD_TABLE_MOVE_PREVIEW_INTERVAL_MS = 33;

type TimerHandle = ReturnType<typeof setTimeout>;

type SqlErdTableMovePreviewThrottleOptions<Payload> = {
  cancelSchedule?: (handle: TimerHandle) => void;
  emit: (payload: Payload) => void;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => TimerHandle;
};

export type SqlErdTableMovePreviewThrottle<Payload> = {
  cancel: () => void;
  push: (payload: Payload) => void;
};

type SqlErdTablePosition = { x: number; y: number };

type SqlErdRemoteTableMovePreview = SqlErdTablePosition & {
  actorUserId: string;
  sentAt: string;
  tableId: string;
};

export type SqlErdRemoteTableMovePreviewState = {
  actorUserId: string;
  basePosition: SqlErdTablePosition;
};

function arePositionsEqual(
  left: SqlErdTablePosition,
  right: SqlErdTablePosition
) {
  return left.x === right.x && left.y === right.y;
}

export function resolveSqlErdRemoteTableMovePreview({
  canonicalPosition,
  currentPosition,
  preview,
  previousState
}: {
  canonicalPosition: SqlErdTablePosition | null;
  currentPosition: SqlErdTablePosition;
  preview: SqlErdRemoteTableMovePreview | null;
  previousState: SqlErdRemoteTableMovePreviewState | null;
}) {
  if (!preview) {
    return {
      dismissPreview: null,
      nextState: null,
      position: canonicalPosition ?? previousState?.basePosition ?? currentPosition
    };
  }

  const basePosition =
    previousState?.actorUserId === preview.actorUserId
      ? previousState.basePosition
      : canonicalPosition ?? currentPosition;

  if (canonicalPosition && !arePositionsEqual(canonicalPosition, basePosition)) {
    return {
      dismissPreview: {
        actorUserId: preview.actorUserId,
        sentAt: preview.sentAt,
        tableId: preview.tableId
      },
      nextState: null,
      position: canonicalPosition
    };
  }

  return {
    dismissPreview: null,
    nextState: {
      actorUserId: preview.actorUserId,
      basePosition
    },
    position: { x: preview.x, y: preview.y }
  };
}

export function createSqlErdTableMovePreviewThrottle<Payload>({
  cancelSchedule = clearTimeout,
  emit,
  now = Date.now,
  schedule = setTimeout
}: SqlErdTableMovePreviewThrottleOptions<Payload>): SqlErdTableMovePreviewThrottle<Payload> {
  let lastEmittedAt = Number.NEGATIVE_INFINITY;
  let pendingPayload: Payload | null = null;
  let timer: TimerHandle | null = null;

  const flush = () => {
    timer = null;
    if (pendingPayload === null) return;

    const payload = pendingPayload;
    pendingPayload = null;
    lastEmittedAt = now();
    emit(payload);
  };

  return {
    cancel() {
      pendingPayload = null;
      if (timer !== null) {
        cancelSchedule(timer);
        timer = null;
      }
    },
    push(payload) {
      const elapsed = now() - lastEmittedAt;
      if (elapsed >= SQL_ERD_TABLE_MOVE_PREVIEW_INTERVAL_MS) {
        if (timer !== null) {
          cancelSchedule(timer);
          timer = null;
        }
        pendingPayload = null;
        lastEmittedAt = now();
        emit(payload);
        return;
      }

      pendingPayload = payload;
      if (timer !== null) return;

      timer = schedule(
        flush,
        SQL_ERD_TABLE_MOVE_PREVIEW_INTERVAL_MS - elapsed
      );
    }
  };
}
