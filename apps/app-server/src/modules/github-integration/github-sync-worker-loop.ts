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

type GithubSyncWorkerWait = (milliseconds: number) => Promise<void>;
type LegacyGithubSyncWorkerPoller = {
  pollOnce(): Promise<void>;
};

export async function runGithubSyncWorkerLoop(
  queueKind: GithubSyncWorkerQueueKind,
  pollOnce: GithubSyncWorkerPollOnce,
  observer: GithubSyncWorkerPollObserver,
  isStopping: () => boolean,
  wait?: GithubSyncWorkerWait
): Promise<void>;
export async function runGithubSyncWorkerLoop(
  worker: LegacyGithubSyncWorkerPoller,
  observer: GithubSyncWorkerPollObserver,
  isStopping: () => boolean,
  wait?: GithubSyncWorkerWait
): Promise<void>;
export async function runGithubSyncWorkerLoop(
  queueKindOrWorker: GithubSyncWorkerQueueKind | LegacyGithubSyncWorkerPoller,
  pollOnceOrObserver: GithubSyncWorkerPollOnce | GithubSyncWorkerPollObserver,
  observerOrIsStopping: GithubSyncWorkerPollObserver | (() => boolean),
  isStoppingOrWait?: (() => boolean) | GithubSyncWorkerWait,
  wait?: GithubSyncWorkerWait
): Promise<void> {
  const queueKind =
    typeof queueKindOrWorker === "string" ? queueKindOrWorker : "sync_jobs";
  const pollOnce =
    typeof queueKindOrWorker === "string"
      ? (pollOnceOrObserver as GithubSyncWorkerPollOnce)
      : () => queueKindOrWorker.pollOnce();
  const observer =
    typeof queueKindOrWorker === "string"
      ? (observerOrIsStopping as GithubSyncWorkerPollObserver)
      : (pollOnceOrObserver as GithubSyncWorkerPollObserver);
  const isStopping =
    typeof queueKindOrWorker === "string"
      ? (isStoppingOrWait as () => boolean)
      : (observerOrIsStopping as () => boolean);
  const waitForDelay =
    typeof queueKindOrWorker === "string"
      ? wait ?? waitForRetry
      : (isStoppingOrWait as GithubSyncWorkerWait | undefined) ?? waitForRetry;
  let retryDelayMs = INITIAL_RETRY_DELAY_MS;

  while (!isStopping()) {
    try {
      await pollOnce();
      retryDelayMs = INITIAL_RETRY_DELAY_MS;
    } catch (error) {
      observer.emitWorkerPollRetry(
        queueKind,
        retryDelayMs,
        classifyGithubSyncWorkerFailure(error)
      );
      await waitForDelay(retryDelayMs);
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

function waitForRetry(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
