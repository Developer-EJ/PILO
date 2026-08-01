import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  buildDocumentSnapshotConflictEvent,
  DocumentConflictObserver
} = require("../../dist/modules/drive/document-conflict-observer.js");

const documentId = "33333333-3333-4333-8333-333333333333";
const privacySentinels = {
  workspaceId: "workspace-private-sentinel",
  currentUserId: "user-private-sentinel",
  title: "title-private-sentinel",
  contentJson: { text: "content-private-sentinel" },
  plainText: "plain-text-private-sentinel",
  yjsState: "yjs-private-sentinel",
  attachmentFileIds: ["attachment-private-sentinel"],
  authorization: "Bearer authorization-private-sentinel",
  accessToken: "token-private-sentinel"
};

const event = buildDocumentSnapshotConflictEvent({
  documentId,
  expectedVersion: 3,
  currentVersion: 4,
  ...privacySentinels
});

assert.deepEqual(event, {
  event: "document_snapshot_conflict",
  status: 409,
  documentId,
  expectedVersion: 3,
  currentVersion: 4
});
assert.deepEqual(Object.keys(event), [
  "event",
  "status",
  "documentId",
  "expectedVersion",
  "currentVersion"
]);

const messages = [];
const observer = new DocumentConflictObserver({
  warn(message) {
    messages.push(message);
  }
});
observer.observe({
  documentId,
  expectedVersion: 3,
  currentVersion: 4,
  ...privacySentinels
});

assert.equal(messages.length, 1);
assert.equal(messages[0].includes("\n"), false);
assert.deepEqual(JSON.parse(messages[0]), event);

const serialized = messages[0];
for (const sentinel of [
  privacySentinels.workspaceId,
  privacySentinels.currentUserId,
  privacySentinels.title,
  privacySentinels.contentJson.text,
  privacySentinels.plainText,
  privacySentinels.yjsState,
  privacySentinels.attachmentFileIds[0],
  privacySentinels.authorization,
  privacySentinels.accessToken
]) {
  assert.equal(serialized.includes(sentinel), false, `leaked privacy sentinel: ${sentinel}`);
}

const throwingObserver = new DocumentConflictObserver({
  warn() {
    throw new Error("logger unavailable");
  }
});
assert.doesNotThrow(() =>
  throwingObserver.observe({ documentId, expectedVersion: 3, currentVersion: 4 })
);

const defaultSinkResult = spawnSync(
  process.execPath,
  [
    "-e",
    `const { DocumentConflictObserver } = require(${JSON.stringify(
      fileURLToPath(
        new URL(
          "../../dist/modules/drive/document-conflict-observer.js",
          import.meta.url
        )
      )
    )}); new DocumentConflictObserver().observe(${JSON.stringify({
      documentId,
      expectedVersion: 3,
      currentVersion: 4
    })});`
  ],
  { encoding: "utf8" }
);
assert.equal(defaultSinkResult.status, 0, defaultSinkResult.stderr);
assert.equal(
  `${defaultSinkResult.stdout}${defaultSinkResult.stderr}`.trim(),
  JSON.stringify(event),
  "the production sink must emit one raw JSON object without a Nest text prefix"
);

console.log("Document conflict observer tests passed.");
