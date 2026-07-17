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
