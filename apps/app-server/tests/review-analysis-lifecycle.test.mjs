import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  InMemoryPullRequestAnalysisRepository,
} = require("../src/modules/review/analysis/in-memory-pull-request-analysis.repository.ts");
const {
  PullRequestAnalysisController,
} = require("../src/modules/review/analysis/pull-request-analysis.controller.ts");
const {
  PullRequestAnalysisService,
} = require("../src/modules/review/analysis/pull-request-analysis.service.ts");
const {
  InMemoryCodeReviewRoomRepository,
} = require("../src/modules/review/room/in-memory-code-review-room.repository.ts");
const {
  InMemoryReviewGraphRepository,
} = require("../src/modules/review/graph/in-memory-review-graph.repository.ts");
const {
  PullRequestSummaryRegistry,
} = require("../src/modules/review/room/pull-request-summary.registry.ts");
const {
  ReviewRoomService,
} = require("../src/modules/review/room/review-room.service.ts");
const {
  ReviewGraphService,
} = require("../src/modules/review/graph/review-graph.service.ts");

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
  return new PullRequestAnalysisService(
    new InMemoryPullRequestAnalysisRepository(),
    options,
    options.pullRequestRegistry ?? createRegistry(options),
    options.graphService,
  );
}

function createController() {
  return new PullRequestAnalysisController(createService());
}

describe("PR analysis lifecycle API boundary", () => {
  it("requests and reads a pending PR analysis", async () => {
    const controller = createController();

    const requested = await controller.requestAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );
    const loaded = await controller.getAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );

    assert.equal(requested.analysisStatus, "pending");
    assert.deepEqual(loaded, requested);
  });

  it("does not create duplicate analysis roots for the same PR", async () => {
    const controller = createController();

    const first = await controller.requestAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );
    const second = await controller.requestAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );

    assert.equal(second.id, first.id);
    assert.equal(second.createdAt, first.createdAt);
  });

  it("does not expose mutable repository records", async () => {
    const service = createService();
    const analysis = await service.requestAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );

    analysis.analysisStatus = "succeeded";
    analysis.errorTrace.push("mutated outside the state machine");

    const loaded = await service.getAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );

    assert.equal(loaded.analysisStatus, "pending");
    assert.deepEqual(loaded.errorTrace, []);
  });

  it("can seed the local MVP analysis fixture when the app module opts in", async () => {
    const service = createService({ seedFixture: true });

    const analysis = await service.getAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );

    assert.equal(analysis.id, "88888888-8888-4888-8888-888888888881");
    assert.equal(analysis.analysisStatus, "succeeded");
    assert.equal(analysis.riskLevel, "medium");
  });

  it("rejects analysis requests for pull requests that were not registered", async () => {
    const service = new PullRequestAnalysisService(
      new InMemoryPullRequestAnalysisRepository(),
      {},
      new PullRequestSummaryRegistry(),
    );

    await assert.rejects(
      () => service.requestAnalysis(DEFAULT_PULL_REQUEST_ID),
      /PullRequestSummary was not found/,
    );
  });

  it("requests analysis for runtime PR summaries registered by review rooms", async () => {
    const pullRequestRegistry = new PullRequestSummaryRegistry();
    const graphService = new ReviewGraphService(
      new InMemoryReviewGraphRepository(),
    );
    const roomService = new ReviewRoomService(
      new InMemoryCodeReviewRoomRepository(),
      pullRequestRegistry,
    );
    const analysisService = new PullRequestAnalysisService(
      new InMemoryPullRequestAnalysisRepository(),
      {},
      pullRequestRegistry,
      graphService,
    );
    const pullRequest = {
      id: "77777777-7777-4777-8777-777777777771",
      repositoryId: "55555555-5555-4555-8555-555555555501",
      number: 9,
      title: "Wire runtime review flow",
      authorLogin: "reviewer",
      state: "open",
      branch: "feature/review",
      baseBranch: "dev",
      url: "https://github.com/example/pilo/pull/9",
      changedFilesCount: 3,
      additions: 80,
      deletions: 12,
      linkedTaskIds: [],
      syncedAt: "2026-06-30T00:00:00.000Z",
    };

    await roomService.openRoomForPullRequest(
      pullRequest.id,
      {
        workspaceId: "22222222-2222-4222-8222-222222222222",
        memberId: "33333333-3333-4333-8333-333333333331",
      },
      { pullRequest },
    );

    const analysis = await analysisService.requestAnalysis(pullRequest.id);

    assert.equal(analysis.pullRequestId, pullRequest.id);
    assert.equal(analysis.analysisStatus, "pending");
    const graph = await graphService.getGraph(analysis.id);

    assert.equal(graph.analysisId, analysis.id);
    assert.equal(graph.pullRequestId, pullRequest.id);
    assert.equal(graph.summary, null);
    assert.equal(
      graph.intentSummary,
      "Analysis is pending. The review graph will be populated after analyzer output arrives.",
    );
    assert.equal(
      graph.reviewStrategy,
      "Keep the review canvas available with no nodes until analysis results are written.",
    );
    assert.deepEqual(graph.reviewOrder, []);
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(graph.edges, []);
  });
});

describe("PR analysis state machine", () => {
  it("allows pending -> running -> succeeded", async () => {
    const service = createService();
    const analysis = await service.requestAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );

    const running = await service.transitionAnalysis(analysis.id, "running");
    const succeeded = await service.transitionAnalysis(running.id, "succeeded", {
      purposeSummary: "OAuth callback 화면 골격을 추가했다.",
      impactSummary: "Auth route와 session redirect flow에 영향이 있다.",
      testRecommendation: "성공/실패 redirect smoke test",
      riskLevel: "medium",
      okCount: 3,
      discussCount: 1,
      riskCount: 1,
      conclusion: "리뷰 후 merge 가능",
    });

    assert.equal(succeeded.analysisStatus, "succeeded");
    assert.equal(succeeded.riskLevel, "medium");
    assert.equal(succeeded.okCount, 3);
    assert.deepEqual(service.toAnalysisCompletedEvent(succeeded), {
      eventType: "review.analysis_completed",
      analysisId: succeeded.id,
      pullRequestId: succeeded.pullRequestId,
      analysisStatus: "succeeded",
      errorTrace: [],
      occurredAt: succeeded.updatedAt,
    });
  });

  it("rejects invalid status transitions", async () => {
    const service = createService();
    const analysis = await service.requestAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );

    await assert.rejects(
      () => service.transitionAnalysis(analysis.id, "succeeded"),
      /Invalid review analysis transition/,
    );
  });

  it("preserves failure error traces in completed events", async () => {
    const service = createService();
    const analysis = await service.requestAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );

    const running = await service.transitionAnalysis(analysis.id, "running");
    const failed = await service.transitionAnalysis(running.id, "failed", {
      errorTrace: ["AI worker timed out"],
    });

    assert.deepEqual(service.toAnalysisCompletedEvent(failed), {
      eventType: "review.analysis_completed",
      analysisId: failed.id,
      pullRequestId: failed.pullRequestId,
      analysisStatus: "failed",
      errorTrace: ["AI worker timed out"],
      occurredAt: failed.updatedAt,
    });
  });

  it("rejects invalid result counts instead of hiding upstream errors", async () => {
    const service = createService();
    const analysis = await service.requestAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );

    const running = await service.transitionAnalysis(analysis.id, "running");

    await assert.rejects(
      () =>
        service.transitionAnalysis(running.id, "succeeded", { okCount: -1 }),
      /okCount must be a non-negative integer/,
    );
  });
});
