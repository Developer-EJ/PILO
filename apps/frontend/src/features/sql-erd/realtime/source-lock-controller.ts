import type { SqlErdSourceLockPayload } from "@/features/sql-erd/api/client";

import { getSourceLockIntervalRequest } from "./source-lock-state";

export type SqlErdSourceLockState =
  | { status: "disabled" }
  | { status: "acquiring" }
  | { lease: SqlErdSourceLockPayload; status: "held" }
  | { message: string; status: "read_only" };

export type SqlErdSourceLockClient = {
  acquireSourceLock: (leaseId: string) => Promise<SqlErdSourceLockPayload>;
  releaseSourceLock: (leaseId: string) => Promise<unknown>;
  renewSourceLock: (leaseId: string) => Promise<SqlErdSourceLockPayload>;
};

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "SQL source is read-only.";
}

export function createSqlErdSourceLockController({
  client,
  createLeaseId,
  onStateChange = () => undefined
}: {
  client: SqlErdSourceLockClient;
  createLeaseId: () => string;
  onStateChange?: (state: SqlErdSourceLockState) => void;
}) {
  let active = false;
  let state: SqlErdSourceLockState = { status: "disabled" };
  let currentLeaseId: string | null = null;
  let heldLeaseId: string | null = null;
  let transitionTail: Promise<unknown> = Promise.resolve();

  function enqueueTransition<T>(transition: () => Promise<T> | T) {
    const result = transitionTail.then(transition, transition);
    transitionTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  function setState(nextState: SqlErdSourceLockState) {
    state = nextState;
    onStateChange(nextState);
  }

  async function acquire() {
    const leaseId = createLeaseId();
    currentLeaseId = leaseId;
    heldLeaseId = null;
    setState({ status: "acquiring" });

    try {
      const lease = await client.acquireSourceLock(leaseId);
      if (!active || currentLeaseId !== leaseId) {
        await client.releaseSourceLock(leaseId).catch(() => undefined);
        return;
      }

      heldLeaseId = leaseId;
      setState({ lease, status: "held" });
    } catch (error) {
      if (!active || currentLeaseId !== leaseId) return;

      setState({ message: readErrorMessage(error), status: "read_only" });
    }
  }

  async function renewLease() {
    const leaseId = heldLeaseId;
    if (!leaseId) return;

    try {
      const lease = await client.renewSourceLock(leaseId);
      if (!active || heldLeaseId !== leaseId) return;

      setState({ lease, status: "held" });
    } catch (error) {
      if (!active || heldLeaseId !== leaseId) return;

      heldLeaseId = null;
      setState({ message: readErrorMessage(error), status: "read_only" });
    }
  }

  return {
    getState: () => state,
    recover: async () => {
      currentLeaseId = null;
      if (active) setState({ status: "acquiring" });
      await enqueueTransition(async () => {
        const leaseId = heldLeaseId;
        heldLeaseId = null;
        if (leaseId) {
          await client.releaseSourceLock(leaseId).catch(() => undefined);
        }
        if (!active) {
          setState({ status: "disabled" });
          return;
        }
        await acquire();
      });
    },
    renew: () => enqueueTransition(renewLease),
    start: async () => {
      active = true;
      await enqueueTransition(async () => {
        if (!active || heldLeaseId || state.status === "acquiring") return;
        await acquire();
      });
    },
    stop: async () => {
      active = false;
      currentLeaseId = null;
      setState({ status: "disabled" });
      await enqueueTransition(async () => {
        const leaseId = heldLeaseId;
        heldLeaseId = null;
        if (leaseId) {
          await client.releaseSourceLock(leaseId).catch(() => undefined);
        }
      });
    },
    tick: async () => {
      await enqueueTransition(async () => {
        if (!active) return;

        const request = getSourceLockIntervalRequest(state.status);
        if (request === "acquire") await acquire();
        if (request === "renew") await renewLease();
      });
    }
  };
}
