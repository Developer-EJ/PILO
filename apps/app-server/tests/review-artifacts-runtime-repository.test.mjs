import assert from "node:assert/strict";
import { createRequire } from "node:module";
import process from "node:process";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  RuntimeReviewArtifactsRepository,
} = require("../src/modules/review/artifacts/runtime-review-artifacts.repository.ts");

const ROOM_ID = "88888888-8888-4888-8888-888888888811";
const COMMENT_ID = "88888888-8888-4888-8888-888888888812";
const ANALYSIS_ID = "88888888-8888-4888-8888-888888888881";
const CHECKLIST_ID = "88888888-8888-4888-8888-888888888813";
const MEMBER_ID = "33333333-3333-4333-8333-333333333331";

describe("RuntimeReviewArtifactsRepository database persistence", () => {
  it("restores comments and checklist items after repository restart", async () => {
    await withDatabaseConnectEnabled(async () => {
      const database = createReviewArtifactsDatabaseStub();
      const repository = new RuntimeReviewArtifactsRepository(database);

      const comment = await repository.saveComment({
        id: COMMENT_ID,
        roomId: ROOM_ID,
        authorMemberId: MEMBER_ID,
        nodeId: "review-node-runtime-file",
        changedFileId: null,
        changedFunctionId: null,
        body: "Check runtime comment persistence.",
        createdAt: "2026-06-30T00:00:00.000Z",
      });
      const checklistItem = await repository.saveChecklistItem({
        id: CHECKLIST_ID,
        analysisId: ANALYSIS_ID,
        checklistType: "review",
        title: "Open generated review room data before merge",
        status: "todo",
        checkedByMemberId: null,
        checkedAt: null,
        sortOrder: 0,
        createdAt: "2026-06-30T00:00:00.000Z",
        updatedAt: "2026-06-30T00:00:00.000Z",
      });
      const restartedRepository = new RuntimeReviewArtifactsRepository(
        database,
      );

      assert.equal(repository.mode, "database");
      assert.deepEqual(await restartedRepository.listCommentsByRoom(ROOM_ID), [
        comment,
      ]);
      assert.deepEqual(
        await restartedRepository.findChecklistItemBySlot(
          ANALYSIS_ID,
          "review",
          0,
        ),
        checklistItem,
      );
      assert.deepEqual(
        await restartedRepository.findChecklistItemById(CHECKLIST_ID),
        checklistItem,
      );
      assert.deepEqual(
        await restartedRepository.listChecklistItems(ANALYSIS_ID),
        [checklistItem],
      );
      assert.equal(
        await restartedRepository.nextChecklistSortOrder(
          ANALYSIS_ID,
          "review",
        ),
        1,
      );
      assert.equal(
        database.calls.some((call) => /INSERT INTO review_comments/.test(call.sql)),
        true,
      );
      assert.equal(
        database.calls.some((call) =>
          /INSERT INTO review_checklist_items/.test(call.sql),
        ),
        true,
      );
    });
  });

  it("falls back to memory storage when database connection is explicitly skipped", async () => {
    await withDatabaseConnectSkipped(async () => {
      const database = createReviewArtifactsDatabaseStub();
      const repository = new RuntimeReviewArtifactsRepository(database);

      await repository.saveChecklistItem({
        id: CHECKLIST_ID,
        analysisId: ANALYSIS_ID,
        checklistType: "review",
        title: "Check memory fallback",
        status: "todo",
        checkedByMemberId: null,
        checkedAt: null,
        sortOrder: 0,
        createdAt: "2026-06-30T00:00:00.000Z",
        updatedAt: "2026-06-30T00:00:00.000Z",
      });

      assert.equal(repository.mode, "memory");
      assert.equal(
        (await repository.findChecklistItemById(CHECKLIST_ID)).id,
        CHECKLIST_ID,
      );
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

function createReviewArtifactsDatabaseStub() {
  const state = {
    commentsById: new Map(),
    commentIdsByRoom: new Map(),
    checklistItemsById: new Map(),
    checklistItemIdsBySlot: new Map(),
  };
  const calls = [];

  return {
    state,
    calls,
    async $queryRaw(strings, ...values) {
      const sql = normalizeSql(strings);
      const params = queryParams(values);
      calls.push({ sql, values: params });

      if (/INSERT INTO review_comments/.test(sql)) {
        const [
          id,
          roomId,
          authorMemberId,
          nodeId,
          changedFileId,
          changedFunctionId,
          body,
          createdAt,
        ] = params;
        const comment = {
          id,
          roomId,
          authorMemberId,
          nodeId,
          changedFileId,
          changedFunctionId,
          body,
          createdAt,
        };
        const commentIds = state.commentIdsByRoom.get(roomId) ?? [];

        state.commentsById.set(id, comment);
        if (!commentIds.includes(id)) {
          state.commentIdsByRoom.set(roomId, [...commentIds, id]);
        }

        return rowForComment(comment);
      }

      if (/SELECT .* FROM review_comments.*WHERE room_id =/.test(sql)) {
        const roomId = params[0];

        return (state.commentIdsByRoom.get(roomId) ?? []).flatMap(
          (commentId) => rowForComment(state.commentsById.get(commentId)),
        );
      }

      if (
        /SELECT .* FROM review_checklist_items.*WHERE analysis_id =.*AND checklist_type =.*AND sort_order/.test(
          sql,
        )
      ) {
        const [analysisId, checklistType, sortOrder] = params;
        const itemId = state.checklistItemIdsBySlot.get(
          checklistSlotKey(analysisId, checklistType, sortOrder),
        );

        return rowForChecklistItem(state.checklistItemsById.get(itemId));
      }

      if (/SELECT MAX\(sort_order\)/.test(sql)) {
        const [analysisId, checklistType] = params;
        const sortOrders = [...state.checklistItemsById.values()]
          .filter(
            (item) =>
              item.analysisId === analysisId &&
              item.checklistType === checklistType,
          )
          .map((item) => item.sortOrder);

        return [
          {
            maxSortOrder: sortOrders.length ? Math.max(...sortOrders) : null,
          },
        ];
      }

      if (/SELECT .* FROM review_checklist_items.*WHERE analysis_id =/.test(sql)) {
        const analysisId = params[0];

        return [...state.checklistItemsById.values()]
          .filter((item) => item.analysisId === analysisId)
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .flatMap(rowForChecklistItem);
      }

      if (/SELECT .* FROM review_checklist_items.*WHERE id =/.test(sql)) {
        return rowForChecklistItem(state.checklistItemsById.get(params[0]));
      }

      if (/INSERT INTO review_checklist_items/.test(sql)) {
        const [
          id,
          analysisId,
          checklistType,
          title,
          status,
          checkedByMemberId,
          checkedAt,
          sortOrder,
          createdAt,
          updatedAt,
        ] = params;
        const slotKey = checklistSlotKey(
          analysisId,
          checklistType,
          sortOrder,
        );
        const existingId = state.checklistItemIdsBySlot.get(slotKey);
        const existing = state.checklistItemsById.get(existingId);
        const item = {
          id: existing?.id ?? id,
          analysisId,
          checklistType,
          title,
          status,
          checkedByMemberId,
          checkedAt,
          sortOrder,
          createdAt: existing?.createdAt ?? createdAt,
          updatedAt,
        };

        state.checklistItemsById.set(item.id, item);
        state.checklistItemIdsBySlot.set(slotKey, item.id);
        return rowForChecklistItem(item);
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

function rowForComment(comment) {
  return comment
    ? [
        {
          id: comment.id,
          roomId: comment.roomId,
          authorMemberId: comment.authorMemberId,
          nodeId: comment.nodeId,
          changedFileId: comment.changedFileId,
          changedFunctionId: comment.changedFunctionId,
          body: comment.body,
          createdAt: comment.createdAt,
        },
      ]
    : [];
}

function rowForChecklistItem(item) {
  return item
    ? [
        {
          id: item.id,
          analysisId: item.analysisId,
          checklistType: item.checklistType,
          title: item.title,
          status: item.status,
          checkedByMemberId: item.checkedByMemberId,
          checkedAt: item.checkedAt,
          sortOrder: item.sortOrder,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
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

function checklistSlotKey(analysisId, checklistType, sortOrder) {
  return `${analysisId}:${checklistType}:${sortOrder}`;
}

function normalizeSql(strings) {
  const parts = Array.isArray(strings)
    ? Array.from(strings)
    : Array.isArray(strings?.strings)
      ? strings.strings
      : [String(strings)];

  return parts.join("?").replace(/\s+/g, " ").trim();
}
