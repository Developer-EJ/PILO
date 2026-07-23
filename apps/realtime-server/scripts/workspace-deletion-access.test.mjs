import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const accessSources = await Promise.all(
  [
    "../src/board/board-access.service.ts",
    "../src/canvas/room/canvas-access.service.ts",
    "../src/chat/chat-access.service.ts",
    "../src/documents/document-access.service.ts",
    "../src/github-source/github-source-access.service.ts",
    "../src/meeting/meeting-access.service.ts",
    "../src/pdf-collaboration/pdf-collaboration-access.service.ts",
    "../src/sql-erd/sql-erd-access.service.ts",
    "../src/workspace-presence/workspace-presence-access.service.ts"
  ].map(path => readFile(new URL(path, import.meta.url), "utf8"))
);

for (const source of accessSources) {
  assert.match(source, /JOIN workspaces AS workspace/);
  assert.match(source, /workspace\.deletion_status = 'active'/);
}

console.log("workspace deletion realtime access tests passed");
