import assert from "node:assert/strict";
import test from "node:test";

import { createDocumentEventLogger } from "../../dist/documents/document-observability.js";

test("writes one JSON line with safe document checkpoint fields", () => {
  const lines = [];
  const logEvent = createDocumentEventLogger({
    instanceId: "realtime-a",
    write: (line) => lines.push(line),
  });

  logEvent({
    accessToken: "must-not-be-logged",
    contentJson: { text: "must-not-be-logged" },
    documentId: "document-1",
    durationMs: 12,
    event: "document_checkpoint_succeeded",
    expectedVersion: 4,
    savedVersion: 5,
    status: 200,
    userId: "must-not-be-logged",
    workspaceId: "workspace-1",
  });

  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    documentId: "document-1",
    durationMs: 12,
    event: "document_checkpoint_succeeded",
    expectedVersion: 4,
    instanceId: "realtime-a",
    savedVersion: 5,
    status: 200,
    workspaceId: "workspace-1",
  });
  assert.doesNotMatch(lines[0], /must-not-be-logged/);
});

test("omits optional fields instead of serializing undefined values", () => {
  const lines = [];
  const logEvent = createDocumentEventLogger({
    instanceId: "realtime-b",
    write: (line) => lines.push(line),
  });

  logEvent({
    documentId: "document-2",
    event: "document_room_authenticated",
    workspaceId: "workspace-2",
  });

  assert.deepEqual(JSON.parse(lines[0]), {
    documentId: "document-2",
    event: "document_room_authenticated",
    instanceId: "realtime-b",
    workspaceId: "workspace-2",
  });
});
