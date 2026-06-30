import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReviewApiUrl,
  createMockReviewClient,
  createReviewApiClient,
  createReviewClient,
  resolveReviewClientMode,
} from "../lib/review/reviewClient.mjs";
import {
  reviewMockAnalysisSummary,
  reviewMockGraph,
  reviewMockMemberId,
  reviewMockPullRequestId,
  reviewMockRoom,
  reviewMockWorkspaceId,
} from "../lib/review/reviewFixtures.mjs";

describe("review frontend client", () => {
  it("keeps Review Current Runtime calls separate from GitHub provider fixtures", async () => {
    const requests = [];
    const fetcher = async (url, init = {}) => {
      requests.push({ url, init });

      if (url.endsWith(`/pull-requests/${reviewMockPullRequestId}/review-room`)) {
        return Response.json(reviewMockRoom);
      }

      if (url.endsWith(`/pull-requests/${reviewMockPullRequestId}/analysis`)) {
        return Response.json(reviewMockAnalysisSummary);
      }

      if (
        url.endsWith(
          `/pull-requests/${reviewMockPullRequestId}/analysis-summary`,
        )
      ) {
        return Response.json(reviewMockAnalysisSummary);
      }

      if (url.endsWith(`/pull-request-analyses/${reviewMockAnalysisSummary.id}/graph`)) {
        return Response.json(reviewMockGraph);
      }

      if (url.includes("/review-nodes/")) {
        return Response.json({
          id: "node-state-1",
          nodeId: reviewMockGraph.nodes[0].id,
          reviewerMemberId: reviewMockMemberId,
          status: "discuss",
          comment: null,
          createdAt: "2026-06-30T00:00:00.000Z",
          updatedAt: "2026-06-30T00:00:00.000Z",
        });
      }

      if (url.endsWith(`/code-review-rooms/${reviewMockRoom.id}/comments`)) {
        return Response.json({
          id: "comment-1",
          roomId: reviewMockRoom.id,
          authorMemberId: reviewMockMemberId,
          nodeId: null,
          changedFileId: null,
          changedFunctionId: null,
          body: "Check callback state.",
          createdAt: "2026-06-30T00:00:00.000Z",
        });
      }

      if (
        url.endsWith(
          `/pull-request-analyses/${reviewMockAnalysisSummary.id}/checklist-items`,
        )
      ) {
        return Response.json({
          id: "checklist-1",
          analysisId: reviewMockAnalysisSummary.id,
          checklistType: "review",
          title: "Check callback state.",
          status: "todo",
          checkedByMemberId: null,
          checkedAt: null,
          sortOrder: 0,
          createdAt: "2026-06-30T00:00:00.000Z",
          updatedAt: "2026-06-30T00:00:00.000Z",
        });
      }

      return new Response(null, { status: 404 });
    };

    assert.equal(
      buildReviewApiUrl("/pull-requests/pr-1/analysis", ""),
      "/api/pull-requests/pr-1/analysis",
    );
    assert.equal(resolveReviewClientMode("api"), "api");
    assert.equal(resolveReviewClientMode("fixture"), "mock");

    const mockClient = createMockReviewClient();
    const mockPrs = await mockClient.listPullRequests();
    assert.equal(mockPrs.source, "github_fixture");
    assert.equal(
      (await mockClient.getGraph(reviewMockAnalysisSummary.id)).nodes.length,
      reviewMockGraph.nodes.length,
    );
    assert.equal(
      (
        await createReviewClient({ mode: "mock" }).openRoom(
          reviewMockPullRequestId,
        )
      ).pullRequestId,
      reviewMockPullRequestId,
    );

    const apiClient = createReviewApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher,
    });

    await apiClient.openRoom(reviewMockPullRequestId, {
      workspaceId: reviewMockWorkspaceId,
      memberId: reviewMockMemberId,
    });
    await apiClient.requestAnalysis(reviewMockPullRequestId);
    await apiClient.getAnalysis(reviewMockPullRequestId);
    await apiClient.getAnalysisSummary(reviewMockPullRequestId);
    await apiClient.getGraph(reviewMockAnalysisSummary.id);
    await apiClient.updateNodeState(reviewMockGraph.nodes[0].id, {
      reviewerMemberId: reviewMockMemberId,
      status: "discuss",
    });
    await apiClient.createComment(reviewMockRoom.id, {
      authorMemberId: reviewMockMemberId,
      body: "Check callback state.",
    });
    await apiClient.createChecklistItem(reviewMockAnalysisSummary.id, {
      checklistType: "review",
      title: "Check callback state.",
    });
    const changedFiles = await apiClient.listChangedFiles(
      reviewMockAnalysisSummary.id,
    );

    assert.equal(changedFiles.source, "github_changed_files_fixture");
    assert.equal(
      requests[0].url,
      `https://api.pilo.dev/api/pull-requests/${reviewMockPullRequestId}/review-room`,
    );
    assert.equal(requests[0].init.method, "POST");
    assert.equal(
      requests[0].init.headers["x-workspace-id"],
      reviewMockWorkspaceId,
    );
    assert.deepEqual(
      requests.map((request) => request.init.method ?? "GET"),
      ["POST", "POST", "GET", "GET", "GET", "PATCH", "POST", "POST"],
    );
  });
});
