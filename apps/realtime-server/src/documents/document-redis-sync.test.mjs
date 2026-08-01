import assert from "node:assert/strict";
import test from "node:test";

import { createDocumentRedisSync } from "../../dist/documents/document-redis-sync.js";

test("returns no extension when document Redis sync is disabled", async () => {
  let createCalls = 0;
  const sync = createDocumentRedisSync({
    createExtension() {
      createCalls += 1;
      return { async onDestroy() {} };
    },
    enabled: false,
    eventLogger() {},
    instanceId: "realtime-a",
    redisUrl: "redis://localhost:6379",
  });

  assert.deepEqual(sync.extensions, []);
  assert.equal(sync.status, "disabled");
  assert.equal(createCalls, 0);
  await sync.close();
});

test("creates one identified Redis extension from a rediss URL", async () => {
  const configurations = [];
  const events = [];
  let destroyCalls = 0;
  const extension = {
    async onDestroy() {
      destroyCalls += 1;
    },
  };
  const sync = createDocumentRedisSync({
    createExtension(configuration) {
      configurations.push(configuration);
      return extension;
    },
    enabled: true,
    eventLogger: (event) => events.push(event),
    instanceId: "realtime-a",
    redisUrl: "rediss://sync-user:sync-password@redis.example.test:6380/2",
  });

  assert.deepEqual(sync.extensions, [extension]);
  assert.equal(sync.status, "ready");
  assert.deepEqual(configurations, [
    {
      host: "redis.example.test",
      identifier: "realtime-a",
      lockTimeout: 10_000,
      options: {
        db: 2,
        password: "sync-password",
        tls: {},
        username: "sync-user",
      },
      port: 6380,
    },
  ]);
  assert.deepEqual(events, [{ event: "document_redis_sync_ready", status: "ready" }]);
  assert.equal(JSON.stringify(events).includes("sync-password"), false);

  await sync.close();
  await sync.close();
  assert.equal(destroyCalls, 1, "Redis resources must close exactly once");
});

test("uses Redis defaults for an uncredentialed URL", () => {
  const configurations = [];
  createDocumentRedisSync({
    createExtension(configuration) {
      configurations.push(configuration);
      return { async onDestroy() {} };
    },
    enabled: true,
    eventLogger() {},
    instanceId: "realtime-b",
    redisUrl: "redis://localhost",
  });

  assert.deepEqual(configurations, [
    {
      host: "localhost",
      identifier: "realtime-b",
      lockTimeout: 10_000,
      options: {},
      port: 6379,
    },
  ]);
});

test("waits for a peer checkpoint lock instead of skipping persistence hooks", async () => {
  let lockAttempts = 0;
  const extension = {
    async onDestroy() {},
    async onStoreDocument() {
      lockAttempts += 1;
      if (lockAttempts < 3) {
        const error = new Error("Another instance is already storing this document");
        error.name = "SkipFurtherHooksError";
        throw error;
      }
    },
  };
  const sync = createDocumentRedisSync({
    createExtension() {
      return extension;
    },
    enabled: true,
    eventLogger() {},
    instanceId: "realtime-b",
    lockRetryDelayMs: 0,
    redisUrl: "redis://localhost:6379",
  });

  await sync.extensions[0].onStoreDocument({ documentName: "document-1" });

  assert.equal(lockAttempts, 3);
});

test("does not retry an unexpected Redis store error", async () => {
  let lockAttempts = 0;
  const expectedError = new Error("Redis connection lost");
  const sync = createDocumentRedisSync({
    createExtension() {
      return {
        async onDestroy() {},
        async onStoreDocument() {
          lockAttempts += 1;
          throw expectedError;
        },
      };
    },
    enabled: true,
    eventLogger() {},
    instanceId: "realtime-b",
    lockRetryDelayMs: 0,
    redisUrl: "redis://localhost:6379",
  });

  await assert.rejects(
    () => sync.extensions[0].onStoreDocument({ documentName: "document-1" }),
    expectedError,
  );
  assert.equal(lockAttempts, 1);
});
