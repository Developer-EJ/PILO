import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const Y = createRequire(import.meta.url)("yjs");

import {
  DocumentCheckpointError,
  createDocumentCheckpointService,
} from "../../dist/documents/document-checkpoint.service.js";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const documentId = "00000000-0000-0000-0000-000000000002";
const room = { documentId, workspaceId };

function toBase64(update) {
  return Buffer.from(update).toString("base64");
}

function createDocumentWithText(text) {
  const document = new Y.Doc();
  document.getText("checkpoint-test").insert(0, text);
  return document;
}

function readCheckpointText(yjsState) {
  const document = new Y.Doc();
  Y.applyUpdate(document, Buffer.from(yjsState, "base64"));
  return document.getText("checkpoint-test").toString();
}

function bootstrap(document, currentVersion) {
  return {
    document: { currentVersion },
    snapshot: { yjsState: toBase64(Y.encodeStateAsUpdate(document)) },
  };
}

test("stores one room checkpoint with the version loaded from App Server", async () => {
  const saved = [];
  const service = createDocumentCheckpointService({
    client: {
      async getDocument() {
        return bootstrap(createDocumentWithText("initial"), 4);
      },
      async saveDocumentSnapshot(input) {
        saved.push(input);
        return { document: { currentVersion: 5 } };
      },
    },
  });
  const document = createDocumentWithText("edited");

  const initialUpdate = await service.loadDocument({
    accessToken: "session-token",
    room,
  });
  assert.equal(readCheckpointText(toBase64(initialUpdate)), "initial");

  await service.storeDocument({
    accessToken: "session-token",
    document,
    room,
  });

  assert.equal(saved.length, 1);
  assert.equal(saved[0].accessToken, "session-token");
  assert.equal(saved[0].expectedVersion, 4);
  assert.equal(readCheckpointText(saved[0].yjsState), "edited");
  assert.deepEqual(saved[0].contentJson.type, "doc");
});

test("merges the latest snapshot and retries exactly once after a checkpoint 409", async () => {
  const saved = [];
  const latestDocument = createDocumentWithText("remote");
  let getCalls = 0;
  const service = createDocumentCheckpointService({
    client: {
      async getDocument() {
        getCalls += 1;
        return bootstrap(latestDocument, getCalls === 1 ? 1 : 2);
      },
      async saveDocumentSnapshot(input) {
        saved.push(input);
        if (saved.length === 1) {
          throw new DocumentCheckpointError(409, "Document version is outdated");
        }
        return { document: { currentVersion: 3 } };
      },
    },
  });
  const document = createDocumentWithText("local");
  const transactionOrigins = [];
  document.on("afterTransaction", (transaction) => {
    transactionOrigins.push(transaction.origin);
  });

  await service.loadDocument({ accessToken: "session-token", room });
  await service.storeDocument({ accessToken: "session-token", document, room });

  assert.equal(getCalls, 2);
  assert.deepEqual(
    saved.map(({ expectedVersion }) => expectedVersion),
    [1, 2],
  );
  assert.match(readCheckpointText(saved[1].yjsState), /local/);
  assert.match(readCheckpointText(saved[1].yjsState), /remote/);
  assert.deepEqual(
    transactionOrigins.at(-1),
    { skipStoreHooks: true, source: "local" },
  );
});

test("does not retry a second 409 checkpoint conflict", async () => {
  let saveCalls = 0;
  const service = createDocumentCheckpointService({
    client: {
      async getDocument() {
        return bootstrap(createDocumentWithText("remote"), 2);
      },
      async saveDocumentSnapshot() {
        saveCalls += 1;
        throw new DocumentCheckpointError(409, "Document version is outdated");
      },
    },
  });
  const document = createDocumentWithText("local");

  await service.loadDocument({ accessToken: "session-token", room });
  await assert.rejects(
    () => service.storeDocument({ accessToken: "session-token", document, room }),
    /Document version is outdated/,
  );

  assert.equal(saveCalls, 2);
});

