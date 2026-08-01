import assert from "node:assert/strict";
import test from "node:test";

import {
  createDocumentHocuspocusService,
} from "../../dist/documents/document-hocuspocus.service.js";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const documentId = "00000000-0000-0000-0000-000000000002";

function roomName() {
  return `workspace:${workspaceId}:document:${documentId}:yjs`;
}

test("authenticates a Workspace member for the requested document room", async () => {
  const accessCalls = [];
  const service = createDocumentHocuspocusService({
    accessService: {
      async getDocumentRoomAccess(context, room) {
        accessCalls.push({ context, room });
        return { readOnly: false };
      },
    },
    sessionService: {
      async validateSessionToken(token) {
        assert.equal(token, "valid-token");
        return { displayName: "PILO", userId: "user-1" };
      },
    },
    checkpointService: {
      async loadDocument() {
        return new Uint8Array();
      },
      async storeDocument() {},
    },
  });

  const context = await service.authorizeDocument(roomName(), "valid-token");

  assert.deepEqual(context, {
    accessToken: "valid-token",
    documentId,
    userId: "user-1",
    workspaceId,
  });
  assert.deepEqual(accessCalls, [
    {
      context: { userId: "user-1" },
      room: { documentId, workspaceId },
    },
  ]);
});

test("rejects an unauthenticated user before a document is loaded", async () => {
  const service = createDocumentHocuspocusService({
    accessService: {
      async getDocumentRoomAccess() {
        throw new Error("access lookup should not run");
      },
    },
    sessionService: {
      async validateSessionToken() {
        return null;
      },
    },
    checkpointService: {
      async loadDocument() {
        return new Uint8Array();
      },
      async storeDocument() {},
    },
  });

  await assert.rejects(
    () => service.authorizeDocument(roomName(), "expired-token"),
    /NOT_AUTHENTICATED/,
  );
});

test("rejects malformed names and documents outside the member's Workspace", async () => {
  const service = createDocumentHocuspocusService({
    accessService: {
      async getDocumentRoomAccess() {
        return null;
      },
    },
    sessionService: {
      async validateSessionToken() {
        return { displayName: "PILO", userId: "user-1" };
      },
    },
    checkpointService: {
      async loadDocument() {
        return new Uint8Array();
      },
      async storeDocument() {},
    },
  });

  await assert.rejects(
    () => service.authorizeDocument("not-a-document-room", "valid-token"),
    /FORBIDDEN/,
  );
  await assert.rejects(
    () => service.authorizeDocument(roomName(), "valid-token"),
    /FORBIDDEN/,
  );
});

test("loads and stores a room through the checkpoint service with the authenticated token", async () => {
  const calls = [];
  const service = createDocumentHocuspocusService({
    accessService: {
      async getDocumentRoomAccess() {
        return { readOnly: false };
      },
    },
    sessionService: {
      async validateSessionToken() {
        return { displayName: "PILO", userId: "user-1" };
      },
    },
    checkpointService: {
      async loadDocument(context) {
        calls.push({ type: "load", context });
        return new Uint8Array([1, 2, 3]);
      },
      async storeDocument(input) {
        calls.push({ type: "store", input });
      },
    },
  });
  const context = await service.authorizeDocument(roomName(), "valid-token");
  const document = { getXmlFragment() {} };

  assert.deepEqual(await service.loadDocument(context), new Uint8Array([1, 2, 3]));
  await service.storeDocument(context, document);

  assert.deepEqual(calls, [
    { type: "load", context },
    { type: "store", input: { ...context, document } },
  ]);
});

test("reports authenticated document rooms without token or user identity", async () => {
  const events = [];
  const service = createDocumentHocuspocusService({
    accessService: {
      async getDocumentRoomAccess() {
        return { readOnly: false };
      },
    },
    checkpointService: {
      async loadDocument() {
        return new Uint8Array();
      },
      async storeDocument() {},
    },
    eventLogger: (event) => events.push(event),
    sessionService: {
      async validateSessionToken() {
        return { displayName: "PILO", userId: "private-user" };
      },
    },
  });

  await service.authorizeDocument(roomName(), "private-token");

  assert.deepEqual(events, [
    {
      documentId,
      event: "document_room_authenticated",
      workspaceId,
    },
  ]);
  assert.equal(JSON.stringify(events).includes("private-token"), false);
  assert.equal(JSON.stringify(events).includes("private-user"), false);
});

