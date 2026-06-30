import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  InMemoryReviewArtifactsRepository,
} = require("../src/modules/review/artifacts/in-memory-review-artifacts.repository.ts");
const {
  ReviewArtifactsController,
} = require("../src/modules/review/artifacts/review-artifacts.controller.ts");
const {
  ReviewArtifactsService,
} = require("../src/modules/review/artifacts/review-artifacts.service.ts");

function createController() {
  return new ReviewArtifactsController(
    new ReviewArtifactsService(new InMemoryReviewArtifactsRepository()),
  );
}

describe("review comment/checklist API boundary", () => {
  it("creates human review comments for a review room", async () => {
    const controller = createController();
    const roomId = "88888888-8888-4888-8888-888888888811";

    const comment = await controller.createComment(roomId, {
      authorMemberId: "33333333-3333-4333-8333-333333333331",
      nodeId: "88888888-8888-4888-8888-888888888891",
      body: "Please check the failure redirect path.",
      createdAt: "2026-06-27T10:00:00.000Z",
    });

    assert.equal(comment.roomId, roomId);
    assert.equal(comment.body, "Please check the failure redirect path.");
    assert.deepEqual(await controller.listComments(roomId), [comment]);
  });

  it("rejects empty review comments", async () => {
    const controller = createController();

    await assert.rejects(
      () =>
        controller.createComment("room-1", {
          authorMemberId: "33333333-3333-4333-8333-333333333331",
          body: "   ",
        }),
      /body is required/,
    );
  });

  it("requires an author for human review comments", async () => {
    const controller = createController();

    await assert.rejects(
      () => controller.createComment("room-1", { body: "Check this path." }),
      /authorMemberId is required/,
    );
  });

  it("creates and upserts checklist items by analysis, type, and sort order", async () => {
    const controller = createController();
    const analysisId = "88888888-8888-4888-8888-888888888881";

    const first = await controller.createChecklistItem(analysisId, {
      checklistType: "review",
      title: "Review risky nodes",
      sortOrder: 0,
      changedAt: "2026-06-27T10:00:00.000Z",
    });
    const second = await controller.createChecklistItem(analysisId, {
      checklistType: "review",
      title: "Review risky nodes",
      status: "done",
      checkedByMemberId: "33333333-3333-4333-8333-333333333331",
      sortOrder: 0,
      changedAt: "2026-06-27T10:05:00.000Z",
    });

    assert.equal(second.id, first.id);
    assert.equal(second.status, "done");
    assert.equal(second.checkedAt, "2026-06-27T10:05:00.000Z");
    assert.deepEqual(await controller.listChecklistItems(analysisId), [second]);
  });

  it("chooses the next checklist sort order from the current maximum", async () => {
    const controller = createController();
    const analysisId = "88888888-8888-4888-8888-888888888881";

    await controller.createChecklistItem(analysisId, {
      checklistType: "review",
      title: "First",
      sortOrder: 0,
    });
    await controller.createChecklistItem(analysisId, {
      checklistType: "review",
      title: "Third",
      sortOrder: 2,
    });
    const next = await controller.createChecklistItem(analysisId, {
      checklistType: "review",
      title: "Next",
    });

    assert.equal(next.sortOrder, 3);
  });

  it("updates checklist item completion state by item id", async () => {
    const controller = createController();
    const analysisId = "88888888-8888-4888-8888-888888888881";
    const item = await controller.createChecklistItem(analysisId, {
      checklistType: "review",
      title: "Confirm runtime review result",
      sortOrder: 0,
      changedAt: "2026-06-27T10:00:00.000Z",
    });

    const done = await controller.updateChecklistItem(item.id, {
      status: "done",
      checkedByMemberId: "33333333-3333-4333-8333-333333333331",
      changedAt: "2026-06-27T10:10:00.000Z",
    });

    assert.equal(done.status, "done");
    assert.equal(
      done.checkedByMemberId,
      "33333333-3333-4333-8333-333333333331",
    );
    assert.equal(done.checkedAt, "2026-06-27T10:10:00.000Z");
    assert.equal(done.updatedAt, "2026-06-27T10:10:00.000Z");

    const todo = await controller.updateChecklistItem(item.id, {
      status: "todo",
      changedAt: "2026-06-27T10:15:00.000Z",
    });

    assert.equal(todo.status, "todo");
    assert.equal(todo.checkedByMemberId, null);
    assert.equal(todo.checkedAt, null);
    assert.deepEqual(await controller.listChecklistItems(analysisId), [todo]);
  });

  it("rejects invalid checklist fields", async () => {
    const controller = createController();

    await assert.rejects(
      () =>
        controller.createChecklistItem("analysis-1", {
          checklistType: "release",
          title: "Check release",
        }),
      /Invalid checklist type/,
    );
    await assert.rejects(
      () =>
        controller.createChecklistItem("analysis-1", {
          title: "Check release",
          status: "blocked",
        }),
      /Invalid checklist status/,
    );
    await assert.rejects(
      () =>
        controller.createChecklistItem("analysis-1", {
          title: "Check release",
          sortOrder: -1,
        }),
      /sortOrder must be a non-negative integer/,
    );
    await assert.rejects(
      () => controller.updateChecklistItem("missing-item", { status: "todo" }),
      /Review checklist item was not found/,
    );
  });
});
