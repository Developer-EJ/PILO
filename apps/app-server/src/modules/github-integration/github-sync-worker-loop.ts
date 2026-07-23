export type GithubSyncWorkerFailureKind =
  | "database_session_pool_exhausted"
  | "unknown";

export type GithubSyncWorkerQueueKind = "sync_jobs" | "webhooks";
export type GithubSyncWorkerPollOnce = () => Promise<void>;

export interface GithubSyncWorkerPollObserver {
  emitWorkerPollRetry(
    queueKind: GithubSyncWorkerQueueKind,
    retryAfterMilliseconds: number,
    failureKind: GithubSyncWorkerFailureKind
  ): void;
}

const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 15_000;

type GithubSyncWorkerWait = (
  milliseconds: number,
  stopSignal?: AbortSignal
) => Promise<void>;

export async function runGithubSyncWorkerLoop(
  queueKind: GithubSyncWorkerQueueKind,
  pollOnce: GithubSyncWorkerPollOnce,
  observer: GithubSyncWorkerPollObserver,
  isStopping: () => boolean,
  wait: GithubSyncWorkerWait = waitForRetry,
  stopSignal?: AbortSignal
): Promise<void> {
  let retryDelayMs = INITIAL_RETRY_DELAY_MS;

  while (!isStopping()) {
    try {
      await pollOnce();
      retryDelayMs = INITIAL_RETRY_DELAY_MS;
    } catch (error) {
      if (isStopping()) {
        break;
      }
      observer.emitWorkerPollRetry(
        queueKind,
        retryDelayMs,
        classifyGithubSyncWorkerFailure(error)
      );
      await wait(retryDelayMs, stopSignal);
      retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS);
    }
  }
}

export function classifyGithubSyncWorkerFailure(
  error: unknown
): GithubSyncWorkerFailureKind {
  if (hasErrorCode(error, "EMAXCONNSESSION")) {
    return "database_session_pool_exhausted";
  }

  if (error instanceof Error && error.message.includes("EMAXCONNSESSION")) {
    return "database_session_pool_exhausted";
  }

  return "unknown";
}

function hasErrorCode(error: unknown, expectedCode: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === expectedCode
  );
}

function waitForRetry(
  milliseconds: number,
  stopSignal?: AbortSignal
): Promise<void> {
  if (stopSignal?.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(finish, milliseconds);

    function finish(): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      stopSignal?.removeEventListener("abort", finish);
      resolve();
    }

    stopSignal?.addEventListener("abort", finish, { once: true });
  });
}
