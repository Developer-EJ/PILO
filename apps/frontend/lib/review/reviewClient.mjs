import {
  defaultWorkspaceApiBaseUrl,
  localMvpActorHeaders,
  mockWorkspaces,
  WorkspaceApiError,
} from "../workspace/workspaceClient.mjs";

const DEFAULT_REVIEW_MODE = "mock";

export const REVIEW_FIXTURE_WORKSPACE_ID =
  "22222222-2222-4222-8222-222222222222";
export const REVIEW_FIXTURE_MEMBER_ID =
  "33333333-3333-4333-8333-333333333331";
export const REVIEW_FIXTURE_PULL_REQUEST_ID =
  "66666666-6666-4666-8666-666666666661";
export const REVIEW_FIXTURE_ANALYSIS_ID =
  "88888888-8888-4888-8888-888888888881";

export const reviewApiPaths = {
  listGithubRepositories: (workspaceId) =>
    `/api/workspaces/${encodeURIComponent(workspaceId)}/github/repositories`,
  listRepositoryPullRequests: (repositoryId) =>
    `/api/repositories/${encodeURIComponent(repositoryId)}/pull-requests`,
  openReviewRoom: (pullRequestId) =>
    `/api/pull-requests/${encodeURIComponent(pullRequestId)}/review-room`,
  getReviewRoom: (roomId) =>
    `/api/code-review-rooms/${encodeURIComponent(roomId)}`,
  requestAnalysis: (pullRequestId) =>
    `/api/pull-requests/${encodeURIComponent(pullRequestId)}/analysis`,
  getAnalysis: (pullRequestId) =>
    `/api/pull-requests/${encodeURIComponent(pullRequestId)}/analysis`,
  getAnalysisSummary: (pullRequestId) =>
    `/api/pull-requests/${encodeURIComponent(pullRequestId)}/analysis-summary`,
  getCanvas: (analysisId) =>
    `/api/pull-request-analyses/${encodeURIComponent(analysisId)}/canvas`,
  listChangedFiles: (analysisId) =>
    `/api/pull-request-analyses/${encodeURIComponent(
      analysisId,
    )}/changed-files`,
  setNodeState: (nodeId) =>
    `/api/review-nodes/${encodeURIComponent(nodeId)}/state`,
  listComments: (roomId) =>
    `/api/code-review-rooms/${encodeURIComponent(roomId)}/comments`,
  createComment: (roomId) =>
    `/api/code-review-rooms/${encodeURIComponent(roomId)}/comments`,
  listChecklistItems: (analysisId) =>
    `/api/pull-request-analyses/${encodeURIComponent(
      analysisId,
    )}/checklist-items`,
  createChecklistItem: (analysisId) =>
    `/api/pull-request-analyses/${encodeURIComponent(
      analysisId,
    )}/checklist-items`,
};

