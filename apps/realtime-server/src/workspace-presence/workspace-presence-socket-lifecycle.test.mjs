import assert from "node:assert/strict";
import test from "node:test";

import { workspacePresenceClientEvents, workspacePresenceServerEvents } from "../../dist/workspace-presence/workspace-presence-events.js";
import { createWorkspacePresenceService } from "../../dist/workspace-presence/workspace-presence.service.js";
import { registerWorkspacePresenceSocketHandlers } from "../../dist/workspace-presence/workspace-presence-socket-handlers.js";

const workspaceId = "00000000-0000-0000-0000-000000000001";

function createHarness({ allowed = true } = {}) {
  const handlers = new Map();
  const emitted = [];
  const roomEvents = [];
  const socket = {
    data: { auth: { displayName: "세인", userId: "user-1" } },
    id: "socket-1",
    join: async () => {},
    leave: async () => {},
    rooms: new Set(),
    on(event, handler) {
      handlers.set(event, handler);
    },
    emit(event, payload) {
      emitted.push({ event, payload });
    },
    to(roomName) {
      return io.to(roomName);
    },
  };
  const io = {
    to(roomName) {
      return {
        emit(event, payload) {
          roomEvents.push({ event, payload, roomName });
        },
      };
    },
  };
  const service = createWorkspacePresenceService();

  registerWorkspacePresenceSocketHandlers({
    accessService: { canJoinWorkspace: async () => allowed },
    io,
    service,
    socket,
  });

  return { emitted, handlers, roomEvents, service, socket };
}

test("authorized join은 roster를 반환하고 forbidden join은 거부한다", async () => {
  const allowed = createHarness();
  await allowed.handlers.get(workspacePresenceClientEvents.join)({ workspaceId });
  assert.equal(allowed.emitted.at(-1)?.event, workspacePresenceServerEvents.joined);
  assert.equal(allowed.emitted.at(-1)?.payload.presence.length, 1);

  const forbidden = createHarness({ allowed: false });
  await forbidden.handlers.get(workspacePresenceClientEvents.join)({ workspaceId });
  assert.deepEqual(forbidden.emitted.at(-1), {
    event: workspacePresenceServerEvents.error,
    payload: {
      code: "forbidden",
      message: "workspace presence access denied",
    },
  });
});

test("disconnect는 다른 탭이 남으면 update, 마지막 탭이면 leave를 보낸다", async () => {
  const harness = createHarness();
  await harness.handlers.get(workspacePresenceClientEvents.join)({ workspaceId });
  harness.service.joinSocket(
    "socket-2",
    { displayName: "세인", userId: "user-1" },
    workspaceId,
  );

  await harness.handlers.get("disconnect")();
  assert.equal(harness.roomEvents.at(-1)?.event, workspacePresenceServerEvents.update);

  const lastTab = createHarness();
  await lastTab.handlers.get(workspacePresenceClientEvents.join)({ workspaceId });
  await lastTab.handlers.get("disconnect")();
  assert.equal(lastTab.roomEvents.at(-1)?.event, workspacePresenceServerEvents.leave);
});
