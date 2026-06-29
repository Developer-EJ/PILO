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
  ReviewPublicController,
} = require("../src/modules/review/public/review-public.controller.ts");
const {
  ReviewPublicService,
} = require("../src/modules/review/public/review-public.service.ts");

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
    const controller = new ReviewPublicController(new ReviewPublicService());

    const summary = controller.getAnalysisSummary(
      "66666666-6666-4666-8666-666666666661",
    );

    assert.equal(summary.pullRequestId, "66666666-6666-4666-8666-666666666661");
    assert.equal(summary.analysisStatus, "succeeded");
    assert.equal(summary.riskLevel, "medium");
    assert.equal(summary.okCount, 3);
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
