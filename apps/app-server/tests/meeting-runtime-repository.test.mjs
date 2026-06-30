import assert from "node:assert/strict";
import { createRequire } from "node:module";
import process from "node:process";
import { describe, it } from "node:test";
import "ts-node/register";

const require = createRequire(import.meta.url);
const {
  RuntimeMeetingRepository,
} = require("../src/modules/meeting/repositories/meeting.runtime-repository");

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const MEETING_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-06-30T08:00:00.000Z";

describe("RuntimeMeetingRepository database persistence", () => {
  it("uses database storage when a database client is injected", async () => {
    await withDatabaseConnectEnabled(async () => {
      const db = createDatabaseStub([
        {
          kind: "query",
          rows: [
            meetingRow({
              title: "Persisted meeting",
            }),
          ],
        },
      ]);
      const repository = new RuntimeMeetingRepository(db);

      const meetings = await repository.listMeetingsByWorkspace(WORKSPACE_ID);

      assert.equal(repository.mode, "database");
      assert.equal(meetings.length, 1);
      assert.equal(meetings[0].id, MEETING_ID);
      assert.equal(meetings[0].title, "Persisted meeting");
      assert.equal(meetings[0].createdAt, NOW);
      assert.match(db.calls[0].sql, /FROM meetings/);
      assert.equal(db.calls[0].values.includes(WORKSPACE_ID), true);
      assert.equal(db.pendingCount(), 0);
    });
  });

  it("falls back to memory storage when database connection is explicitly skipped", async () => {
    await withDatabaseConnectSkipped(async () => {
      const db = createDatabaseStub();
      const repository = new RuntimeMeetingRepository(db);

      const meeting = await repository.createMeeting({
        workspaceId: "workspace-1",
        title: "Memory meeting",
        createdByMemberId: "member-1",
      });

      assert.equal(repository.mode, "mock");
      assert.equal(meeting.workspaceId, "workspace-1");
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

function meetingRow(overrides = {}) {
  return {
    id: MEETING_ID,
    workspaceId: WORKSPACE_ID,
    canvasBoardId: null,
    title: "Planning",
    purpose: null,
    status: "scheduled",
    startedAt: null,
    endedAt: null,
    createdByMemberId: MEMBER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}
