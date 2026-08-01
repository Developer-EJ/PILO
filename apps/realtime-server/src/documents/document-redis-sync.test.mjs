import assert from "node:assert/strict";
import test from "node:test";

import { createDocumentRedisSync } from "../../dist/documents/document-redis-sync.js";

function createFakeClient(overrides = {}) {
  const listeners = new Map();
  const calls = { destroy: 0, eval: [], quit: 0, set: [] };
  const client = {
    async connect() {
      listeners.get("ready")?.();
    },
    destroy() {
      calls.destroy += 1;
    },
    async eval(script, options) {
      calls.eval.push({ options, script });
      return 1;
    },
    on(event, listener) {
      listeners.set(event, listener);
    },
    async ping() {
      return "PONG";
    },
    async quit() {
      calls.quit += 1;
    },
    async set(key, value, options) {
      calls.set.push({ key, options, value });
      return "OK";
    },
    ...overrides,
  };
  return { calls, client, emit: (event) => listeners.get(event)?.() };
}

function createFakeTransport(initialStatus = "ready") {
  const listeners = new Map();
  return {
    client: {
      status: initialStatus,
      on(event, listener) {
        const eventListeners = listeners.get(event) ?? [];
        eventListeners.push(listener);
        listeners.set(event, eventListeners);
      },
    },
    emit(event) {
      if (event === "ready") this.client.status = "ready";
      if (["close", "end", "error", "reconnecting"].includes(event)) {
        this.client.status = "reconnecting";
      }
      for (const listener of listeners.get(event) ?? []) listener();
    },
  };
}

function createFakeExtension(overrides = {}) {
  const pub = createFakeTransport();
  const sub = createFakeTransport();
  return {
    extension: {
      async onDestroy() {},
      pub: pub.client,
      sub: sub.client,
      ...overrides,
    },
    pub,
    sub,
  };
}

test("returns no Redis resources when document sync is disabled", async () => {
  let createCalls = 0;
  const sync = await createDocumentRedisSync({
    createCommandClient() {
      createCalls += 1;
      throw new Error("must not create a client");
    },
    enabled: false,
    eventLogger() {},
    instanceId: "realtime-a",
    redisUrl: "redis://localhost:6379",
  });

  assert.deepEqual(sync.extensions, []);
  assert.equal(sync.checkpointCoordinator, null);
  assert.equal(sync.status, "disabled");
  assert.equal(createCalls, 0);
  await sync.close();
});

