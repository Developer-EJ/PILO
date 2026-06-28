import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  InMemoryCodeReviewRoomRepository,
} = require("../src/modules/review/room/in-memory-code-review-room.repository.ts");
const {
  ReviewRoomController,
} = require("../src/modules/review/room/review-room.controller.ts");
const {
  ReviewRoomService,
} = require("../src/modules/review/room/review-room.service.ts");

function createController() {
  return new ReviewRoomController(
    new ReviewRoomService(new InMemoryCodeReviewRoomRepository()),
  );
}

describe("review room API boundary", () => {
  it("opens a code review room from a PullRequestSummary fixture", () => {
    const controller = createController();

    const room = controller.openRoomForPullRequest(
      "66666666-6666-4666-8666-666666666661",
    );

    assert.equal(room.pullRequestId, "66666666-6666-4666-8666-666666666661");
    assert.equal(room.workspaceId, "22222222-2222-4222-8222-222222222222");
    assert.equal(room.status, "open");
    assert.equal(room.pullRequest.number, 7);
  });

  it("stores the caller context instead of a hard-coded room owner", () => {
    const service = new ReviewRoomService(
      new InMemoryCodeReviewRoomRepository(),
    );

    const room = service.openRoomForPullRequest(
      "66666666-6666-4666-8666-666666666661",
      {
        workspaceId: "22222222-2222-4222-8222-222222222229",
        memberId: "33333333-3333-4333-8333-333333333339",
      },
    );

    assert.equal(room.workspaceId, "22222222-2222-4222-8222-222222222229");
    assert.equal(
      room.createdByMemberId,
      "33333333-3333-4333-8333-333333333339",
    );
  });

  it("returns the existing room for the same pull request", () => {
    const controller = createController();

    const first = controller.openRoomForPullRequest(
      "66666666-6666-4666-8666-666666666661",
    );
    const second = controller.openRoomForPullRequest(
      "66666666-6666-4666-8666-666666666661",
    );

    assert.equal(second.id, first.id);
    assert.equal(second.createdAt, first.createdAt);
  });

  it("loads a review room by room id", () => {
    const controller = createController();
    const opened = controller.openRoomForPullRequest(
      "66666666-6666-4666-8666-666666666661",
    );

    const loaded = controller.getRoom(opened.id);

    assert.deepEqual(loaded, opened);
  });
});