export const reviewFixture = {
  workspace: mockWorkspaces.find(
    (workspace) => workspace.id === REVIEW_FIXTURE_WORKSPACE_ID,
  ) ?? {
    id: REVIEW_FIXTURE_WORKSPACE_ID,
    name: "PILO MVP",
  },
  memberId: REVIEW_FIXTURE_MEMBER_ID,
  pullRequests: [
    {
      id: REVIEW_FIXTURE_PULL_REQUEST_ID,
      repositoryId: "55555555-5555-4555-8555-555555555501",
      number: 7,
      title: "Add OAuth callback shell",
      authorLogin: "Developer-EJ",
      state: "review_requested",
      branch: "feature/donghyun/auth-login",
      baseBranch: "dev",
      url: "https://github.com/example/pilo/pull/7",
      changedFilesCount: 4,
      additions: 180,
      deletions: 12,
      linkedTaskIds: ["44444444-4444-4444-8444-444444444441"],
      syncedAt: "2026-06-27T10:00:00.000Z",
    },
  ],
  room: {
    id: "88888888-8888-4888-8888-888888888811",
    workspaceId: REVIEW_FIXTURE_WORKSPACE_ID,
    pullRequestId: REVIEW_FIXTURE_PULL_REQUEST_ID,
    status: "open",
    createdByMemberId: REVIEW_FIXTURE_MEMBER_ID,
    createdAt: "2026-06-27T10:00:00.000Z",
    updatedAt: "2026-06-27T10:00:00.000Z",
  },
  analysis: {
    id: REVIEW_FIXTURE_ANALYSIS_ID,
    pullRequestId: REVIEW_FIXTURE_PULL_REQUEST_ID,
    purposeSummary: "Adds an OAuth callback route and visible result state.",
    impactSummary: "Touches auth routing, login redirects, and session recovery.",
    testRecommendation:
      "Smoke test provider success, provider error, and expired session redirects.",
    riskLevel: "medium",
    analysisStatus: "succeeded",
    okCount: 3,
    discussCount: 1,
    riskCount: 1,
    conclusion: "Ready after the failure redirect behavior is confirmed.",
  },
  canvas: {
    id: "88888888-8888-4888-8888-8888888888c1",
    analysisId: REVIEW_FIXTURE_ANALYSIS_ID,
    pullRequestId: REVIEW_FIXTURE_PULL_REQUEST_ID,
    summary: "OAuth callback review graph",
    intentSummary:
      "Create the login callback entry point and make provider errors visible.",
    reviewStrategy:
      "Review the route entry first, then verify session redirect impact.",
    reviewOrder: [
      "88888888-8888-4888-8888-888888888891",
      "88888888-8888-4888-8888-888888888892",
    ],
    nodes: [
      {
        id: "88888888-8888-4888-8888-888888888891",
        analysisId: REVIEW_FIXTURE_ANALYSIS_ID,
        nodeType: "file",
        label: "apps/frontend/app/auth/callback/page.tsx",
        filePath: "apps/frontend/app/auth/callback/page.tsx",
        functionName: null,
        riskLevel: "medium",
        status: "discuss",
        reviewOrder: 1,
        roleSummary:
          "Reads provider callback query values and renders success or failure states.",
        reviewReason:
          "Login failure handling and redirect behavior directly affect user recovery.",
        position: { x: 96, y: 112 },
      },
      {
        id: "88888888-8888-4888-8888-888888888892",
        analysisId: REVIEW_FIXTURE_ANALYSIS_ID,
        nodeType: "impact",
        label: "session redirect flow",
        filePath: null,
        functionName: null,
        riskLevel: "low",
        status: "ok",
        reviewOrder: 2,
        roleSummary:
          "Checks that callback results do not fight the existing session redirect flow.",
        reviewReason:
          "A clear success or failure branch keeps the blast radius small.",
        position: { x: 420, y: 250 },
      },
    ],
    edges: [
      {
        id: "88888888-8888-4888-8888-8888888888e1",
        sourceNodeId: "88888888-8888-4888-8888-888888888891",
        targetNodeId: "88888888-8888-4888-8888-888888888892",
        label: "callback result",
      },
    ],
  },
  changedFiles: [
    {
      id: "88888888-8888-4888-8888-8888888888b1",
      analysisId: REVIEW_FIXTURE_ANALYSIS_ID,
      filePath: "apps/frontend/app/auth/callback/page.tsx",
      changeType: "modified",
      additions: 42,
      deletions: 8,
      summary: "Adds the OAuth callback route shell and result handling.",
      functions: [
        {
          id: "88888888-8888-4888-8888-8888888888c1",
          changedFileId: "88888888-8888-4888-8888-8888888888b1",
          name: "AuthCallbackPage",
          changeType: "modified",
          summary:
            "Reads provider callback query parameters and displays redirect state.",
        },
      ],
    },
  ],
  checklistItems: [
    {
      id: "mock-review-checklist-1",
      analysisId: REVIEW_FIXTURE_ANALYSIS_ID,
      checklistType: "review",
      title: "Review the medium-risk callback route first",
      status: "todo",
      checkedByMemberId: null,
      checkedAt: null,
      sortOrder: 0,
      createdAt: "2026-06-27T10:00:00.000Z",
      updatedAt: "2026-06-27T10:00:00.000Z",
    },
  ],
  comments: [
    {
      id: "mock-review-comment-1",
      roomId: "88888888-8888-4888-8888-888888888811",
      authorMemberId: REVIEW_FIXTURE_MEMBER_ID,
      nodeId: "88888888-8888-4888-8888-888888888891",
      changedFileId: null,
      changedFunctionId: null,
      body: "Please confirm the failure redirect copy before merge.",
      createdAt: "2026-06-27T10:04:00.000Z",
    },
  ],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultReviewMode() {
  return (
    process.env.NEXT_PUBLIC_PILO_REVIEW_MODE ??
    process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE ??
    DEFAULT_REVIEW_MODE
  );
}

export function resolveReviewClientMode(mode = defaultReviewMode()) {
  return mode === "api" ? "api" : "mock";
}

export class ReviewApiError extends WorkspaceApiError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "ReviewApiError";
  }
}