test("reports checkpoint start and success with the saved version", async () => {
  const events = [];
  const service = createDocumentCheckpointService({
    eventLogger: (event) => events.push(event),
    client: {
      async getDocument() {
        return bootstrap(createDocumentWithText("initial"), 7);
      },
      async saveDocumentSnapshot() {
        return { document: { currentVersion: 8 } };
      },
    },
  });

  await service.loadDocument({ accessToken: "secret", ...room });
  await service.storeDocument({
    accessToken: "secret",
    document: createDocumentWithText("edited"),
    ...room,
  });

  assert.deepEqual(
    events.map(({ event }) => event),
    ["document_checkpoint_started", "document_checkpoint_succeeded"],
  );
  assert.equal(events[0].expectedVersion, 7);
  assert.equal(events[1].savedVersion, 8);
  assert.equal(events[1].status, 200);
  assert.equal(typeof events[1].durationMs, "number");
  assert.equal(JSON.stringify(events).includes("secret"), false);
});

test("reports a 409 conflict before the successful merge retry", async () => {
  const events = [];
  let getCalls = 0;
  let saveCalls = 0;
  const service = createDocumentCheckpointService({
    eventLogger: (event) => events.push(event),
    client: {
      async getDocument() {
        getCalls += 1;
        return bootstrap(createDocumentWithText("remote"), getCalls);
      },
      async saveDocumentSnapshot() {
        saveCalls += 1;
        if (saveCalls === 1) {
          throw new DocumentCheckpointError(409, "outdated");
        }
        return { document: { currentVersion: 3 } };
      },
    },
  });

  await service.loadDocument({ accessToken: "secret", room });
  await service.storeDocument({
    accessToken: "secret",
    document: createDocumentWithText("local"),
    room,
  });

  assert.deepEqual(
    events.map(({ event }) => event),
    [
      "document_checkpoint_started",
      "document_checkpoint_conflict",
      "document_checkpoint_succeeded",
    ],
  );
  assert.equal(events[1].status, 409);
  assert.equal(events[2].expectedVersion, 2);
  assert.equal(events[2].savedVersion, 3);
});

test("reports a failed checkpoint when the merge retry also conflicts", async () => {
  const events = [];
  const service = createDocumentCheckpointService({
    eventLogger: (event) => events.push(event),
    client: {
      async getDocument() {
        return bootstrap(createDocumentWithText("remote"), 2);
      },
      async saveDocumentSnapshot() {
        throw new DocumentCheckpointError(409, "outdated");
      },
    },
  });

  await service.loadDocument({ accessToken: "secret", room });
  await assert.rejects(
    () =>
      service.storeDocument({
        accessToken: "secret",
        document: createDocumentWithText("local"),
        room,
      }),
    /outdated/,
  );

  assert.deepEqual(
    events.map(({ event }) => event),
    [
      "document_checkpoint_started",
      "document_checkpoint_conflict",
      "document_checkpoint_failed",
    ],
  );
  assert.equal(events[2].status, 409);
  assert.equal(typeof events[2].durationMs, "number");
});

test("refreshes the App version inside distributed checkpoint serialization", async () => {
  const saved = [];
  let getCalls = 0;
  const service = createDocumentCheckpointService({
    client: {
      async getDocument() {
        getCalls += 1;
        return bootstrap(
          createDocumentWithText(getCalls === 1 ? "initial" : "remote"),
          getCalls === 1 ? 0 : 1,
        );
      },
      async saveDocumentSnapshot(input) {
        saved.push(input);
        return { document: { currentVersion: 2 } };
      },
    },
    refreshBeforeStore: true,
  });

  await service.loadDocument({ accessToken: "secret", room });
  await service.storeDocument({
    accessToken: "secret",
    document: createDocumentWithText("local"),
    room,
  });

  assert.equal(getCalls, 2);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].expectedVersion, 1);
  assert.match(readCheckpointText(saved[0].yjsState), /local/);
  assert.match(readCheckpointText(saved[0].yjsState), /remote/);
});

