import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { runGithubSyncWorkerLoop } = require("../../dist/modules/github-integration/github-sync-worker-loop.js");
const root = fileURLToPath(new URL("../../../..", import.meta.url));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

async function nextTick() {
  await new Promise((resolve) => setImmediate(resolve));
}

{
  let stopping = false;
  let waitCalls = 0;

  await runGithubSyncWorkerLoop(
    "sync_jobs",
    async () => {
      stopping = true;
      throw new Error("poll failed while shutdown was requested");
    },
    {
      emitWorkerPollRetry() {}
    },
    () => stopping,
    async () => {
      waitCalls += 1;
    }
  );

  assert.equal(
    waitCalls,
    0,
    "the worker must not start retry backoff after stop was requested during a failed poll"
  );
}

{
  const stopSignal = new AbortController();
  let stopping = false;
  let retryWaitResolve;
  let retryWaitStarted = false;

  const loop = runGithubSyncWorkerLoop(
    "sync_jobs",
    async () => {
      throw new Error("poll failed before shutdown");
    },
    {
      emitWorkerPollRetry() {}
    },
    () => stopping,
    async (_milliseconds, signal) => {
      retryWaitStarted = true;
      return new Promise((resolve) => {
        retryWaitResolve = resolve;
        signal?.addEventListener("abort", resolve, { once: true });
      });
    },
    stopSignal.signal
  );

  await nextTick();

  assert.equal(retryWaitStarted, true);
  stopping = true;
  stopSignal.abort();

  const settled = await Promise.race([
    loop.then(() => true),
    nextTick().then(() => false)
  ]);

  if (!settled) {
    retryWaitResolve();
    await loop;
  }

  assert.equal(
    settled,
    true,
    "the worker must interrupt retry backoff when stop is requested"
  );
}

{
  const syncFirstPoll = deferred();
  const webhookFirstPoll = deferred();
  const syncRetryWait = deferred();

  const observerCalls = [];
  let activePolls = 0;
  let syncActive = 0;
  let webhookActive = 0;
  let syncMaxActive = 0;
  let webhookMaxActive = 0;
  let combinedActive = 0;
  let syncStopping = false;
  let webhookStopping = false;
  let webhookPollsCompleted = 0;

  const refreshActiveCounts = () => {
    syncMaxActive = Math.max(syncMaxActive, syncActive);
    webhookMaxActive = Math.max(webhookMaxActive, webhookActive);
    combinedActive = Math.max(combinedActive, activePolls);
  };

  const syncLoop = runGithubSyncWorkerLoop(
    "sync_jobs",
    async () => {
      activePolls += 1;
      syncActive += 1;
      refreshActiveCounts();
      try {
        await syncFirstPoll.promise;
        const error = new Error("database session pool exhausted");
        error.code = "EMAXCONNSESSION";
        throw error;
      } finally {
        syncActive -= 1;
        activePolls -= 1;
      }
    },
    {
      emitWorkerPollRetry(queueKind, retryAfterMilliseconds, failureKind) {
        observerCalls.push({
          queueKind,
          retryAfterMilliseconds,
          failureKind
        });
      }
    },
    () => syncStopping,
    async () => {
      await syncRetryWait.promise;
    }
  );

  const webhookLoop = runGithubSyncWorkerLoop(
    "webhooks",
    async () => {
      activePolls += 1;
      webhookActive += 1;
      refreshActiveCounts();
      try {
        await webhookFirstPoll.promise;
        webhookPollsCompleted += 1;
        webhookStopping = true;
      } finally {
        webhookActive -= 1;
        activePolls -= 1;
      }
    },
    {
      emitWorkerPollRetry(queueKind, retryAfterMilliseconds, failureKind) {
        observerCalls.push({
          queueKind,
          retryAfterMilliseconds,
          failureKind
        });
      }
    },
    () => webhookStopping
  );

  await nextTick();

  assert.equal(syncMaxActive, 1);
  assert.equal(webhookMaxActive, 1);
  assert.equal(combinedActive, 2);

  syncFirstPoll.resolve();
  await nextTick();

  assert.deepEqual(observerCalls, [{
    queueKind: "sync_jobs",
    retryAfterMilliseconds: 1000,
    failureKind: "database_session_pool_exhausted"
  }]);

  webhookFirstPoll.resolve();
  await webhookLoop;

  assert.equal(
    webhookPollsCompleted,
    1,
    "the webhook loop must complete while the sync job loop is waiting to retry"
  );

  syncStopping = true;
  syncRetryWait.resolve();
  await syncLoop;
}

{
  const workerMainSource = readFileSync(
    `${root}/apps/app-server/src/github-sync-worker-main.ts`,
    "utf8"
  );

  assert.equal(
    workerMainSource.match(/Promise\.all\(/g)?.length ?? 0,
    1,
    "GitHub sync worker bootstrap must start both queue loops in one Promise.all"
  );
  assert.match(workerMainSource, /pollSyncJobQueueOnce/);
  assert.match(workerMainSource, /pollWebhookQueueOnce/);
}

console.log("GitHub sync worker loop concurrency tests passed");
