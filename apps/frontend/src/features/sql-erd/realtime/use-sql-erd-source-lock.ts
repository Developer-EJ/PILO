"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SqlErdSourceLockPayload } from "@/features/sql-erd/api/client";

export const SOURCE_LOCK_RENEW_INTERVAL_MS = 10_000;

export type SqlErdSourceLockState =
  | { status: "disabled" }
  | { status: "acquiring" }
  | { lease: SqlErdSourceLockPayload; status: "held" }
  | { message: string; status: "read_only" };

type SourceLockClient = {
  acquireSourceLock: (leaseId: string) => Promise<SqlErdSourceLockPayload>;
  releaseSourceLock: (leaseId: string) => Promise<unknown>;
  renewSourceLock: (leaseId: string) => Promise<SqlErdSourceLockPayload>;
};

function createLeaseId() {
  return crypto.randomUUID();
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "SQL source is read-only.";
}

export function useSqlErdSourceLock({
  active,
  client
}: {
  active: boolean;
  client: SourceLockClient;
}) {
  const [state, setState] = useState<SqlErdSourceLockState>({ status: "disabled" });
  const clientRef = useRef(client);
  const leaseIdRef = useRef<string | null>(null);

  const renew = useCallback(async () => {
    const leaseId = leaseIdRef.current;
    if (!leaseId) return;

    try {
      const lease = await clientRef.current.renewSourceLock(leaseId);
      if (leaseIdRef.current === leaseId) {
        setState({ lease, status: "held" });
      }
    } catch (error) {
      if (leaseIdRef.current === leaseId) {
        setState({ message: readErrorMessage(error), status: "read_only" });
      }
    }
  }, []);

  useEffect(() => {
    clientRef.current = client;
  }, [client]);

  useEffect(() => {
    if (!active) {
      setState({ status: "disabled" });
      return;
    }

    let disposed = false;
    const leaseId = createLeaseId();
    leaseIdRef.current = leaseId;
    setState({ status: "acquiring" });

    void clientRef.current
      .acquireSourceLock(leaseId)
      .then((lease) => {
        if (!disposed && leaseIdRef.current === leaseId) {
          setState({ lease, status: "held" });
        }
      })
      .catch((error: unknown) => {
        if (!disposed && leaseIdRef.current === leaseId) {
          setState({ message: readErrorMessage(error), status: "read_only" });
        }
      });

    const renewTimer = window.setInterval(() => {
      if (disposed || leaseIdRef.current !== leaseId) return;

      void renew();
    }, SOURCE_LOCK_RENEW_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(renewTimer);
      if (leaseIdRef.current === leaseId) {
        leaseIdRef.current = null;
        void clientRef.current.releaseSourceLock(leaseId).catch(() => undefined);
      }
    };
  }, [active, renew]);

  return useMemo(
    () => ({
      ...state,
      canEdit: state.status === "held",
      renew
    }),
    [renew, state]
  );
}