test("registers the instance name and document Redis extension", () => {
  const extension = { priority: 1000 };
  const service = createDocumentHocuspocusService({
    accessService: {
      async getDocumentRoomAccess() {
        return { readOnly: false };
      },
    },
    checkpointService: {
      async loadDocument() {
        return new Uint8Array();
      },
      async storeDocument() {},
    },
    extensions: [extension],
    instanceId: "realtime-a",
    sessionService: {
      async validateSessionToken() {
        return { displayName: "PILO", userId: "user-1" };
      },
    },
  });

  assert.equal(service.hocuspocus.configuration.name, "realtime-a");
  assert.ok(service.hocuspocus.configuration.extensions.includes(extension));
});

test("shutdown waits for checkpoint drain after flushing pending stores", async () => {
  let releaseDrain;
  const drainBlocked = new Promise((resolve) => {
    releaseDrain = resolve;
  });
  let drainCalls = 0;
  const service = createDocumentHocuspocusService({
    accessService: {
      async getDocumentRoomAccess() {
        return { readOnly: false };
      },
    },
    checkpointService: {
      async drain() {
        drainCalls += 1;
        await drainBlocked;
      },
      async loadDocument() {
        return new Uint8Array();
      },
      async storeDocument() {},
    },
    sessionService: {
      async validateSessionToken() {
        return { displayName: "PILO", userId: "user-1" };
      },
    },
  });

  let shutdownFinished = false;
  const shutdown = service.shutdown().then(() => {
    shutdownFinished = true;
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(drainCalls, 1);
  assert.equal(shutdownFinished, false);
  releaseDrain();
  await shutdown;
  assert.equal(shutdownFinished, true);
});

test("shutdown unloads a document retained after an earlier store failure", async () => {
  const service = createDocumentHocuspocusService({
    accessService: { async getDocumentRoomAccess() { return { readOnly: false }; } },
    checkpointService: {
      async drain() {},
      async loadDocument() { return new Uint8Array(); },
      async storeDocument() {},
    },
    sessionService: {
      async validateSessionToken() {
        return { displayName: "PILO", userId: "user-1" };
      },
    },
    shutdownTimeoutMs: 100,
  });
  const retainedDocument = {};
  let documentCount = 1;
  let unloadCalls = 0;
  service.hocuspocus.documents = new Map([[roomName(), retainedDocument]]);
  service.hocuspocus.closeConnections = () => undefined;
  service.hocuspocus.flushPendingStores = () => undefined;
  service.hocuspocus.getDocumentsCount = () => documentCount;
  service.hocuspocus.unloadDocument = async (document) => {
    assert.equal(document, retainedDocument);
    unloadCalls += 1;
    documentCount = 0;
  };

  const outcome = await Promise.race([
    service.shutdown().then(() => "completed"),
    new Promise((resolve) => setTimeout(() => resolve("still-pending"), 200)),
  ]);

  assert.equal(outcome, "completed");
  assert.equal(unloadCalls, 1);
});

test("shutdown rejects within its budget when checkpoint draining hangs", async () => {
  const service = createDocumentHocuspocusService({
    accessService: { async getDocumentRoomAccess() { return { readOnly: false }; } },
    checkpointService: {
      async drain() { return new Promise(() => undefined); },
      async loadDocument() { return new Uint8Array(); },
      async storeDocument() {},
    },
    sessionService: {
      async validateSessionToken() {
        return { displayName: "PILO", userId: "user-1" };
      },
    },
    shutdownTimeoutMs: 20,
  });

  const outcome = await Promise.race([
    service.shutdown().then(
      () => "completed",
      (error) => error,
    ),
    new Promise((resolve) => setTimeout(() => resolve("still-pending"), 200)),
  ]);

  assert.notEqual(outcome, "still-pending");
  assert.match(outcome.message, /shutdown timed out/i);
});