export function buildReviewApiUrl(
  path,
  baseUrl = defaultWorkspaceApiBaseUrl(),
) {
  if (!path.startsWith("/api/")) {
    throw new ReviewApiError("Review API path must start with /api/", {
      path,
    });
  }

  if (!baseUrl) {
    return path;
  }

  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readReviewJson(response, path) {
  if (response.status === 204) {
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    throw new ReviewApiError("Review API returned invalid JSON", {
      status: response.status,
      path,
    });
  }
}

async function requestReviewJson(path, init, { baseUrl, fetcher }) {
  const response = await fetcher(buildReviewApiUrl(path, baseUrl), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...localMvpActorHeaders(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new ReviewApiError("Review API request failed", {
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

function normalizePullRequest(pullRequest, fallback = reviewFixture.pullRequests[0]) {
  return {
    ...fallback,
    ...(isRecord(pullRequest) ? pullRequest : {}),
    linkedTaskIds: Array.isArray(pullRequest?.linkedTaskIds)
      ? pullRequest.linkedTaskIds
      : fallback.linkedTaskIds,
  };
}

export function normalizeReviewRoom(rawRoom, { workspaceId } = {}) {
  const fallbackPullRequest = normalizePullRequest(reviewFixture.pullRequests[0]);
  const fallback = {
    ...reviewFixture.room,
    workspaceId: workspaceId ?? reviewFixture.room.workspaceId,
    pullRequest: fallbackPullRequest,
  };
  const room = isRecord(rawRoom) ? rawRoom : fallback;

  return {
    ...fallback,
    ...room,
    pullRequest: normalizePullRequest(room.pullRequest, fallbackPullRequest),
  };
}

export function normalizeReviewAnalysis(rawAnalysis, pullRequestId) {
  const fallback = {
    ...reviewFixture.analysis,
    pullRequestId: pullRequestId ?? reviewFixture.analysis.pullRequestId,
  };
  const analysis = isRecord(rawAnalysis) ? rawAnalysis : fallback;

  return {
    ...fallback,
    ...analysis,
    purposeSummary: analysis.purposeSummary ?? fallback.purposeSummary,
    impactSummary: analysis.impactSummary ?? fallback.impactSummary,
    testRecommendation:
      analysis.testRecommendation ?? fallback.testRecommendation,
    conclusion: analysis.conclusion ?? fallback.conclusion,
    okCount: Number.isInteger(analysis.okCount) ? analysis.okCount : 0,
    discussCount: Number.isInteger(analysis.discussCount)
      ? analysis.discussCount
      : 0,
    riskCount: Number.isInteger(analysis.riskCount) ? analysis.riskCount : 0,
  };
}

function fallbackEdgesFromNodes(nodes) {
  return nodes.slice(1).map((node, index) => ({
    id: `fallback-review-edge-${index + 1}`,
    sourceNodeId: nodes[index].id,
    targetNodeId: node.id,
    label: null,
  }));
}

export function normalizeReviewCanvas(rawCanvas, analysisId) {
  const fallback = {
    ...reviewFixture.canvas,
    analysisId: analysisId ?? reviewFixture.canvas.analysisId,
    nodes: reviewFixture.canvas.nodes.map((node) => ({
      ...node,
      analysisId: analysisId ?? node.analysisId,
    })),
  };
  const canvas = isRecord(rawCanvas) ? rawCanvas : fallback;
  const nodes = Array.isArray(canvas.nodes) ? canvas.nodes : fallback.nodes;
  const normalizedNodes = nodes.map((node, index) => ({
    ...fallback.nodes[index % fallback.nodes.length],
    ...node,
    analysisId: canvas.analysisId ?? fallback.analysisId,
    status: node.status ?? "unknown",
    position: isRecord(node.position)
      ? node.position
      : fallback.nodes[index % fallback.nodes.length].position,
  }));
  const edges = Array.isArray(canvas.edges) ? canvas.edges : [];

  return {
    ...fallback,
    ...canvas,
    analysisId: canvas.analysisId ?? fallback.analysisId,
    reviewOrder: Array.isArray(canvas.reviewOrder)
      ? canvas.reviewOrder
      : normalizedNodes.map((node) => node.id),
    nodes: normalizedNodes,
    edges: edges.length ? edges : fallbackEdgesFromNodes(normalizedNodes),
  };
}

export function normalizeChangedFiles(rawFiles, analysisId) {
  const files = Array.isArray(rawFiles) ? rawFiles : reviewFixture.changedFiles;

  return files.map((file, index) => {
    const fallback =
      reviewFixture.changedFiles[index % reviewFixture.changedFiles.length];
    const normalizedFile = isRecord(file) ? file : fallback;

    return {
      ...fallback,
      ...normalizedFile,
      analysisId: normalizedFile.analysisId ?? analysisId ?? fallback.analysisId,
      additions: Number.isInteger(normalizedFile.additions)
        ? normalizedFile.additions
        : 0,
      deletions: Number.isInteger(normalizedFile.deletions)
        ? normalizedFile.deletions
        : 0,
      functions: Array.isArray(normalizedFile.functions)
        ? normalizedFile.functions
        : [],
    };
  });
}

export function createMockReviewClient({
  fixture = reviewFixture,
  now = () => new Date().toISOString(),
} = {}) {
  let room = normalizeReviewRoom(fixture.room, {
    workspaceId: fixture.workspace.id,
  });
  let analysis = normalizeReviewAnalysis(
    fixture.analysis,
    fixture.pullRequests[0].id,
  );
  let canvas = normalizeReviewCanvas(fixture.canvas, analysis.id);
  let checklistItems = clone(fixture.checklistItems);
  let comments = clone(fixture.comments);

  return {
    async listPullRequests() {
      return clone(fixture.pullRequests);
    },

    async openReviewRoom(_pullRequestId, { workspaceId } = {}) {
      room = normalizeReviewRoom(
        {
          ...room,
          workspaceId: workspaceId ?? room.workspaceId,
          pullRequest: fixture.pullRequests[0],
        },
        { workspaceId },
      );

      return clone(room);
    },

    async getReviewRoom() {
      return clone(room);
    },

    async requestAnalysis(pullRequestId) {
      analysis = normalizeReviewAnalysis(
        {
          ...analysis,
          pullRequestId,
        },
        pullRequestId,
      );

      return clone(analysis);
    },

    async getAnalysis() {
      return clone(analysis);
    },

    async getAnalysisSummary() {
      const {
        id,
        pullRequestId,
        purposeSummary,
        impactSummary,
        testRecommendation,
        riskLevel,
        analysisStatus,
        okCount,
        discussCount,
        riskCount,
        conclusion,
      } = analysis;

      return {
        id,
        pullRequestId,
        purposeSummary,
        impactSummary,
        testRecommendation,
        riskLevel,
        analysisStatus,
        okCount,
        discussCount,
        riskCount,
        conclusion,
      };
    },

    async getCanvas() {
      return clone(canvas);
    },

    async listChangedFiles(analysisId) {
      return normalizeChangedFiles(fixture.changedFiles, analysisId);
    },

    async listChecklistItems(analysisId) {
      return clone(
        analysisId
          ? checklistItems.filter((item) => item.analysisId === analysisId)
          : checklistItems,
      );
    },

    async createChecklistItem(analysisId, body) {
      const existing = checklistItems.find(
        (item) =>
          item.analysisId === analysisId &&
          item.checklistType === (body.checklistType ?? "review") &&
          item.sortOrder === body.sortOrder,
      );
      const changedAt = body.changedAt ?? now();
      const item = {
        id: existing?.id ?? `mock-review-checklist-${checklistItems.length + 1}`,
        analysisId,
        checklistType: body.checklistType ?? "review",
        title: body.title,
        status: body.status ?? "todo",
        checkedByMemberId: body.checkedByMemberId ?? null,
        checkedAt: body.checkedAt ?? null,
        sortOrder: body.sortOrder ?? checklistItems.length,
        createdAt: existing?.createdAt ?? changedAt,
        updatedAt: changedAt,
      };

      checklistItems = existing
        ? checklistItems.map((entry) => (entry.id === item.id ? item : entry))
        : [...checklistItems, item];

      return clone(item);
    },

    async listComments(roomId) {
      return clone(
        roomId
          ? comments.filter((comment) => comment.roomId === roomId)
          : comments,
      );
    },

    async createComment(roomId, body) {
      const comment = {
        id: `mock-review-comment-${comments.length + 1}`,
        roomId,
        authorMemberId: body.authorMemberId,
        nodeId: body.nodeId ?? null,
        changedFileId: body.changedFileId ?? null,
        changedFunctionId: body.changedFunctionId ?? null,
        body: body.body,
        createdAt: body.createdAt ?? now(),
      };

      comments = [...comments, comment];
      return clone(comment);
    },

    async setNodeState(nodeId, body) {
      const state = {
        id: `mock-review-node-state-${nodeId}-${body.reviewerMemberId}`,
        nodeId,
        reviewerMemberId: body.reviewerMemberId,
        status: body.status,
        comment: body.comment ?? null,
        createdAt: body.changedAt ?? now(),
        updatedAt: body.changedAt ?? now(),
      };

      canvas = {
        ...canvas,
        nodes: canvas.nodes.map((node) =>
          node.id === nodeId ? { ...node, status: state.status } : node,
        ),
      };

      return clone(state);
    },
  };
}

export function createReviewApiClient({
  baseUrl = defaultWorkspaceApiBaseUrl(),
  fetcher = fetch,
} = {}) {
  const requestOptions = { baseUrl, fetcher };

  return {
    async listPullRequests(workspaceId) {
      if (!workspaceId) {
        return [];
      }

      const repositories = await requestReviewJson(
        reviewApiPaths.listGithubRepositories(workspaceId),
        undefined,
        requestOptions,
      );
      const repositoryList = Array.isArray(repositories) ? repositories : [];
      const pullRequestLists = await Promise.all(
        repositoryList.map((repository) =>
          requestReviewJson(
            reviewApiPaths.listRepositoryPullRequests(repository.id),
            undefined,
            requestOptions,
          ),
        ),
      );
      const pullRequests = pullRequestLists.flatMap((list) =>
        Array.isArray(list) ? list : [],
      );

      return pullRequests.map((pullRequest) =>
        normalizePullRequest(pullRequest),
      );
    },

    async openReviewRoom(
      pullRequestId,
      { workspaceId, memberId, pullRequest } = {},
    ) {
      const room = await requestReviewJson(
        reviewApiPaths.openReviewRoom(pullRequestId),
        {
          method: "POST",
          body: JSON.stringify(pullRequest ? { pullRequest } : {}),
          headers: {
            "Content-Type": "application/json",
            ...(workspaceId ? { "x-workspace-id": workspaceId } : {}),
            ...(memberId ? { "x-member-id": memberId } : {}),
          },
        },
        requestOptions,
      );

      return normalizeReviewRoom(room, { workspaceId });
    },

    async getReviewRoom(roomId) {
      return normalizeReviewRoom(
        await requestReviewJson(
          reviewApiPaths.getReviewRoom(roomId),
          undefined,
          requestOptions,
        ),
      );
    },

    async requestAnalysis(pullRequestId) {
      return normalizeReviewAnalysis(
        await requestReviewJson(
          reviewApiPaths.requestAnalysis(pullRequestId),
          { method: "POST" },
          requestOptions,
        ),
        pullRequestId,
      );
    },

    async getAnalysis(pullRequestId) {
      return normalizeReviewAnalysis(
        await requestReviewJson(
          reviewApiPaths.getAnalysis(pullRequestId),
          undefined,
          requestOptions,
        ),
        pullRequestId,
      );
    },

    async getAnalysisSummary(pullRequestId) {
      return normalizeReviewAnalysis(
        await requestReviewJson(
          reviewApiPaths.getAnalysisSummary(pullRequestId),
          undefined,
          requestOptions,
        ),
        pullRequestId,
      );
    },

    async getCanvas(analysisId) {
      return normalizeReviewCanvas(
        await requestReviewJson(
          reviewApiPaths.getCanvas(analysisId),
          undefined,
          requestOptions,
        ),
        analysisId,
      );
    },

    async listChangedFiles(analysisId) {
      return normalizeChangedFiles(
        await requestReviewJson(
          reviewApiPaths.listChangedFiles(analysisId),
          undefined,
          requestOptions,
        ),
        analysisId,
      );
    },

    async listChecklistItems(analysisId) {
      const checklistItems = await requestReviewJson(
        reviewApiPaths.listChecklistItems(analysisId),
        undefined,
        requestOptions,
      );

      return Array.isArray(checklistItems) ? checklistItems : [];
    },

    async createChecklistItem(analysisId, body) {
      return requestReviewJson(
        reviewApiPaths.createChecklistItem(analysisId),
        withJsonBody(body, { method: "POST" }),
        requestOptions,
      );
    },

    async listComments(roomId) {
      const comments = await requestReviewJson(
        reviewApiPaths.listComments(roomId),
        undefined,
        requestOptions,
      );

      return Array.isArray(comments) ? comments : [];
    },

    async createComment(roomId, body) {
      return requestReviewJson(
        reviewApiPaths.createComment(roomId),
        withJsonBody(body, { method: "POST" }),
        requestOptions,
      );
    },

    async setNodeState(nodeId, body) {
      return requestReviewJson(
        reviewApiPaths.setNodeState(nodeId),
        withJsonBody(body, { method: "PATCH" }),
        requestOptions,
      );
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
