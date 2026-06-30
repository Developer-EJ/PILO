import assert from "node:assert/strict";
import { createRequire } from "node:module";
import process from "node:process";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  RuntimeCodeReviewRoomRepository,
} = require("../src/modules/review/room/runtime-code-review-room.repository.ts");

const ROOM_ID = "88888888-8888-4888-8888-888888888811";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const PULL_REQUEST_ID = "66666666-6666-4666-8666-666666666661";
const MEMBER_ID = "33333333-3333-4333-8333-333333333331";

describe("RuntimeCodeReviewRoomRepository database persistence", () => {
  it("restores review rooms after repository restart", async () => {
    await withDatabaseConnectEnabled(async () => {
      const database = createReviewRoomDatabaseStub();
      const repository = new RuntimeCodeReviewRoomRepository(database);

      const room = await repository.create({
        id: ROOM_ID,
        workspaceId: WORKSPACE_ID,
        pullRequestId: PULL_REQUEST_ID,
        createdByMemberId: MEMBER_ID,
        createdAt: "2026-06-30T00:00:00.000Z",
      });
      const restartedRepository = new RuntimeCodeReviewRoomRepository(database);

      assert.equal(repository.mode, "database");
      assert.deepEqual(await restartedRepository.findById(ROOM_ID), room);
      assert.deepEqual(
        await restartedRepository.findByPullRequestId(PULL_REQUEST_ID),
        room,
      );
      assert.equal(
        database.calls.some((call) =>
          /INSERT INTO code_review_rooms/.test(call.sql),
        ),
        true,
      );
    });
  });

  it("falls back to memory storage when database connection is explicitly skipped", async () => {
    await withDatabaseConnectSkipped(async () => {
      const database = createReviewRoomDatabaseStub();
      const repository = new RuntimeCodeReviewRoomRepository(database);

      await repository.create({
        id: ROOM_ID,
        workspaceId: WORKSPACE_ID,
        pullRequestId: PULL_REQUEST_ID,
        createdByMemberId: MEMBER_ID,
        createdAt: "2026-06-30T00:00:00.000Z",
      });

      assert.equal(repository.mode, "memory");
      assert.equal((await repository.findById(ROOM_ID)).id, ROOM_ID);
      assert.equal(database.calls.length, 0);
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

function createReviewRoomDatabaseStub() {
  const state = {
    roomsById: new Map(),
    roomIdsByPullRequestId: new Map(),
  };
  const calls = [];

  return {
    state,
    calls,
    async $queryRaw(strings, ...values) {
      const sql = normalizeSql(strings);
      const params = queryParams(values);
      calls.push({ sql, values: params });

      if (/SELECT .* FROM code_review_rooms.*WHERE id =/.test(sql)) {
        return rowForRoom(state.roomsById.get(params[0]));
      }

      if (/SELECT .* FROM code_review_rooms.*WHERE pull_request_id =/.test(sql)) {
        const pullRequestId = params[0];
        const roomId = state.roomIdsByPullRequestId.get(pullRequestId);

        return rowForRoom(state.roomsById.get(roomId));
      }

      if (/INSERT INTO code_review_rooms/.test(sql)) {
        const [
          id,
          workspaceId,
          pullRequestId,
          status,
          createdByMemberId,
          createdAt,
          updatedAt,
        ] = params;
        const existingId = state.roomIdsByPullRequestId.get(pullRequestId);
        const existing = state.roomsById.get(existingId);
        const room =
          existing ?? {
            id,
            workspaceId,
            pullRequestId,
            status,
            createdByMemberId,
            createdAt,
            updatedAt,
          };

        state.roomsById.set(room.id, room);
        state.roomIdsByPullRequestId.set(pullRequestId, room.id);
        return rowForRoom(room);
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

function rowForRoom(room) {
  return room
    ? [
        {
          id: room.id,
          workspaceId: room.workspaceId,
          pullRequestId: room.pullRequestId,
          status: room.status,
          createdByMemberId: room.createdByMemberId,
          createdAt: room.createdAt,
          updatedAt: room.updatedAt,
        },
      ]
    : [];
}

function queryParams(values) {
  return values.filter(
    (value) =>
      !(value && typeof value === "object" && Array.isArray(value.strings)),
  );
}

function normalizeSql(strings) {
  const parts = Array.isArray(strings)
    ? Array.from(strings)
    : Array.isArray(strings?.strings)
      ? strings.strings
      : [String(strings)];

  return parts.join("?").replace(/\s+/g, " ").trim();
}
