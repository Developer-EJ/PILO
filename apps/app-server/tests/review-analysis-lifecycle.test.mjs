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

function createService(options = {}) {
  return new PullRequestAnalysisService(
    new InMemoryPullRequestAnalysisRepository(),
    options,
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

  it("does not expose mutable repository records", () => {
    const service = createService();
    const analysis = service.requestAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );

    analysis.analysisStatus = "succeeded";
    analysis.errorTrace.push("mutated outside the state machine");

    const loaded = service.getAnalysis("66666666-6666-4666-8666-666666666661");

    assert.equal(loaded.analysisStatus, "pending");
    assert.deepEqual(loaded.errorTrace, []);
  });

  it("can seed the local MVP analysis fixture when the app module opts in", () => {
    const service = createService({ seedFixture: true });

    const analysis = service.getAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );

    assert.equal(analysis.id, "88888888-8888-4888-8888-888888888881");
    assert.equal(analysis.analysisStatus, "succeeded");
    assert.equal(analysis.riskLevel, "medium");
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

  it("preserves failure error traces in completed events", () => {
    const service = createService();
    const analysis = service.requestAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );

    const running = service.transitionAnalysis(analysis.id, "running");
    const failed = service.transitionAnalysis(running.id, "failed", {
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

  it("rejects invalid result counts instead of hiding upstream errors", () => {
    const service = createService();
    const analysis = service.requestAnalysis(
      "66666666-6666-4666-8666-666666666661",
    );

    const running = service.transitionAnalysis(analysis.id, "running");

    assert.throws(
      () =>
        service.transitionAnalysis(running.id, "succeeded", { okCount: -1 }),
      /okCount must be a non-negative integer/,
    );
  });
});
