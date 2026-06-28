import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  InMemoryReviewGraphRepository,
} = require("../src/modules/review/graph/in-memory-review-graph.repository.ts");
const {
  AgentGraphResultService,
} = require("../src/modules/review/result/agent-graph-result.service.ts");

function createService() {
  return new AgentGraphResultService(new InMemoryReviewGraphRepository());
}

describe("agent result graph adapter", () => {
  it("upserts graph and review nodes from result payload", () => {
    const service = createService();
    const analysisId = "88888888-8888-4888-8888-888888888884";

    const first = service.applyGraph(analysisId, {
      summary: "callback review graph",
      intentSummary: "callback route intent",
      reviewStrategy: "file first",
      nodes: [
        {
          id: "review-node-file-1",
          nodeType: "file",
          label: "apps/frontend/app/auth/callback/page.tsx",
          filePath: "apps/frontend/app/auth/callback/page.tsx",
          riskLevel: "medium",
          reviewOrder: 1,
          roleSummary: "callback page entry",
          reviewReason: "auth flow entry point",
          position: { x: 84, y: 72 },
        },
      ],
    });
    const second = service.applyGraph(analysisId, {
      summary: "updated callback review graph",
      nodes: [
        {
          id: "review-node-file-1",
          nodeType: "file",
          label: "apps/frontend/app/auth/callback/page.tsx",
          filePath: "apps/frontend/app/auth/callback/page.tsx",
          riskLevel: "low",
          reviewOrder: 1,
          roleSummary: "callback page entry",
          reviewReason: "auth flow entry point",
          position: { x: 84, y: 72 },
        },
      ],
    });

    assert.equal(second.id, first.id);
    assert.equal(second.summary, "updated callback review graph");
    assert.equal(first.intentSummary, "callback route intent");
    assert.equal(second.nodes.length, 1);
    assert.equal(second.nodes[0].riskLevel, "low");
    assert.equal(second.nodes[0].reviewOrder, 1);
    assert.deepEqual(second.nodes[0].position, { x: 84, y: 72 });
  });

  it("rejects invalid node enum values", () => {
    const service = createService();

    assert.throws(
      () =>
        service.applyGraph("analysis-1", {
          nodes: [{ id: "node-1", nodeType: "unknown", label: "bad" }],
        }),
      /Invalid review node type/,
    );
    assert.throws(
      () =>
        service.applyGraph("analysis-1", {
          nodes: [
            {
              id: "node-1",
              nodeType: "file",
              label: "bad",
              riskLevel: "warning",
            },
          ],
        }),
      /Invalid review node risk level/,
    );
    assert.throws(
      () =>
        service.applyGraph("analysis-1", {
          nodes: [
            {
              id: "node-1",
              nodeType: "file",
              label: "bad",
              reviewOrder: 0,
            },
          ],
        }),
      /node.reviewOrder must be a positive integer/,
    );
  });
});
