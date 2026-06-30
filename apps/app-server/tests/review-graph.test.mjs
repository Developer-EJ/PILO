import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  InMemoryReviewGraphRepository,
} = require("../src/modules/review/graph/in-memory-review-graph.repository.ts");
const {
  ReviewGraphController,
} = require("../src/modules/review/graph/review-graph.controller.ts");
const {
  ReviewGraphService,
} = require("../src/modules/review/graph/review-graph.service.ts");

function createController() {
  return new ReviewGraphController(
    new ReviewGraphService(new InMemoryReviewGraphRepository(), {
      seedFixture: true,
    }),
  );
}

describe("review graph API boundary", () => {
  it("returns a review graph with review node summaries", () => {
    const controller = createController();

    const graph = controller.getGraph("88888888-8888-4888-8888-888888888881");

    assert.equal(graph.pullRequestId, "66666666-6666-4666-8666-666666666661");
    assert.deepEqual(graph.edges, []);
    assert.equal(graph.nodes.length, 2);
    assert.equal(graph.nodes[0].status, "unknown");
    assert.equal(graph.nodes[0].reviewOrder, 1);
    assert.equal(graph.nodes[0].position.x, 120);
    assert.match(graph.intentSummary, /callback/);
    assert.equal(graph.reviewOrder[0], graph.nodes[0].id);
  });

  it("keeps a canvas alias for the AI review workflow screen", () => {
    const controller = createController();

    const canvas = controller.getCanvas("88888888-8888-4888-8888-888888888881");

    assert.equal(canvas.nodes.length, 2);
    assert.match(canvas.reviewStrategy, /callback/);
  });

  it("upserts reviewer node state by node and reviewer", () => {
    const controller = createController();
    const nodeId = "88888888-8888-4888-8888-888888888891";

    const first = controller.upsertNodeState(nodeId, {
      reviewerMemberId: "33333333-3333-4333-8333-333333333331",
      status: "discuss",
      comment: "Check error redirect handling",
      changedAt: "2026-06-27T10:00:00.000Z",
    });
    const second = controller.upsertNodeState(nodeId, {
      reviewerMemberId: first.reviewerMemberId,
      status: "ok",
      comment: "Handled",
      changedAt: "2026-06-27T10:10:00.000Z",
    });

    assert.equal(second.id, first.id);
    assert.equal(second.status, "ok");
    assert.equal(second.createdAt, first.createdAt);
    assert.equal(
      controller.getGraph("88888888-8888-4888-8888-888888888881").nodes[0]
        .status,
      "ok",
    );
  });

  it("rejects invalid node state", () => {
    const controller = createController();

    assert.throws(
      () =>
        controller.upsertNodeState("88888888-8888-4888-8888-888888888891", {
          reviewerMemberId: "33333333-3333-4333-8333-333333333331",
          status: "done",
        }),
      /Invalid review node status/,
    );
  });

  it("rejects invalid state timestamps", () => {
    const controller = createController();

    assert.throws(
      () =>
        controller.upsertNodeState("88888888-8888-4888-8888-888888888891", {
          reviewerMemberId: "33333333-3333-4333-8333-333333333331",
          status: "ok",
          changedAt: "tomorrow",
        }),
      /changedAt must be a valid ISO timestamp/,
    );
  });
});
