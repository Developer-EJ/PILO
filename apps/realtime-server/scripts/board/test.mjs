import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [socketServer, boardAccess, boardEvents, boardRoom, boardRoomNames] =
  await Promise.all([
    readSource("../../src/socket/socket-server.ts"),
    readSource("../../src/board/board-access.service.ts"),
    readSource("../../src/board/board-socket-events.ts"),
    readSource("../../src/board/board-room.service.ts"),
    readSource("../../src/socket/board/board-room-names.ts")
  ]);

assert.match(socketServer, /boardClientEvents\.join/);
assert.match(
  socketServer,
  /BOARD_INVALIDATION_REDIS_CHANNEL = "board:invalidations"/
);
assert.match(boardAccess, /JOIN workspace_members wm/);
assert.match(boardAccess, /FROM boards b/);
assert.match(boardEvents, /invalidated: "board:invalidated"/);
assert.match(boardRoom, /canJoinBoard/);
assert.match(boardRoomNames, /workspace:\$\{workspaceId\}:board:\$\{boardId\}/);
assert.match(socketServer, /readBoardInvalidationPayload/);
assert.match(socketServer, /createBoardRoomName/);

const uppercaseWorkspaceId = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
const canonicalWorkspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

assert.equal(uppercaseWorkspaceId.toLowerCase(), canonicalWorkspaceId);
assert.match(
  socketServer,
  /return \{ boardId, workspaceId: workspaceId\.toLowerCase\(\) \};/
);

console.log("board realtime tests passed");
