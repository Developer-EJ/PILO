import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  InMemoryPullRequestAnalysisRepository,
} = require("../src/modules/review/analysis/in-memory-pull-request-analysis.repository.ts");
const {
  PullRequestAnalysisService,
} = require("../src/modules/review/analysis/pull-request-analysis.service.ts");
const {
  AgentResultConsumerService,
} = require("../src/modules/review/result/agent-result-consumer.service.ts");

function createServices() {
  const repository = new InMemoryPullRequestAnalysisRepository();

  return {
    analysisService: new PullRequestAnalysisService(repository),
    resultConsumer: new AgentResultConsumerService(repository),
  };
}

describe("agent result root analysis consumer", () => {
  it("applies succeeded result summary fields idempotently", () => {
    const { analysisService, resultConsumer } = createServices();
    analysisService.requestAnalysis("66666666-6666-4666-8666-666666666661");

    const message = {
      jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      runId: "99999999-9999-4999-8999-999999999901",
      status: "succeeded",
      finishedAt: "2026-06-27T10:01:00.000Z",
      output: {
        pullRequestId: "66666666-6666-4666-8666-666666666661",
        purposeSummary: "OAuth callback 화면 골격 추가",
        impactSummary: "Auth route와 session redirect flow에 영향",
        testRecommendation: "로그인 실패와 성공 redirect smoke test",
        riskLevel: "medium",
        conclusion: "리뷰 가능",
        graph: {
          nodes: [
            { status: "ok", riskLevel: "low" },
            { status: "discuss", riskLevel: "medium" },
          ],
        },
      },
    };

    const first = resultConsumer.applyResult(message);
    const second = resultConsumer.applyResult(message);

    assert.equal(first.analysisStatus, "succeeded");
    assert.equal(first.riskLevel, "medium");
    assert.equal(first.okCount, 1);
    assert.equal(first.discussCount, 1);
    assert.equal(first.riskCount, 1);
    assert.equal(second.updatedAt, first.updatedAt);
  });

  it("applies failed result with error trace", () => {
    const { analysisService, resultConsumer } = createServices();
    analysisService.requestAnalysis("66666666-6666-4666-8666-666666666661");

    const failed = resultConsumer.applyResult({
      jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      runId: "99999999-9999-4999-8999-999999999902",
      status: "failed",
      finishedAt: "2026-06-27T10:02:00.000Z",
      output: {
        pullRequestId: "66666666-6666-4666-8666-666666666661",
      },
      error: { code: "WORKFLOW_FAILED", message: "review workflow failed" },
    });

    assert.equal(failed.analysisStatus, "failed");
    assert.deepEqual(failed.errorTrace, [
      "[WORKFLOW_FAILED] review workflow failed",
    ]);
  });
});
