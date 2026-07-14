"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createSqlErdRealtimeSocket,
  getSqlErdRealtimeServerUrl,
  type SqlErdRealtimeSocket
} from "./sql-erd-realtime-client";
import type {
  SqlErdOperationPayload,
  SqlErdRealtimeConfig
} from "./sql-erd-realtime-types";

export type SqlErdOperationCatchupPayload = {
  items: SqlErdOperationPayload[];
  latestOpSeq: number;
  nextAfterSeq: number | null;
};

export type SqlErdOperationSyncState = {
  lastError: string | null;
  lastSeenOpSeq: number;
  latestOpSeq: number;
  status: "disabled" | "idle" | "catching_up" | "caught_up" | "failed";
};

type SqlErdOperationSyncOptions = {
  applyOperations: (operations: SqlErdOperationPayload[]) => Promise<void> | void;
  catchUpOperations: (
    afterSeq: number,
    signal?: AbortSignal
  ) => Promise<SqlErdOperationCatchupPayload>;
  initialLatestOpSeq: number;
  writeProtocol: "snapshot" | "operations_v1";
};

const disabledState: SqlErdOperationSyncState = {
  lastError: null,
  lastSeenOpSeq: 0,
  latestOpSeq: 0,
  status: "disabled"
};

function isUsableConfig(
  config: SqlErdRealtimeConfig | null | undefined
): config is SqlErdRealtimeConfig & {
  authToken: string;
  currentUser: NonNullable<SqlErdRealtimeConfig["currentUser"]>;
} {
  return Boolean(
    config?.enabled &&
      config.workspaceId.trim() &&
      config.sessionId.trim() &&
      config.authToken?.trim() &&
      config.currentUser?.userId.trim()
  );
}

function normalizeSequence(value: number) {
  return Math.max(0, Math.trunc(value));
}

function isSameRoom(
  payload: { sessionId: string; workspaceId: string },
  room: { sessionId: string; workspaceId: string }
) {
  return payload.sessionId === room.sessionId && payload.workspaceId === room.workspaceId;
}

function getContiguousOperations(
  operations: SqlErdOperationPayload[],
  afterSeq: number
) {
  const contiguous: SqlErdOperationPayload[] = [];
  let nextSeq = normalizeSequence(afterSeq);

  operations
    .slice()
    .sort((left, right) => left.opSeq - right.opSeq)
    .forEach((operation) => {
      if (operation.opSeq !== nextSeq + 1) return;
      contiguous.push(operation);
      nextSeq = operation.opSeq;
    });

  return { contiguous, nextSeq };
}

