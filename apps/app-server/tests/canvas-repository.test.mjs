import assert from "node:assert/strict";
import { createRequire } from "node:module";
import process from "node:process";
import { describe, it } from "node:test";
import "ts-node/register";

const require = createRequire(import.meta.url);
const { CanvasRepository } = require("../src/modules/canvas/canvas.repository");

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const BOARD_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";
const SHAPE_ONE_ID = "44444444-4444-4444-8444-444444444441";
const SHAPE_TWO_ID = "44444444-4444-4444-8444-444444444442";
const CONNECTION_ID = "55555555-5555-4555-8555-555555555555";
const NOW = "2026-06-30T07:00:00.000Z";

describe("CanvasRepository database persistence", () => {
  it("uses database storage when a database client is injected", async () => {
    await withDatabaseConnectEnabled(async () => {
      const db = createDatabaseStub([
        {
          kind: "query",
          rows: [
            boardRow({
              shapeCount: 2n,
              connectionCount: 1n,
            }),
          ],
        },
      ]);
      const repository = new CanvasRepository(db);

      const boards = await repository.listBoardsForWorkspace(WORKSPACE_ID);

      assert.equal(repository.storageMode, "database");
      assert.equal(boards.length, 1);
      assert.equal(boards[0].shapeCount, 2);
      assert.equal(boards[0].connectionCount, 1);
      assert.match(db.calls[0].sql, /FROM canvas_boards/);
      assert.deepEqual(db.calls[0].values, [WORKSPACE_ID]);
      assert.equal(db.pendingCount(), 0);
    });
  });

  it("falls back to memory storage when database connection is explicitly skipped", async () => {
    await withDatabaseConnectSkipped(async () => {
      const db = createDatabaseStub();
      const repository = new CanvasRepository(db);

      const boards = await repository.listBoardsForWorkspace(WORKSPACE_ID);

      assert.equal(repository.storageMode, "memory");
      assert.deepEqual(boards, []);
      assert.equal(db.calls.length, 0);
    });
  });

  it("maps database board details with default member settings", async () => {
    await withDatabaseConnectEnabled(async () => {
      const db = createDatabaseStub([
        {
          kind: "query",
          rows: [
            boardRow({
              shapeCount: 2,
              connectionCount: 1,
            }),
          ],
        },
        {
          kind: "query",
          rows: [
            shapeRow({
              id: SHAPE_ONE_ID,
              displayTitle: "Plan task",
              x: "144.5",
              y: "288",
            }),
            shapeRow({
              id: SHAPE_TWO_ID,
              displayTitle: "Review task",
              x: null,
              y: null,
            }),
          ],
        },
        {
          kind: "query",
          rows: [connectionRow()],
        },
        {
          kind: "query",
          rows: [],
        },
        {
          kind: "query",
          rows: [],
        },
      ]);
      const repository = new CanvasRepository(db);

      const board = await repository.findBoardDetail({
        boardId: BOARD_ID,
        memberId: MEMBER_ID,
      });

      assert.equal(board.id, BOARD_ID);
      assert.equal(board.shapes.length, 2);
      assert.deepEqual(board.shapes[0].position, {
        x: 144.5,
        y: 288,
      });
      assert.deepEqual(board.shapes[1].position, {
        x: 0,
        y: 0,
      });
      assert.deepEqual(board.connections, [
        {
          id: CONNECTION_ID,
          sourceShapeId: SHAPE_ONE_ID,
          targetShapeId: SHAPE_TWO_ID,
          connectionType: "implemented_by",
          label: "Task to implementation",
        },
      ]);
      assert.deepEqual(board.viewSetting, {
        zoom: 1,
        viewportX: 0,
        viewportY: 0,
      });
      assert.deepEqual(board.filterSetting, {
        enabledEntityTypes: ["task", "meeting_report", "pull_request"],
        assigneeMemberId: null,
        showDelayedOnly: false,
        showRiskOnly: false,
        filters: {},
      });
      assert.equal(db.pendingCount(), 0);
    });
  });

  it("creates database connections only between shapes on the same board", async () => {
    await withDatabaseConnectEnabled(async () => {
      const db = createDatabaseStub([
        {
          kind: "query",
          rows: [{ workspaceId: WORKSPACE_ID }],
        },
        {
          kind: "query",
          rows: [{ boardId: BOARD_ID }],
        },
        {
          kind: "query",
          rows: [{ boardId: "99999999-9999-4999-8999-999999999999" }],
        },
        {
          kind: "query",
          rows: [],
        },
      ]);
      const repository = new CanvasRepository(db);

      const result = await repository.createConnectionForBoard({
        boardId: BOARD_ID,
        sourceShapeId: SHAPE_ONE_ID,
        targetShapeId: SHAPE_TWO_ID,
        connectionType: "implemented_by",
        label: "Invalid cross-board edge",
      });

      assert.deepEqual(result, {
        status: "invalid",
      });
      assert.equal(
        db.calls.some((call) =>
          /INSERT INTO canvas_connections/.test(call.sql),
        ),
        false,
      );
      assert.equal(db.pendingCount(), 0);
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
  return Array.from(strings).join("?").replace(/\s+/g, " ").trim();
}

function boardRow(overrides = {}) {
  return {
    id: BOARD_ID,
    workspaceId: WORKSPACE_ID,
    title: "Project Map",
    boardType: "project_map",
    createdByMemberId: MEMBER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    shapeCount: 0,
    connectionCount: 0,
    ...overrides,
  };
}

function shapeRow(overrides = {}) {
  return {
    id: SHAPE_ONE_ID,
    boardId: BOARD_ID,
    shapeType: "task",
    entityType: "task",
    entityId: "66666666-6666-4666-8666-666666666666",
    displayTitle: "Canvas task",
    width: "280",
    height: "160",
    color: "#6d5bd6",
    isCollapsed: false,
    zIndex: 1,
    createdByMemberId: MEMBER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    x: null,
    y: null,
    ...overrides,
  };
}

function connectionRow(overrides = {}) {
  return {
    id: CONNECTION_ID,
    boardId: BOARD_ID,
    sourceShapeId: SHAPE_ONE_ID,
    targetShapeId: SHAPE_TWO_ID,
    connectionType: "implemented_by",
    label: "Task to implementation",
    createdAt: NOW,
    ...overrides,
  };
}
