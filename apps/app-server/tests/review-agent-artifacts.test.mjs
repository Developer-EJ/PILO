import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  InMemoryReviewArtifactsRepository,
} = require("../src/modules/review/artifacts/in-memory-review-artifacts.repository.ts");
const {
  ReviewArtifactsService,
} = require("../src/modules/review/artifacts/review-artifacts.service.ts");
const {
  AgentReviewArtifactsResultService,
} = require("../src/modules/review/result/agent-review-artifacts-result.service.ts");

function createService() {
  return new AgentReviewArtifactsResultService(
    new ReviewArtifactsService(new InMemoryReviewArtifactsRepository()),
  );
}

describe("agent result review artifacts adapter", () => {
  it("stores questions, risks, and checklist result payloads", () => {
    const service = createService();
    const analysisId = "88888888-8888-4888-8888-888888888885";

    const applied = service.applyArtifacts(analysisId, {
      questions: [
        {
          question: "실패 redirect smoke test를 확인했나요?",
          priority: "medium",
        },
      ],
      risks: [
        {
          title: "callback failure state",
          description: "실패 상태가 보이지 않으면 재시도 경로가 불명확하다.",
          riskLevel: "medium",
          recommendation: "provider error query param fixture를 추가한다.",
        },
      ],
      checklist: [
        { type: "review", title: "변경 파일 요약과 diff를 대조한다." },
        { type: "merge", title: "redirect smoke test 결과를 확인한다." },
      ],
    });

    assert.equal(applied.questions.length, 1);
    assert.equal(applied.questions[0].priority, "medium");
    assert.equal(applied.risks[0].riskLevel, "medium");
    assert.equal(applied.checklist.length, 2);
    assert.equal(applied.checklist[1].checklistType, "merge");
  });

  it("upserts questions and risks by text/title", () => {
    const service = createService();
    const analysisId = "88888888-8888-4888-8888-888888888885";

    const first = service.applyArtifacts(analysisId, {
      questions: [{ question: "테스트가 충분한가요?", priority: "medium" }],
      risks: [
        { title: "테스트 누락", description: "회귀 위험", level: "high" },
      ],
    });
    const second = service.applyArtifacts(analysisId, {
      questions: [{ question: "테스트가 충분한가요?", priority: "high" }],
      risks: [
        { title: "테스트 누락", description: "회귀 위험 낮음", level: "low" },
      ],
    });

    assert.equal(second.questions.length, 1);
    assert.equal(second.questions[0].id, first.questions[0].id);
    assert.equal(second.questions[0].priority, "high");
    assert.equal(second.risks[0].id, first.risks[0].id);
    assert.equal(second.risks[0].riskLevel, "low");
  });

  it("rejects invalid artifact enum values", () => {
    const service = createService();

    assert.throws(
      () =>
        service.applyArtifacts("analysis-1", {
          questions: [{ question: "bad", priority: "later" }],
        }),
      /Invalid review question priority/,
    );
    assert.throws(
      () =>
        service.applyArtifacts("analysis-1", {
          risks: [{ title: "bad", description: "bad", level: "warning" }],
        }),
      /Invalid review risk level/,
    );
  });
});