test("skips a duplicate distributed checkpoint already persisted by its peer", async () => {
  const sharedDocument = createDocumentWithText("shared");
  let saveCalls = 0;
  const service = createDocumentCheckpointService({
    client: {
      async getDocument() {
        return bootstrap(sharedDocument, 1);
      },
      async saveDocumentSnapshot() {
        saveCalls += 1;
        return { document: { currentVersion: 2 } };
      },
    },
    refreshBeforeStore: true,
  });

  await service.loadDocument({ accessToken: "secret", room });
  const peerDocument = new Y.Doc();
  Y.applyUpdate(peerDocument, Y.encodeStateAsUpdate(sharedDocument));
  await service.storeDocument({
    accessToken: "secret",
    document: peerDocument,
    room,
  });

  assert.equal(saveCalls, 0);
});

test("drain waits for an in-flight checkpoint", async () => {
  let releaseSave;
  const saveBlocked = new Promise((resolve) => {
    releaseSave = resolve;
  });
  const service = createDocumentCheckpointService({
    client: {
      async getDocument() {
        return bootstrap(createDocumentWithText("initial"), 0);
      },
      async saveDocumentSnapshot() {
        await saveBlocked;
        return { document: { currentVersion: 1 } };
      },
    },
  });
  await service.loadDocument({ accessToken: "secret", room });
  const store = service.storeDocument({
    accessToken: "secret",
    document: createDocumentWithText("edited"),
    room,
  });

  let drained = false;
  const drain = service.drain().then(() => {
    drained = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(drained, false);

  releaseSave();
  await Promise.all([store, drain]);
  assert.equal(drained, true);
});

test("drain retries a failed checkpoint before shutdown completes", async () => {
  let saveCalls = 0;
  const service = createDocumentCheckpointService({
    client: {
      async getDocument() {
        return bootstrap(createDocumentWithText("initial"), 0);
      },
      async saveDocumentSnapshot() {
        saveCalls += 1;
        if (saveCalls === 1) throw new Error("temporary App failure");
        return { document: { currentVersion: 1 } };
      },
    },
  });
  await service.loadDocument({ accessToken: "secret", room });

  await assert.rejects(
    service.storeDocument({
      accessToken: "secret",
      document: createDocumentWithText("edited"),
      room,
    }),
    /temporary App failure/,
  );
  await service.drain({ retryDelayMs: 0, timeoutMs: 100 });

  assert.equal(saveCalls, 2);
});

test("drain reports a terminal failure within its shutdown deadline", async () => {
  const events = [];
  const service = createDocumentCheckpointService({
    client: {
      async getDocument() {
        return bootstrap(createDocumentWithText("initial"), 0);
      },
      async saveDocumentSnapshot() {
        throw new Error("App remains unavailable");
      },
    },
    eventLogger: (event) => events.push(event),
  });
  await service.loadDocument({ accessToken: "secret", room });
  await assert.rejects(
    service.storeDocument({
      accessToken: "secret",
      document: createDocumentWithText("edited"),
      room,
    }),
    /App remains unavailable/,
  );

  const startedAt = performance.now();
  await assert.rejects(
    service.drain({ retryDelayMs: 1, timeoutMs: 20 }),
    /checkpoint drain timed out/i,
  );
  assert.ok(performance.now() - startedAt < 200);
  assert.ok(
    events.some(
      (event) =>
        event.event === "document_checkpoint_drain_failed" &&
        event.status === "timeout",
    ),
  );
});

test("runs the full checkpoint inside the distributed coordinator", async () => {
  const calls = [];
  const service = createDocumentCheckpointService({
    checkpointCoordinator: {
      async runExclusive(key, work) {
        calls.push(`enter:${key}`);
        const result = await work();
        calls.push(`leave:${key}`);
        return result;
      },
    },
    client: {
      async getDocument() {
        calls.push("get");
        return bootstrap(createDocumentWithText("initial"), 0);
      },
      async saveDocumentSnapshot() {
        calls.push("save");
        return { document: { currentVersion: 1 } };
      },
    },
    refreshBeforeStore: true,
  });
  await service.loadDocument({ accessToken: "secret", ...room });
  calls.length = 0;

  await service.storeDocument({
    accessToken: "secret",
    document: createDocumentWithText("edited"),
    ...room,
  });

  const key = `${workspaceId}:${documentId}`;
  assert.deepEqual(calls, [`enter:${key}`, "get", "save", `leave:${key}`]);
});
