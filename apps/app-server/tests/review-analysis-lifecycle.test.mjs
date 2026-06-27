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

function createService() {
  return new PullRequestAnalysisService(
    new InMemoryPullRequestAnalysisRepository(),
  );
}

function createController() {
  return new PullRequestAnalysisController(createService());
}

describe("PR analysis lifecycle API boundary", () => {
  it("requests and reads a pending PR analysis", () => {
    const controller = createController();

    const requested = controller.requestAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );
    const loaded = controller.getAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );

    assert.equal(requested.analysisStatus, "pending");
    assert.deepEqual(loaded, requested);
  });

  it("does not create duplicate analysis roots for the same PR", () => {
    const controller = createController();

    const first = controller.requestAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );
    const second = controller.requestAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );

    assert.equal(second.id, first.id);
    assert.equal(second.createdAt, first.createdAt);
  });
});

describe("PR analysis state machine", () => {
  it("allows pending -> running -> succeeded", () => {
    const service = createService();
    const analysis = service.requestAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );

    const running = service.transitionAnalysis(analysis.id, "running");
    const succeeded = service.transitionAnalysis(running.id, "succeeded", {
      purposeSummary: "OAuth callback 화면 골격 추가",
      impactSummary: "Auth route와 session redirect flow에 영향",
      testRecommendation: "성공/실패 redirect smoke test",
      riskLevel: "medium",
      okCount: 3,
      discussCount: 1,
      riskCount: 1,
      conclusion: "리뷰 가능",
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

  it("rejects invalid status transitions", () => {
    const service = createService();
    const analysis = service.requestAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );

    assert.throws(
      () => service.transitionAnalysis(analysis.id, "succeeded"),
      /Invalid review analysis transition/,
    );
  });
});