export function useSqlErdOperationSync(
  config: SqlErdRealtimeConfig | null | undefined,
  {
    applyOperations,
    catchUpOperations,
    initialLatestOpSeq,
    writeProtocol
  }: SqlErdOperationSyncOptions
) {
  const [state, setState] = useState<SqlErdOperationSyncState>(disabledState);
  const socketRef = useRef<SqlErdRealtimeSocket | null>(null);
  const lastSeenOpSeqRef = useRef(0);
  const liveOperationBufferRef = useRef<SqlErdOperationPayload[]>([]);
  const activeCatchUpAbortRef = useRef<AbortController | null>(null);
  const applyOperationsRef = useRef(applyOperations);
  const catchUpOperationsRef = useRef(catchUpOperations);
  const runCatchUpRef = useRef<(afterSeq: number) => void>(() => {});
  const usableConfig = useMemo(
    () => (isUsableConfig(config) ? config : null),
    [
      config?.authToken,
      config?.currentUser?.displayName,
      config?.currentUser?.userId,
      config?.enabled,
      config?.sessionId,
      config?.workspaceId
    ]
  );
  const enabled = Boolean(
    usableConfig &&
      writeProtocol === "operations_v1" &&
      getSqlErdRealtimeServerUrl()
  );

  useEffect(() => {
    applyOperationsRef.current = applyOperations;
    catchUpOperationsRef.current = catchUpOperations;
  }, [applyOperations, catchUpOperations]);

  const setLastSeen = useCallback((nextSequence: number) => {
    const normalized = normalizeSequence(nextSequence);
    lastSeenOpSeqRef.current = normalized;
    setState((current) => ({
      ...current,
      lastError: null,
      lastSeenOpSeq: normalized,
      latestOpSeq: Math.max(current.latestOpSeq, normalized)
    }));
  }, []);

  const flushBufferedOperations = useCallback(async () => {
    const { contiguous, nextSeq } = getContiguousOperations(
      liveOperationBufferRef.current,
      lastSeenOpSeqRef.current
    );
    if (!contiguous.length) return;

    await applyOperationsRef.current(contiguous);
    liveOperationBufferRef.current = liveOperationBufferRef.current.filter(
      (operation) => operation.opSeq > nextSeq
    );
    setLastSeen(nextSeq);
  }, [setLastSeen]);

  const runCatchUp = useCallback(
    (afterSeq: number) => {
      activeCatchUpAbortRef.current?.abort();
      const abortController = new AbortController();
      activeCatchUpAbortRef.current = abortController;
      const normalizedAfterSeq = normalizeSequence(afterSeq);
      setState((current) => ({
        ...current,
        lastError: null,
        status: "catching_up"
      }));

      void catchUpOperationsRef.current(normalizedAfterSeq, abortController.signal)
        .then(async (payload) => {
          if (abortController.signal.aborted) return;
          const { contiguous, nextSeq } = getContiguousOperations(
            payload.items,
            normalizedAfterSeq
          );
          if (contiguous.length) {
            await applyOperationsRef.current(contiguous);
          }
          if (abortController.signal.aborted) return;

          lastSeenOpSeqRef.current = nextSeq;
          setState({
            lastError: null,
            lastSeenOpSeq: nextSeq,
            latestOpSeq: Math.max(payload.latestOpSeq, nextSeq),
            status: "caught_up"
          });
          await flushBufferedOperations();

          if (liveOperationBufferRef.current.length) {
            runCatchUpRef.current(lastSeenOpSeqRef.current);
          }
        })
        .catch((error: unknown) => {
          if (abortController.signal.aborted) return;
          setState((current) => ({
            ...current,
            lastError:
              error instanceof Error ? error.message : "SQLtoERD operation catch-up failed.",
            status: "failed"
          }));
        })
        .finally(() => {
          if (activeCatchUpAbortRef.current === abortController) {
            activeCatchUpAbortRef.current = null;
          }
        });
    },
    [flushBufferedOperations]
  );

  useEffect(() => {
    runCatchUpRef.current = runCatchUp;
  }, [runCatchUp]);

  const reconcileOperation = useCallback(
    (operation: SqlErdOperationPayload) => {
      const lastSeen = lastSeenOpSeqRef.current;
      if (operation.opSeq <= lastSeen) return;

      setState((current) => ({
        ...current,
        latestOpSeq: Math.max(current.latestOpSeq, operation.opSeq)
      }));
      liveOperationBufferRef.current = [
        ...liveOperationBufferRef.current.filter((entry) => entry.opSeq !== operation.opSeq),
        operation
      ];

      if (activeCatchUpAbortRef.current || operation.opSeq > lastSeen + 1) {
        if (!activeCatchUpAbortRef.current) runCatchUp(lastSeen);
        return;
      }

      void flushBufferedOperations().catch(() => runCatchUp(lastSeen));
    },
    [flushBufferedOperations, runCatchUp]
  );

  useEffect(() => {
    activeCatchUpAbortRef.current?.abort();
    activeCatchUpAbortRef.current = null;
    liveOperationBufferRef.current = [];
    lastSeenOpSeqRef.current = normalizeSequence(initialLatestOpSeq);

    if (!enabled || !usableConfig) {
      setState(disabledState);
      socketRef.current = null;
      return;
    }

    setState({
      lastError: null,
      lastSeenOpSeq: lastSeenOpSeqRef.current,
      latestOpSeq: lastSeenOpSeqRef.current,
      status: "idle"
    });
    const socket = createSqlErdRealtimeSocket({
      authToken: usableConfig.authToken,
      currentUser: usableConfig.currentUser
    });
    if (!socket) return;

    const room = { sessionId: usableConfig.sessionId, workspaceId: usableConfig.workspaceId };
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("sql-erd:join", room));
    socket.on("sql-erd:joined", (payload) => {
      if (!isSameRoom(payload, room)) return;
      setState((current) => ({
        ...current,
        latestOpSeq: Math.max(current.latestOpSeq, payload.latestOpSeq)
      }));
      if (payload.latestOpSeq > lastSeenOpSeqRef.current) {
        runCatchUp(lastSeenOpSeqRef.current);
      }
    });
    socket.on("sql-erd:operation", (operation) => {
      if (isSameRoom(operation, room)) reconcileOperation(operation);
    });
    socket.on("sql-erd:error", (error) => {
      setState((current) => ({ ...current, lastError: error.message }));
    });
    socket.connect();

    return () => {
      activeCatchUpAbortRef.current?.abort();
      activeCatchUpAbortRef.current = null;
      if (socket.connected) socket.emit("sql-erd:leave", room);
      socket.removeAllListeners();
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [enabled, initialLatestOpSeq, reconcileOperation, runCatchUp, usableConfig]);

  return useMemo(
    () => ({ enabled, ...state }),
    [enabled, state]
  );
}
