import { buildPiloApiUrl, defaultAppServerUrl } from "../api/apiUrl.mjs";
import {
  cloneReviewFixture,
  reviewMockAnalysisSummary,
  reviewMockChangedFiles,
  reviewMockChecklist,
  reviewMockComments,
  reviewMockGraph,
  reviewMockMemberId,
  reviewMockNodeDetails,
  reviewMockPullRequests,
  reviewMockRoom,
  reviewMockWorkspaceId,
} from "./reviewFixtures.mjs";

const DEFAULT_REVIEW_MODE = "mock";

export function defaultReviewMode() {
  return (
    process.env.NEXT_PUBLIC_PILO_REVIEW_MODE ??
    process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE ??
    DEFAULT_REVIEW_MODE
  );
}

export function resolveReviewClientMode(mode = defaultReviewMode()) {
  return mode === "api" ? "api" : "mock";
}

export function defaultReviewApiBaseUrl() {
  return defaultAppServerUrl();
}

export class ReviewApiError extends Error {
  constructor(message, { status, path } = {}) {
    super(message);
    this.name = "ReviewApiError";
    this.status = status;
    this.path = path;
  }
}

export function buildReviewApiUrl(
  path,
  baseUrl = defaultReviewApiBaseUrl(),
) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new ReviewApiError("Review API 경로는 /로 시작해야 합니다.", {
      path,
    });
  }

  return buildPiloApiUrl(path, baseUrl);
}

async function readReviewJson(response, path) {
  if (response.status === 204) {
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    throw new ReviewApiError("Review API가 올바르지 않은 JSON을 반환했습니다.", {
      status: response.status,
      path,
    });
  }
}

