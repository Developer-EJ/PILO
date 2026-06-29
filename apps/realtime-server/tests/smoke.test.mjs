import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import packageJson from "../package.json" with { type: "json" };

const require = createRequire(import.meta.url);
const { CanvasGateway } = require("../dist/canvas.gateway");
const { createRealtimeCorsOptions } = require("../dist/cors.config");
const {
  CanvasRealtimeAccessGuard,
} = require("../dist/canvas-realtime-access.guard");
const {
  CANVAS_REALTIME_EVENTS,
  CANVAS_REALTIME_NAMESPACE,
  createCanvasBoardRoomName,
  parseCanvasBoardRoomPayload,
  parseCanvasRealtimeBoardAccessList,
  parseCanvasRealtimeSessionContext,
  parseCanvasPresenceEventPayload,
  parseCanvasShapeEventPayload,
  parseCanvasShapeMutationPayload,
  parseCanvasViewEventPayload,
} = require("../dist/canvas-realtime.contract");

function createSocketStub(currentMember, options = {}) {
  const joinedRooms = [];
  const leftRooms = [];
  const broadcasts = [];
  const session =
    "session" in options
      ? options.session
      : currentMember
        ? {
            authenticated: true,
            userId: currentMember.userId,
            expiresAt: null,
          }
        : null;
  const canvasBoards =
    "canvasBoards" in options
      ? options.canvasBoards
      : currentMember
        ? [
            {
              boardId: "board-1",
              workspaceId: currentMember.workspaceId,
            },
          ]
        : [];

  return {
    socket: {
      handshake: {
        auth: {
          session,
          currentMember,
          canvasBoards,
        },
      },
      async join(room) {
        joinedRooms.push(room);
      },
      async leave(room) {
        leftRooms.push(room);
      },
      to(room) {
        return {
          emit(event, payload) {
            broadcasts.push({ room, event, payload });
          },
        };
      },
    },
    joinedRooms,
    leftRooms,
    broadcasts,
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
      parseCanvasRealtimeSessionContext({
        authenticated: true,
        userId: "user-1",
        expiresAt: null,
      }),
      {
        authenticated: true,
        userId: "user-1",
        expiresAt: null,
      },
    );
    assert.deepEqual(
      parseCanvasRealtimeBoardAccessList([
        {
          boardId: "board-1",
          workspaceId: "workspace-1",
        },
        {
          boardId: "",
          workspaceId: "workspace-1",
        },
      ]),
      [
        {
          boardId: "board-1",
          workspaceId: "workspace-1",
        },
      ],
    );
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
    assert.equal(
      parseCanvasViewEventPayload({
        boardId: "board-1",
        zoom: 0.05,
        viewportX: 10,
        viewportY: 20,
      }),
      null,
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
    assert.deepEqual(
      parseCanvasShapeMutationPayload({
        boardId: "board-1",
        shapeId: "shape-1",
        baseVersion: 0,
        x: 120,
        y: 140,
        width: 280,
        height: 160,
      }),
      {
        boardId: "board-1",
        shapeId: "shape-1",
        baseVersion: 0,
        x: 120,
        y: 140,
        width: 280,
        height: 160,
      },
    );
    assert.equal(
      parseCanvasShapeMutationPayload({
        boardId: "board-1",
        shapeId: "shape-1",
        baseVersion: -1,
        x: 120,
        y: 140,
      }),
      null,
    );
    assert.equal(
      parseCanvasShapeMutationPayload({
        boardId: "board-1",
        shapeId: "shape-1",
        baseVersion: 0,
        x: 120,
        y: 140,
        width: 0,
        height: 160,
      }),
      null,
    );
  });

  it("uses non-credential wildcard CORS and credentialed explicit allowlists", () => {
    assert.deepEqual(createRealtimeCorsOptions("*"), {
      origin: true,
      credentials: false,
    });
    assert.deepEqual(
      createRealtimeCorsOptions(
        "https://app.pilo.test, https://admin.pilo.test",
      ),
      {
        origin: ["https://app.pilo.test", "https://admin.pilo.test"],
        credentials: true,
      },
    );
  });

  it("joins and leaves Canvas board rooms with currentMember context", async () => {
    const gateway = new CanvasGateway();
    const currentMember = {
      workspaceId: "workspace-1",
      memberId: "member-1",
      userId: "user-1",
      role: "owner",
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

  it("resolves board access through an injectable server provider", async () => {
    const accessGuard = new CanvasRealtimeAccessGuard({
      resolveBoardWorkspaceId({ currentMember }) {
        return currentMember.workspaceId;
      },
    });
    const gateway = new CanvasGateway(accessGuard);
    const currentMember = {
      workspaceId: "workspace-1",
      memberId: "member-1",
      userId: "user-1",
      role: "owner",
      displayName: null,
    };
    const { socket, joinedRooms } = createSocketStub(currentMember, {
      canvasBoards: [],
    });

    const joinAck = await gateway.joinBoardRoom(socket, {
      boardId: "board-1",
    });

    assert.equal(joinAck.ok, true);
    assert.deepEqual(joinedRooms, ["canvas:board:board-1"]);
  });

  it("rejects Canvas room events without auth context or valid board payload", async () => {
    const gateway = new CanvasGateway();
    const unauthenticated = createSocketStub(null);
    const authenticated = createSocketStub({
      workspaceId: "workspace-1",
      memberId: "member-1",
      userId: "user-1",
      role: "member",
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
      message:
        "Canvas realtime session and currentMember context are required.",
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

  it("rejects expired sessions and workspace membership mismatches", async () => {
    const gateway = new CanvasGateway();
    const currentMember = {
      workspaceId: "workspace-1",
      memberId: "member-1",
      userId: "user-1",
      role: "member",
      displayName: null,
    };
    const expired = createSocketStub(currentMember, {
      session: {
        authenticated: true,
        userId: "user-1",
        expiresAt: "2026-01-01T00:00:00.000Z",
      },
    });
    const forbidden = createSocketStub(currentMember, {
      canvasBoards: [
        {
          boardId: "board-1",
          workspaceId: "workspace-2",
        },
      ],
    });
    const reconnect = createSocketStub(currentMember, {
      session: {
        authenticated: true,
        userId: "user-1",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    });

    const expiredAck = await gateway.joinBoardRoom(expired.socket, {
      boardId: "board-1",
    });
    const forbiddenAck = await gateway.joinBoardRoom(forbidden.socket, {
      boardId: "board-1",
    });
    const reconnectAck = await gateway.joinBoardRoom(reconnect.socket, {
      boardId: "board-1",
    });

    assert.deepEqual(expiredAck, {
      ok: false,
      event: "canvas:board:join",
      error: "auth_expired",
      message: "Canvas realtime session is expired.",
    });
    assert.deepEqual(forbiddenAck, {
      ok: false,
      event: "canvas:board:join",
      error: "forbidden",
      message:
        "Current member cannot join a canvas board outside their workspace.",
    });
    assert.deepEqual(reconnectAck, {
      ok: true,
      event: "canvas:board:join",
      room: "canvas:board:board-1",
      currentMember,
    });
    assert.deepEqual(expired.joinedRooms, []);
    assert.deepEqual(forbidden.joinedRooms, []);
    assert.deepEqual(reconnect.joinedRooms, ["canvas:board:board-1"]);
  });

  it("accepts shape move/resize as server-authoritative state and broadcasts it", async () => {
    const gateway = new CanvasGateway();
    const currentMember = {
      workspaceId: "workspace-1",
      memberId: "member-1",
      userId: "user-1",
      role: "member",
      displayName: null,
    };
    const { socket, broadcasts } = createSocketStub(currentMember);

    const ack = await gateway.syncShapeMutation(socket, {
      boardId: "board-1",
      shapeId: "shape-1",
      baseVersion: 0,
      x: 120,
      y: 140,
      width: 280,
      height: 160,
    });

    assert.deepEqual(ack, {
      ok: true,
      event: "canvas:shape:changed",
      room: "canvas:board:board-1",
      currentMember,
      shape: {
        boardId: "board-1",
        shapeId: "shape-1",
        baseVersion: 0,
        x: 120,
        y: 140,
        width: 280,
        height: 160,
        version: 1,
        updatedByMemberId: "member-1",
      },
    });
    assert.deepEqual(broadcasts, [
      {
        room: "canvas:board:board-1",
        event: "canvas:shape:changed",
        payload: ack.shape,
      },
    ]);
  });

  it("preserves shape width and height for move-only mutations", async () => {
    const gateway = new CanvasGateway();
    const currentMember = {
      workspaceId: "workspace-1",
      memberId: "member-1",
      userId: "user-1",
      role: "member",
      displayName: null,
    };
    const { socket } = createSocketStub(currentMember);

    await gateway.syncShapeMutation(socket, {
      boardId: "board-1",
      shapeId: "shape-1",
      baseVersion: 0,
      x: 120,
      y: 140,
      width: 280,
      height: 160,
    });
    const ack = await gateway.syncShapeMutation(socket, {
      boardId: "board-1",
      shapeId: "shape-1",
      baseVersion: 1,
      x: 200,
      y: 240,
    });

    assert.equal(ack.ok, true);
    assert.equal(ack.shape.width, 280);
    assert.equal(ack.shape.height, 160);
    assert.equal(ack.shape.version, 2);
  });

  it("rejects stale shape mutations and viewer write attempts", async () => {
    const gateway = new CanvasGateway();
    const member = {
      workspaceId: "workspace-1",
      memberId: "member-1",
      userId: "user-1",
      role: "member",
      displayName: null,
    };
    const viewer = {
      workspaceId: "workspace-1",
      memberId: "member-2",
      userId: "user-2",
      role: "viewer",
      displayName: null,
    };
    const memberSocket = createSocketStub(member);
    const viewerSocket = createSocketStub(viewer);

    await gateway.syncShapeMutation(memberSocket.socket, {
      boardId: "board-1",
      shapeId: "shape-1",
      baseVersion: 0,
      x: 120,
      y: 140,
    });
    const staleAck = await gateway.syncShapeMutation(memberSocket.socket, {
      boardId: "board-1",
      shapeId: "shape-1",
      baseVersion: 0,
      x: 160,
      y: 180,
    });
    const viewerAck = await gateway.syncShapeMutation(viewerSocket.socket, {
      boardId: "board-1",
      shapeId: "shape-2",
      baseVersion: 0,
      x: 10,
      y: 20,
    });

    assert.deepEqual(staleAck, {
      ok: false,
      event: "canvas:shape:changed",
      error: "conflict",
      message:
        "Canvas shape mutation baseVersion does not match server version.",
      currentVersion: 1,
    });
    assert.deepEqual(viewerAck, {
      ok: false,
      event: "canvas:shape:changed",
      error: "forbidden",
      message: "Current member cannot mutate this canvas board.",
    });
    assert.deepEqual(memberSocket.broadcasts.length, 1);
    assert.deepEqual(viewerSocket.broadcasts, []);
  });
});
