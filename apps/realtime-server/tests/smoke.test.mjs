import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import packageJson from "../package.json" with { type: "json" };

const require = createRequire(import.meta.url);
const { CanvasGateway } = require("../dist/canvas.gateway");
const {
  CANVAS_REALTIME_EVENTS,
  CANVAS_REALTIME_NAMESPACE,
  createCanvasBoardRoomName,
  parseCanvasBoardRoomPayload,
  parseCanvasPresenceEventPayload,
  parseCanvasShapeEventPayload,
  parseCanvasViewEventPayload,
} = require("../dist/canvas-realtime.contract");

function createSocketStub(currentMember) {
  const joinedRooms = [];
  const leftRooms = [];

  return {
    socket: {
      handshake: {
        auth: {
          currentMember,
        },
      },
      async join(room) {
        joinedRooms.push(room);
      },
      async leave(room) {
        leftRooms.push(room);
      },
    },
    joinedRooms,
    leftRooms,
  };
}

describe("realtime-server package", () => {
  it("keeps the PILO realtime-server package name", () => {
    assert.equal(packageJson.name, "@pilo/realtime-server");
  });

  it("defines Canvas realtime namespace and event payload contracts", () => {
    assert.equal(CANVAS_REALTIME_NAMESPACE, "/canvas");
    assert.deepEqual(CANVAS_REALTIME_EVENTS, {
      boardJoin: "canvas:board:join",
      boardLeave: "canvas:board:leave",
      shapeChanged: "canvas:shape:changed",
      viewChanged: "canvas:view:changed",
      presenceUpdate: "canvas:presence:update",
    });
    assert.equal(createCanvasBoardRoomName("board-1"), "canvas:board:board-1");
    assert.deepEqual(parseCanvasBoardRoomPayload({ boardId: "board-1" }), {
      boardId: "board-1",
    });
    assert.deepEqual(
      parseCanvasShapeEventPayload({
        boardId: "board-1",
        shapeId: "shape-1",
        revision: 1,
        changeType: "moved",
      }),
      {
        boardId: "board-1",
        shapeId: "shape-1",
        revision: 1,
        changeType: "moved",
      },
    );
    assert.deepEqual(
      parseCanvasViewEventPayload({
        boardId: "board-1",
        zoom: 1.2,
        viewportX: 10,
        viewportY: 20,
      }),
      {
        boardId: "board-1",
        zoom: 1.2,
        viewportX: 10,
        viewportY: 20,
      },
    );
    assert.deepEqual(
      parseCanvasPresenceEventPayload({
        boardId: "board-1",
        cursorX: 120,
        cursorY: 140,
        tool: "select",
      }),
      {
        boardId: "board-1",
        cursorX: 120,
        cursorY: 140,
        tool: "select",
      },
    );
    assert.equal(parseCanvasBoardRoomPayload({ boardId: " " }), null);
    assert.equal(
      parseCanvasShapeEventPayload({
        boardId: "board-1",
        shapeId: "shape-1",
        revision: 0,
        changeType: "moved",
      }),
      null,
    );
  });

  it("joins and leaves Canvas board rooms with currentMember context", async () => {
    const gateway = new CanvasGateway();
    const currentMember = {
      workspaceId: "workspace-1",
      memberId: "member-1",
      userId: "user-1",
      displayName: "Canvas Owner",
    };
    const { socket, joinedRooms, leftRooms } = createSocketStub(currentMember);

    const joinAck = await gateway.joinBoardRoom(socket, {
      boardId: "board-1",
    });
    const leaveAck = await gateway.leaveBoardRoom(socket, {
      boardId: "board-1",
    });

    assert.deepEqual(joinedRooms, ["canvas:board:board-1"]);
    assert.deepEqual(leftRooms, ["canvas:board:board-1"]);
    assert.deepEqual(joinAck, {
      ok: true,
      event: "canvas:board:join",
      room: "canvas:board:board-1",
      currentMember,
    });
    assert.deepEqual(leaveAck, {
      ok: true,
      event: "canvas:board:leave",
      room: "canvas:board:board-1",
      currentMember,
    });
  });

  it("rejects Canvas room events without auth context or valid board payload", async () => {
    const gateway = new CanvasGateway();
    const unauthenticated = createSocketStub(null);
    const authenticated = createSocketStub({
      workspaceId: "workspace-1",
      memberId: "member-1",
      userId: "user-1",
      displayName: null,
    });

    const authAck = await gateway.joinBoardRoom(unauthenticated.socket, {
      boardId: "board-1",
    });
    const payloadAck = await gateway.joinBoardRoom(authenticated.socket, {
      boardId: "",
    });

    assert.deepEqual(authAck, {
      ok: false,
      event: "canvas:board:join",
      error: "auth_required",
      message: "Canvas realtime currentMember context is required.",
    });
    assert.deepEqual(payloadAck, {
      ok: false,
      event: "canvas:board:join",
      error: "invalid_payload",
      message: "Canvas board join payload must include boardId.",
    });
    assert.deepEqual(unauthenticated.joinedRooms, []);
    assert.deepEqual(authenticated.joinedRooms, []);
  });
});
