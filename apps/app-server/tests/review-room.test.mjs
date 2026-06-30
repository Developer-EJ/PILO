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
const {
  PullRequestSummaryRegistry,
} = require("../src/modules/review/room/pull-request-summary.registry.ts");

const DEFAULT_PULL_REQUEST_ID = "66666666-6666-4666-8666-666666666661";

function createPullRequestSummary(overrides = {}) {
  return {
    id: DEFAULT_PULL_REQUEST_ID,
    repositoryId: "55555555-5555-4555-8555-555555555501",
    number: 7,
    title: "Wire OAuth callback flow",
    authorLogin: "reviewer",
    state: "open",
    branch: "feature/auth-callback",
    baseBranch: "dev",
    url: "https://github.com/example/pilo/pull/7",
    changedFilesCount: 2,
    additions: 42,
    deletions: 8,
    linkedTaskIds: [],
    syncedAt: "2026-06-30T00:00:00.000Z",
    ...overrides,
  };
}

function createRegistry(options = {}) {
  const registry = new PullRequestSummaryRegistry(
    options.seedFixture ? { seedFixture: true } : {},
  );

  if (!options.seedFixture) {
    registry.save(createPullRequestSummary());
  }

  return registry;
}

function createService(options = {}) {
  return new ReviewRoomService(
    new InMemoryCodeReviewRoomRepository(),
    createRegistry(options),
  );
}

function createController(options = {}) {
  return new ReviewRoomController(createService(options));
}

describe("review room API boundary", () => {
  it("opens a code review room from an explicitly seeded PullRequestSummary fixture", async () => {
    const controller = createController({ seedFixture: true });

    const room = await controller.openRoomForPullRequest(
      "66666666-6666-4666-8666-666666666661",
    );

    assert.equal(room.pullRequestId, "66666666-6666-4666-8666-666666666661");
    assert.equal(room.workspaceId, "22222222-2222-4222-8222-222222222222");
    assert.equal(room.status, "open");
    assert.equal(room.pullRequest.number, 7);
  });

  it("does not open rooms for unknown pull requests by default", async () => {
    const controller = new ReviewRoomController(
      new ReviewRoomService(
        new InMemoryCodeReviewRoomRepository(),
        new PullRequestSummaryRegistry(),
      ),
    );

    await assert.rejects(
      () => controller.openRoomForPullRequest(DEFAULT_PULL_REQUEST_ID),
      /PullRequestSummary was not found/,
    );
  });

  it("stores the caller context instead of a hard-coded room owner", async () => {
    const service = createService();

    const room = await service.openRoomForPullRequest(
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

  it("passes caller context from the controller boundary", async () => {
    const controller = createController();

    const room = await controller.openRoomForPullRequest(
      "66666666-6666-4666-8666-666666666661",
      {},
      "22222222-2222-4222-8222-222222222229",
      "33333333-3333-4333-8333-333333333339",
    );

    assert.equal(room.workspaceId, "22222222-2222-4222-8222-222222222229");
    assert.equal(
      room.createdByMemberId,
      "33333333-3333-4333-8333-333333333339",
    );
  });

  it("returns the existing room for the same pull request", async () => {
    const controller = createController();

    const first = await controller.openRoomForPullRequest(
      "66666666-6666-4666-8666-666666666661",
    );
    const second = await controller.openRoomForPullRequest(
      "66666666-6666-4666-8666-666666666661",
    );

    assert.equal(second.id, first.id);
    assert.equal(second.createdAt, first.createdAt);
  });

  it("opens a code review room from a runtime PullRequestSummary body", async () => {
    const controller = createController();
    const pullRequest = {
      id: "77777777-7777-4777-8777-777777777771",
      repositoryId: "55555555-5555-4555-8555-555555555501",
      number: 9,
      title: "Wire GitHub review flow",
      authorLogin: "reviewer",
      state: "changes_requested",
      branch: "feature/review",
      baseBranch: "dev",
      url: "https://github.com/example/pilo/pull/9",
      changedFilesCount: 3,
      additions: 80,
      deletions: 12,
      linkedTaskIds: ["44444444-4444-4444-8444-444444444441"],
      syncedAt: "2026-06-30T00:00:00.000Z",
    };

    const room = await controller.openRoomForPullRequest(
      pullRequest.id,
      { pullRequest },
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333331",
    );
    const loaded = await controller.getRoom(room.id);

    assert.equal(room.pullRequestId, pullRequest.id);
    assert.equal(room.pullRequest.title, pullRequest.title);
    assert.equal(room.pullRequest.state, "changes_requested");
    assert.deepEqual(loaded.pullRequest, room.pullRequest);
  });

  it("loads a persisted room from its PullRequestSummary snapshot", async () => {
    const repository = new InMemoryCodeReviewRoomRepository();
    const pullRequest = createPullRequestSummary({
      id: "77777777-7777-4777-8777-777777777771",
      title: "Persist review room summary snapshot",
    });
    const creatingService = new ReviewRoomService(
      repository,
      new PullRequestSummaryRegistry(),
    );
    const room = await creatingService.openRoomForPullRequest(
      pullRequest.id,
      {
        workspaceId: "22222222-2222-4222-8222-222222222222",
        memberId: "33333333-3333-4333-8333-333333333331",
      },
      { pullRequest },
    );
    const restartedService = new ReviewRoomService(
      repository,
      new PullRequestSummaryRegistry(),
    );

    const loaded = await restartedService.getRoom(room.id);

    assert.equal(loaded.pullRequest.id, pullRequest.id);
    assert.equal(loaded.pullRequest.title, pullRequest.title);
  });

  it("loads a review room by room id", async () => {
    const controller = createController();
    const opened = await controller.openRoomForPullRequest(
      "66666666-6666-4666-8666-666666666661",
    );

    const loaded = await controller.getRoom(opened.id);

    assert.deepEqual(loaded, opened);
  });
});
