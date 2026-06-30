import assert from "node:assert/strict";
import { createRequire } from "node:module";
import process from "node:process";
import { describe, it } from "node:test";
import "ts-node/register";

const require = createRequire(import.meta.url);
const {
  RuntimeVoiceRepository,
} = require("../src/modules/voice/repositories/voice.runtime-repository");

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const MEETING_ID = "22222222-2222-4222-8222-222222222222";
const VOICE_ROOM_ID = "33333333-3333-4333-8333-333333333333";
const VOICE_SESSION_ID = "44444444-4444-4444-8444-444444444444";
const MEMBER_ID = "55555555-5555-4555-8555-555555555555";
const NOW = "2026-06-30T08:30:00.000Z";

describe("RuntimeVoiceRepository database persistence", () => {
  it("uses database storage for voice rooms when a database client is injected", async () => {
    await withDatabaseConnectEnabled(async () => {
      const db = createDatabaseStub([
        {
          kind: "query",
          rows: [
            voiceRoomRow({
              livekitRoomName: "room-workspace-meeting",
            }),
          ],
        },
      ]);
      const repository = new RuntimeVoiceRepository(db);

      const voiceRoom = await repository.createVoiceRoom({
        workspaceId: WORKSPACE_ID,
        meetingId: MEETING_ID,
        livekitRoomName: "room-workspace-meeting",
      });

      assert.equal(repository.mode, "database");
      assert.equal(voiceRoom.id, VOICE_ROOM_ID);
      assert.equal(voiceRoom.meetingId, MEETING_ID);
      assert.equal(voiceRoom.livekitRoomName, "room-workspace-meeting");
      assert.match(db.calls[0].sql, /INSERT INTO voice_rooms/);
      assert.equal(db.calls[0].values.includes(WORKSPACE_ID), true);
      assert.equal(db.pendingCount(), 0);
    });
  });

  it("uses database storage for voice sessions and preserves nullable member ids", async () => {
    await withDatabaseConnectEnabled(async () => {
      const db = createDatabaseStub([
        {
          kind: "query",
          rows: [
            voiceSessionRow({
              memberId: null,
            }),
          ],
        },
      ]);
      const repository = new RuntimeVoiceRepository(db);

      const voiceSession = await repository.createVoiceSession({
        voiceRoomId: VOICE_ROOM_ID,
        meetingId: MEETING_ID,
        memberId: MEMBER_ID,
      });

      assert.equal(voiceSession.id, VOICE_SESSION_ID);
      assert.equal(voiceSession.memberId, null);
      assert.equal(voiceSession.startedAt, NOW);
      assert.match(db.calls[0].sql, /INSERT INTO voice_sessions/);
      assert.equal(db.calls[0].values.includes(VOICE_ROOM_ID), true);
      assert.equal(db.pendingCount(), 0);
    });
  });

  it("falls back to memory storage when database connection is explicitly skipped", async () => {
    await withDatabaseConnectSkipped(async () => {
      const db = createDatabaseStub();
      const repository = new RuntimeVoiceRepository(db);

      const voiceRoom = await repository.createVoiceRoom({
        workspaceId: "workspace-1",
        meetingId: "meeting-1",
        livekitRoomName: "room-1",
      });

      assert.equal(repository.mode, "mock");
      assert.equal(voiceRoom.workspaceId, "workspace-1");
      assert.equal(db.calls.length, 0);
    });
  });
});

async function withDatabaseConnectEnabled(callback) {
  const previous = process.env.PILO_SKIP_DATABASE_CONNECT;
  delete process.env.PILO_SKIP_DATABASE_CONNECT;

  try {
    await callback();
  } finally {
    restoreDatabaseSkip(previous);
  }
}

async function withDatabaseConnectSkipped(callback) {
  const previous = process.env.PILO_SKIP_DATABASE_CONNECT;
  process.env.PILO_SKIP_DATABASE_CONNECT = "true";

  try {
    await callback();
  } finally {
    restoreDatabaseSkip(previous);
  }
}

function restoreDatabaseSkip(previous) {
  if (previous === undefined) {
    delete process.env.PILO_SKIP_DATABASE_CONNECT;
    return;
  }

  process.env.PILO_SKIP_DATABASE_CONNECT = previous;
}

function createDatabaseStub(responses = []) {
  const pending = [...responses];
  const calls = [];

  return {
    calls,
    pendingCount() {
      return pending.length;
    },
    async $queryRaw(strings, ...values) {
      calls.push({
        kind: "query",
        sql: normalizeSql(strings),
        values,
      });

      const next = pending.shift();
      assert.equal(next?.kind, "query");

      return next.rows;
    },
    async $executeRaw(strings, ...values) {
      calls.push({
        kind: "execute",
        sql: normalizeSql(strings),
        values,
      });

      const next = pending.shift();
      assert.equal(next?.kind, "execute");

      return next.count ?? 1;
    },
  };
}

function normalizeSql(strings) {
  if (Array.isArray(strings)) {
    return strings.join("?").replace(/\s+/g, " ").trim();
  }

  if (strings?.strings) {
    return strings.strings.join("?").replace(/\s+/g, " ").trim();
  }

  return String(strings).replace(/\s+/g, " ").trim();
}

function voiceRoomRow(overrides = {}) {
  return {
    id: VOICE_ROOM_ID,
    workspaceId: WORKSPACE_ID,
    meetingId: MEETING_ID,
    livekitRoomName: null,
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function voiceSessionRow(overrides = {}) {
  return {
    id: VOICE_SESSION_ID,
    voiceRoomId: VOICE_ROOM_ID,
    meetingId: MEETING_ID,
    memberId: MEMBER_ID,
    recordingStatus: "not_recording",
    startedAt: NOW,
    endedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}
