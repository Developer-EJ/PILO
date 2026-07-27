"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createSqlErdSourceLockController,
  type SqlErdSourceLockClient,
  type SqlErdSourceLockState
} from "./source-lock-controller";

export const SOURCE_LOCK_RENEW_INTERVAL_MS = 10_000;

function createLeaseId() {
  return crypto.randomUUID();
}

export function useSqlErdSourceLock({
  active,
  client
}: {
  active: boolean;
  client: SqlErdSourceLockClient;
}) {
  const [state, setState] = useState<SqlErdSourceLockState>({ status: "disabled" });
  const controllerRef = useRef<ReturnType<typeof createSqlErdSourceLockController> | null>(
    null
  );
  const lifecycleTailRef = useRef<Promise<unknown>>(Promise.resolve());

  const setLockState = useCallback((nextState: SqlErdSourceLockState) => {
    setState(nextState);
  }, []);

  const renew = useCallback(async () => {
    await controllerRef.current?.renew();
  }, []);

  const recover = useCallback(async () => {
    await controllerRef.current?.recover();
  }, []);

  useEffect(() => {
    let isCurrentController = true;
    const controller = createSqlErdSourceLockController({
      client,
      createLeaseId,
      onStateChange: (nextState) => {
        if (isCurrentController) setLockState(nextState);
      }
    });
    controllerRef.current = controller;

    const enqueueLifecycle = (transition: () => Promise<unknown>) => {
      const result = lifecycleTailRef.current.then(transition, transition);
      lifecycleTailRef.current = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    };

    if (!active) {
      setLockState({ status: "disabled" });
      return () => {
        isCurrentController = false;
        if (controllerRef.current === controller) controllerRef.current = null;
        void enqueueLifecycle(() => controller.stop());
      };
    }

    void enqueueLifecycle(() => controller.start());
    const renewTimer = window.setInterval(() => {
      void controller.tick();
    }, SOURCE_LOCK_RENEW_INTERVAL_MS);

    return () => {
      isCurrentController = false;
      window.clearInterval(renewTimer);
      if (controllerRef.current === controller) controllerRef.current = null;
      void enqueueLifecycle(() => controller.stop());
    };
  }, [active, client, setLockState]);

  return useMemo(
    () => ({
      ...state,
      canEdit: state.status === "held",
      recover,
      renew
    }),
    [recover, renew, state]
  );
}