test("probes Redis before reporting ready and creates the sync extension", async () => {
  const configurations = [];
  const events = [];
  let destroyCalls = 0;
  const fake = createFakeClient();
  const { extension } = createFakeExtension({
    async onDestroy() {
      destroyCalls += 1;
    },
    async onStoreDocument() {
      throw new Error("official non-renewing store lock must be replaced");
    },
  });
  const sync = await createDocumentRedisSync({
    createCommandClient: () => fake.client,
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
      lockTimeout: 30_000,
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
  await sync.extensions[0].onStoreDocument({ documentName: "document-1" });

  await sync.close();
  await sync.close();
  assert.equal(destroyCalls, 1);
  assert.equal(fake.calls.quit, 1);
});

test("waits for both Yjs Redis pub/sub transports before reporting ready", async () => {
  const fake = createFakeClient();
  const pub = createFakeTransport("connecting");
  const sub = createFakeTransport("connecting");
  const extension = {
    async onDestroy() {},
    pub: pub.client,
    sub: sub.client,
  };
  let settled = false;
  const creating = createDocumentRedisSync({
    connectTimeoutMs: 100,
    createCommandClient: () => fake.client,
    createExtension: () => extension,
    enabled: true,
    eventLogger() {},
    instanceId: "realtime-pub-sub",
    redisUrl: "redis://localhost",
  }).then((sync) => {
    settled = true;
    return sync;
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  pub.emit("ready");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  sub.emit("ready");

  const sync = await creating;
  assert.equal(sync.status, "ready");
  await sync.close();
});

test("latches Redis sync unavailable after Yjs pub/sub reconnects", async () => {
  const fake = createFakeClient();
  const extension = createFakeExtension();
  const sync = await createDocumentRedisSync({
    createCommandClient: () => fake.client,
    createExtension: () => extension.extension,
    enabled: true,
    eventLogger() {},
    instanceId: "realtime-pub-sub",
    redisUrl: "redis://localhost",
  });

  extension.sub.emit("reconnecting");
  assert.equal(sync.status, "unavailable");
  extension.sub.emit("ready");
  assert.equal(sync.status, "unavailable");
  await sync.close();
});

test("fails startup and closes resources when Yjs pub/sub never becomes ready", async () => {
  const fake = createFakeClient();
  const pub = createFakeTransport("connecting");
  const sub = createFakeTransport("connecting");
  let extensionDestroyCalls = 0;

  await assert.rejects(
    createDocumentRedisSync({
      commandTimeoutMs: 5,
      connectTimeoutMs: 5,
      createCommandClient: () => fake.client,
      createExtension: () => ({
        async onDestroy() { extensionDestroyCalls += 1; },
        pub: pub.client,
        sub: sub.client,
      }),
      enabled: true,
      eventLogger() {},
      instanceId: "realtime-pub-sub-timeout",
      redisUrl: "redis://localhost",
    }),
    /Redis Yjs pub\/sub readiness timed out/,
  );

  assert.equal(extensionDestroyCalls, 1);
  assert.equal(fake.calls.destroy, 1);
});

test("fails startup when the Redis readiness probe fails", async () => {
  const expectedError = new Error("Redis unavailable");
  const fake = createFakeClient({
    async connect() {
      throw expectedError;
    },
  });

  await assert.rejects(
    () =>
      createDocumentRedisSync({
        createCommandClient: () => fake.client,
        enabled: true,
        eventLogger() {},
        instanceId: "realtime-a",
        redisUrl: "redis://localhost:6379",
      }),
    expectedError,
  );
  assert.equal(fake.calls.destroy, 1);
});

test("marks an enabled runtime unavailable on reconnecting", async () => {
  const events = [];
  const fake = createFakeClient();
  const sync = await createDocumentRedisSync({
    createCommandClient: () => fake.client,
    createExtension: () => createFakeExtension().extension,
    enabled: true,
    eventLogger: (event) => events.push(event),
    instanceId: "realtime-b",
    redisUrl: "redis://localhost",
  });

  fake.emit("reconnecting");

  assert.equal(sync.status, "unavailable");
  assert.deepEqual(events.at(-1), {
    event: "document_redis_sync_unavailable",
    status: "unavailable",
  });
  await sync.close();
});

test("renews and finally releases the document checkpoint lease", async () => {
  const fake = createFakeClient();
  const sync = await createDocumentRedisSync({
    createCommandClient: () => fake.client,
    createExtension: () => createFakeExtension().extension,
    enabled: true,
    eventLogger() {},
    instanceId: "realtime-b",
    leaseDurationMs: 9,
    redisUrl: "redis://localhost",
  });

  const result = await sync.checkpointCoordinator.runExclusive(
    "workspace-1:document-1",
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 14));
      return "saved";
    },
  );

  assert.equal(result, "saved");
  assert.equal(fake.calls.set.length, 1);
  assert.ok(fake.calls.eval.some(({ script }) => script.includes("pexpire")));
  assert.ok(fake.calls.eval.some(({ script }) => script.includes("del")));
  await sync.close();
});

test("waits for a peer lease before entering the checkpoint", async () => {
  let attempts = 0;
  const fake = createFakeClient({
    async set() {
      attempts += 1;
      return attempts < 3 ? null : "OK";
    },
  });
  const sync = await createDocumentRedisSync({
    createCommandClient: () => fake.client,
    createExtension: () => createFakeExtension().extension,
    enabled: true,
    eventLogger() {},
    instanceId: "realtime-b",
    lockRetryDelayMs: 0,
    redisUrl: "redis://localhost",
  });

  await sync.checkpointCoordinator.runExclusive("document-1", async () => undefined);

  assert.equal(attempts, 3);
  await sync.close();
});

test("bounds a checkpoint lock acquisition when Redis never answers", async () => {
  const fake = createFakeClient({
    async set() {
      return new Promise(() => undefined);
    },
  });
  const sync = await createDocumentRedisSync({
    commandTimeoutMs: 5,
    createCommandClient: () => fake.client,
    createExtension: () => createFakeExtension().extension,
    enabled: true,
    eventLogger() {},
    instanceId: "realtime-b",
    redisUrl: "redis://localhost",
  });

  await assert.rejects(
    () => sync.checkpointCoordinator.runExclusive("document-1", async () => undefined),
    /Redis checkpoint lock acquisition timed out/,
  );
  assert.equal(sync.status, "unavailable");
  await sync.close();
});

test("rejects a checkpoint when lease renewal never answers", async () => {
  const fake = createFakeClient({
    async eval(script) {
      if (script.includes("pexpire")) return new Promise(() => undefined);
      return 1;
    },
  });
  const sync = await createDocumentRedisSync({
    commandTimeoutMs: 5,
    createCommandClient: () => fake.client,
    createExtension: () => createFakeExtension().extension,
    enabled: true,
    eventLogger() {},
    instanceId: "realtime-b",
    leaseDurationMs: 9,
    redisUrl: "redis://localhost",
  });

  await assert.rejects(
    () =>
      sync.checkpointCoordinator.runExclusive("document-1", async () => {
        await new Promise((resolve) => setTimeout(resolve, 14));
      }),
    /Document checkpoint lock ownership lost/,
  );
  assert.equal(sync.status, "unavailable");
  await sync.close();
});

test("rejects a checkpoint when a delayed renewal reports lost ownership", async () => {
  const fake = createFakeClient({
    async eval(script) {
      if (script.includes("pexpire")) {
        await new Promise((resolve) => setTimeout(resolve, 6));
        return 0;
      }
      return 1;
    },
  });
  const sync = await createDocumentRedisSync({
    commandTimeoutMs: 20,
    createCommandClient: () => fake.client,
    createExtension: () => createFakeExtension().extension,
    enabled: true,
    eventLogger() {},
    instanceId: "realtime-b",
    leaseDurationMs: 9,
    redisUrl: "redis://localhost",
  });

  await assert.rejects(
    () =>
      sync.checkpointCoordinator.runExclusive("document-1", async () => {
        await new Promise((resolve) => setTimeout(resolve, 12));
      }),
    /Document checkpoint lock ownership lost/,
  );
  await sync.close();
});

test("bounds checkpoint lease release when Redis never answers", async () => {
  const fake = createFakeClient({
    async eval(script) {
      if (script.includes("del")) return new Promise(() => undefined);
      return 1;
    },
  });
  const sync = await createDocumentRedisSync({
    commandTimeoutMs: 5,
    createCommandClient: () => fake.client,
    createExtension: () => createFakeExtension().extension,
    enabled: true,
    eventLogger() {},
    instanceId: "realtime-b",
    redisUrl: "redis://localhost",
  });

  const result = await sync.checkpointCoordinator.runExclusive(
    "document-1",
    async () => "saved",
  );

  assert.equal(result, "saved");
  assert.equal(sync.status, "unavailable");
  await sync.close();
});

test("forces command client destruction when Redis quit never answers", async () => {
  const fake = createFakeClient({
    async quit() {
      return new Promise(() => undefined);
    },
  });
  const sync = await createDocumentRedisSync({
    commandTimeoutMs: 5,
    createCommandClient: () => fake.client,
    createExtension: () => createFakeExtension().extension,
    enabled: true,
    eventLogger() {},
    instanceId: "realtime-b",
    redisUrl: "redis://localhost",
  });

  await sync.close();

  assert.equal(fake.calls.destroy, 1);
});
