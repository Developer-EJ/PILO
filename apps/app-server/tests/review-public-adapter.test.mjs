import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const { BadRequestException, ParseUUIDPipe } = require("@nestjs/common");
const {
  toPRAnalysisSummary,
} = require("../src/modules/review/public/pr-analysis-summary.adapter.ts");
const {
  InMemoryPullRequestAnalysisRepository,
} = require("../src/modules/review/analysis/in-memory-pull-request-analysis.repository.ts");
const {
  PullRequestAnalysisService,
} = require("../src/modules/review/analysis/pull-request-analysis.service.ts");
const {
  ChangedFilesService,
} = require("../src/modules/review/changes/changed-files.service.ts");
const {
  InMemoryChangedFilesRepository,
} = require("../src/modules/review/changes/in-memory-changed-files.repository.ts");
const {
  ReviewPublicController,
} = require("../src/modules/review/public/review-public.controller.ts");
const {
  ReviewPublicService,
} = require("../src/modules/review/public/review-public.service.ts");
const {
  InMemoryCodeReviewRoomRepository,
} = require("../src/modules/review/room/in-memory-code-review-room.repository.ts");
const {
  ReviewRoomService,
} = require("../src/modules/review/room/review-room.service.ts");

const REVIEW_WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const REVIEW_PULL_REQUEST_ID = "66666666-6666-4666-8666-666666666661";

function createReviewPublicHarness() {
  const analysisService = new PullRequestAnalysisService(
    new InMemoryPullRequestAnalysisRepository(),
  );
  const changedFilesService = new ChangedFilesService(
    new InMemoryChangedFilesRepository(),
    { seedFixture: true },
  );
  const reviewRoomService = new ReviewRoomService(
    new InMemoryCodeReviewRoomRepository(),
  );
  const publicService = new ReviewPublicService(
    analysisService,
    changedFilesService,
    reviewRoomService,
  );

  return {
    analysisService,
    controller: new ReviewPublicController(publicService),
    reviewRoomService,
  };
}

describe("review public adapter", () => {
  it("maps a DB-style PR analysis row to PRAnalysisSummary", () => {
    const summary = toPRAnalysisSummary({
      id: "88888888-8888-4888-8888-888888888881",
      pull_request_id: "66666666-6666-4666-8666-666666666661",
      purpose_summary: "OAuth callback 화면 골격 추가",
      impact_summary: "Auth route와 session redirect flow에 영향",
      test_recommendation: "성공/실패 redirect smoke test",
      risk_level: "medium",
      analysis_status: "succeeded",
      ok_count: 3,
      discuss_count: 1,
      risk_count: 1,
      conclusion: "리뷰 가능",
    });

    assert.deepEqual(summary, {
      id: "88888888-8888-4888-8888-888888888881",
      pullRequestId: "66666666-6666-4666-8666-666666666661",
      purposeSummary: "OAuth callback 화면 골격 추가",
      impactSummary: "Auth route와 session redirect flow에 영향",
      testRecommendation: "성공/실패 redirect smoke test",
      riskLevel: "medium",
      analysisStatus: "succeeded",
      okCount: 3,
      discussCount: 1,
      riskCount: 1,
      conclusion: "리뷰 가능",
    });
  });

  it("fills safe defaults for nullable analysis fields", () => {
    const summary = toPRAnalysisSummary({
      id: "88888888-8888-4888-8888-888888888881",
      pullRequestId: "66666666-6666-4666-8666-666666666661",
      okCount: null,
      discussCount: null,
      riskCount: undefined,
    });

    assert.equal(summary.riskLevel, "low");
    assert.equal(summary.analysisStatus, "pending");
    assert.equal(summary.okCount, 0);
    assert.equal(summary.discussCount, 0);
    assert.equal(summary.riskCount, 0);
    assert.equal(summary.conclusion, null);
  });

  it("falls back when runtime enum fields are outside the public contract", () => {
    const summary = toPRAnalysisSummary({
      id: "88888888-8888-4888-8888-888888888881",
      pullRequestId: "66666666-6666-4666-8666-666666666661",
      riskLevel: "blocked",
      analysisStatus: "done",
    });

    assert.equal(summary.riskLevel, "low");
    assert.equal(summary.analysisStatus, "pending");
  });
});

describe("review public API boundary", () => {
  it("returns PRAnalysisSummary for Dashboard and Canvas consumers", () => {
    const { controller } = createReviewPublicHarness();

    const summary = controller.getAnalysisSummary(REVIEW_PULL_REQUEST_ID);

    assert.equal(summary.pullRequestId, REVIEW_PULL_REQUEST_ID);
    assert.equal(summary.analysisStatus, "succeeded");
    assert.equal(summary.riskLevel, "medium");
    assert.equal(summary.okCount, 3);
  });

  it("returns workspace-level review metrics for Workspace dashboard consumers", () => {
    const { controller, reviewRoomService } = createReviewPublicHarness();

    const unopenedSummary =
      controller.getWorkspaceReviewSummary(REVIEW_WORKSPACE_ID);

    assert.equal(unopenedSummary.workspaceId, REVIEW_WORKSPACE_ID);
    assert.equal(unopenedSummary.reviewPendingPullRequestCount, 1);
    assert.equal(unopenedSummary.totalChangedFilesCount, 4);
    assert.equal(unopenedSummary.analyzedChangedFilesCount, 1);
    assert.equal(unopenedSummary.totalRiskCount, 1);
    assert.equal(unopenedSummary.pullRequests[0].analysisStatus, "succeeded");
    assert.equal(unopenedSummary.pullRequests[0].analysisSource, "fixture");
    assert.equal(unopenedSummary.pullRequests[0].roomId, null);

    const room = reviewRoomService.openRoomForPullRequest(REVIEW_PULL_REQUEST_ID);
    const openedSummary = controller.getWorkspaceReviewSummary(
      REVIEW_WORKSPACE_ID,
    );

    assert.equal(openedSummary.pullRequests[0].roomId, room.id);
    assert.equal(openedSummary.pullRequests[0].reviewRoomStatus, "open");
  });

  it("lets runtime analysis state override the fixture dashboard summary", () => {
    const { analysisService, controller } = createReviewPublicHarness();

    analysisService.requestAnalysis(REVIEW_PULL_REQUEST_ID);

    const summary = controller.getWorkspaceReviewSummary(REVIEW_WORKSPACE_ID);

    assert.equal(summary.pullRequests[0].analysisStatus, "pending");
    assert.equal(summary.pullRequests[0].analysisSource, "runtime");
    assert.equal(summary.totalRiskCount, 0);
    assert.equal(summary.analyzedChangedFilesCount, 0);
  });

  it("rejects malformed pull request ids at the controller boundary", async () => {
    const pipe = new ParseUUIDPipe();

    await assert.rejects(
      async () =>
        pipe.transform("not-a-uuid", {
          type: "param",
          metatype: String,
          data: "pullRequestId",
        }),
      BadRequestException,
    );
  });
});