async function requestReviewJson(path, init, { baseUrl, fetcher }) {
  const response = await fetcher(buildReviewApiUrl(path, baseUrl), {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new ReviewApiError("Review API 요청에 실패했습니다.", {
      status: response.status,
      path,
    });
  }

  return readReviewJson(response, path);
}

function withJsonBody(body, init = {}) {
  return {
    ...init,
    body: JSON.stringify(body),
  };
}

function githubProviderDeferredResponse(items) {
  return {
    items: cloneReviewFixture(items),
    source: "github_fixture",
    boundary:
      "현재 contract에서 GitHub PR 목록과 변경 파일 provider API는 Deferred 상태입니다.",
  };
}

function localFixtureResponse(items, source = "review_fixture") {
  return {
    items: cloneReviewFixture(items),
    source,
  };
}

function createApiReviewFallbacks() {
  return {
    async listPullRequests() {
      return githubProviderDeferredResponse(reviewMockPullRequests);
    },

    async listChangedFiles(analysisId) {
      return localFixtureResponse(
        reviewMockChangedFiles.filter((file) => file.analysisId === analysisId),
        "github_changed_files_fixture",
      );
    },

    async getNodeDetail(nodeId) {
      return cloneReviewFixture(reviewMockNodeDetails[nodeId] ?? null);
    },

    async listChecklistItems(analysisId) {
      return localFixtureResponse(
        reviewMockChecklist.filter((item) => item.analysisId === analysisId),
        "review_artifacts_fixture",
      );
    },

    async listComments(roomId) {
      return localFixtureResponse(
        reviewMockComments.filter((comment) => comment.roomId === roomId),
        "review_artifacts_fixture",
      );
    },
  };
}

export function createReviewApiClient({
  baseUrl = defaultReviewApiBaseUrl(),
  fetcher = fetch,
} = {}) {
  const requestOptions = { baseUrl, fetcher };
  const fallback = createApiReviewFallbacks();

  return {
    mode: "api",
    providerBoundary: "github_provider_deferred",

    listPullRequests: fallback.listPullRequests,
    listChangedFiles: fallback.listChangedFiles,
    getNodeDetail: fallback.getNodeDetail,
    listChecklistItems: fallback.listChecklistItems,
    listComments: fallback.listComments,

    async openRoom(pullRequestId, options = {}) {
      return requestReviewJson(
        `/api/pull-requests/${encodeURIComponent(pullRequestId)}/review-room`,
        {
          method: "POST",
          headers: {
            "x-workspace-id": options.workspaceId ?? reviewMockWorkspaceId,
            "x-member-id": options.memberId ?? reviewMockMemberId,
          },
        },
        requestOptions,
      );
    },

    async getRoom(roomId) {
      return requestReviewJson(
        `/api/code-review-rooms/${encodeURIComponent(roomId)}`,
        undefined,
        requestOptions,
      );
    },

    async requestAnalysis(pullRequestId) {
      return requestReviewJson(
        `/api/pull-requests/${encodeURIComponent(pullRequestId)}/analysis`,
        { method: "POST" },
        requestOptions,
      );
    },

    async getAnalysis(pullRequestId) {
      return requestReviewJson(
        `/api/pull-requests/${encodeURIComponent(pullRequestId)}/analysis`,
        undefined,
        requestOptions,
      );
    },

    async getAnalysisSummary(pullRequestId) {
      return requestReviewJson(
        `/api/pull-requests/${encodeURIComponent(pullRequestId)}/analysis-summary`,
        undefined,
        requestOptions,
      );
    },

    async getGraph(analysisId) {
      return requestReviewJson(
        `/api/pull-request-analyses/${encodeURIComponent(analysisId)}/graph`,
        undefined,
        requestOptions,
      );
    },

    async updateNodeState(nodeId, body) {
      return requestReviewJson(
        `/api/review-nodes/${encodeURIComponent(nodeId)}/state`,
        withJsonBody(body, { method: "PATCH" }),
        requestOptions,
      );
    },

    async createComment(roomId, body) {
      return requestReviewJson(
        `/api/code-review-rooms/${encodeURIComponent(roomId)}/comments`,
        withJsonBody(body, { method: "POST" }),
        requestOptions,
      );
    },

    async createChecklistItem(analysisId, body) {
      return requestReviewJson(
        `/api/pull-request-analyses/${encodeURIComponent(
          analysisId,
        )}/checklist-items`,
        withJsonBody(body, { method: "POST" }),
        requestOptions,
      );
    },
  };
}

export function createMockReviewClient() {
  let room = cloneReviewFixture(reviewMockRoom);
  let analysis = cloneReviewFixture(reviewMockAnalysisSummary);
  let graph = cloneReviewFixture(reviewMockGraph);
  let changedFiles = cloneReviewFixture(reviewMockChangedFiles);
  let checklist = cloneReviewFixture(reviewMockChecklist);
  let comments = cloneReviewFixture(reviewMockComments);

  return {
    mode: "mock",
    providerBoundary: "github_provider_deferred",

    async listPullRequests() {
      return githubProviderDeferredResponse(reviewMockPullRequests);
    },

    async openRoom(_pullRequestId, options = {}) {
      room = {
        ...room,
        workspaceId: options.workspaceId ?? room.workspaceId,
        createdByMemberId: options.memberId ?? room.createdByMemberId,
      };

      return cloneReviewFixture(room);
    },

    async getRoom() {
      return cloneReviewFixture(room);
    },

    async requestAnalysis() {
      analysis = {
        ...analysis,
        analysisStatus: "succeeded",
      };

      return cloneReviewFixture(analysis);
    },

    async getAnalysis() {
      return cloneReviewFixture(analysis);
    },

    async getAnalysisSummary() {
      return cloneReviewFixture(analysis);
    },

    async getGraph() {
      return cloneReviewFixture(graph);
    },

    async updateNodeState(nodeId, body) {
      const now = body.changedAt ?? new Date().toISOString();
      graph = {
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === nodeId ? { ...node, status: body.status } : node,
        ),
      };

      return {
        id: `local-node-state-${nodeId}`,
        nodeId,
        reviewerMemberId: body.reviewerMemberId,
        status: body.status,
        comment: body.comment ?? null,
        createdAt: now,
        updatedAt: now,
      };
    },

    async listChangedFiles(analysisId) {
      return localFixtureResponse(
        changedFiles.filter((file) => file.analysisId === analysisId),
        "github_changed_files_fixture",
      );
    },

    async getNodeDetail(nodeId) {
      return cloneReviewFixture(reviewMockNodeDetails[nodeId] ?? null);
    },

    async listChecklistItems(analysisId) {
      return localFixtureResponse(
        checklist.filter((item) => item.analysisId === analysisId),
        "review_artifacts_fixture",
      );
    },

    async createChecklistItem(analysisId, body) {
      const now = body.changedAt ?? new Date().toISOString();
      const checklistType = body.checklistType ?? "review";
      const sortOrder =
        body.sortOrder ??
        checklist.filter(
          (item) =>
            item.analysisId === analysisId &&
            item.checklistType === checklistType,
        ).length;
      const existingIndex = checklist.findIndex(
        (item) =>
          item.analysisId === analysisId &&
          item.checklistType === checklistType &&
          item.sortOrder === sortOrder,
      );
      const item = {
        id:
          existingIndex >= 0
            ? checklist[existingIndex].id
            : `local-review-checklist-${Date.now()}`,
        analysisId,
        checklistType,
        title: body.title,
        status: body.status ?? "todo",
        checkedByMemberId:
          body.status === "done" || body.status === "skipped"
            ? body.checkedByMemberId ?? reviewMockMemberId
            : null,
        checkedAt:
          body.status === "done" || body.status === "skipped"
            ? body.checkedAt ?? now
            : null,
        sortOrder,
        createdAt:
          existingIndex >= 0 ? checklist[existingIndex].createdAt : now,
        updatedAt: now,
      };

      if (existingIndex >= 0) {
        checklist = checklist.map((current, index) =>
          index === existingIndex ? item : current,
        );
      } else {
        checklist = [...checklist, item];
      }

      return cloneReviewFixture(item);
    },

    async listComments(roomId) {
      return localFixtureResponse(
        comments.filter((comment) => comment.roomId === roomId),
        "review_artifacts_fixture",
      );
    },

    async createComment(roomId, body) {
      const comment = {
        id: `local-review-comment-${Date.now()}`,
        roomId,
        authorMemberId: body.authorMemberId,
        nodeId: body.nodeId ?? null,
        changedFileId: body.changedFileId ?? null,
        changedFunctionId: body.changedFunctionId ?? null,
        body: body.body,
        createdAt: body.createdAt ?? new Date().toISOString(),
      };

      comments = [comment, ...comments];
      return cloneReviewFixture(comment);
    },
  };
}

export function createReviewClient(options = {}) {
  const mode = resolveReviewClientMode(options.mode);

  if (mode === "api") {
    return createReviewApiClient(options);
  }

  return createMockReviewClient(options.mock);
}
