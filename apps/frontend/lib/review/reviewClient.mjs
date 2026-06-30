import {
  defaultWorkspaceApiBaseUrl,
  localMvpActorHeaders,
  mockWorkspaces,
  WorkspaceApiError,
} from "../workspace/workspaceClient.mjs";

const DEFAULT_REVIEW_MODE = "mock";

export const REVIEW_FIXTURE_WORKSPACE_ID =
  "22222222-2222-4222-8222-222222222222";
export const REVIEW_FIXTURE_MEMBER_ID = "33333333-3333-4333-8333-333333333331";
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
  updateChecklistItem: (itemId) =>
    `/api/review-checklist-items/${encodeURIComponent(itemId)}`,
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
    impactSummary:
      "Touches auth routing, login redirects, and session recovery.",
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
        detail: {
          filePath: "apps/frontend/app/auth/callback/page.tsx",
          modificationReason:
            "The previous placeholder did not explain login success or failure outcomes.",
          changeGroups: [
            {
              id: "mock-review-change-group-callback-query",
              title: "Callback query parsing",
              summary:
                "Reads provider and error query parameters before rendering the callback result.",
              newStartLine: 12,
              newEndLine: 18,
              diffHunkId: "mock-review-diff-callback-query",
            },
          ],
          diffHunks: [
            {
              id: "mock-review-diff-callback-query",
              oldStartLine: 10,
              newStartLine: 12,
              oldCode: "return <div>Loading...</div>;",
              newCode:
                "const provider = searchParams.get('provider');\nconst error = searchParams.get('error');\nreturn <CallbackResult provider={provider} error={error} />;",
            },
          ],
        },
      },
      {
        id: "88888888-8888-4888-8888-888888888892",
        analysisId: REVIEW_FIXTURE_ANALYSIS_ID,
        nodeType: "impact",
        label: "session redirect flow",
        filePath: "apps/frontend/app/login/callback/oauthCallbackState.mjs",
        functionName: null,
        riskLevel: "low",
        status: "ok",
        reviewOrder: 2,
        roleSummary:
          "Checks that callback results do not fight the existing session redirect flow.",
        reviewReason:
          "A clear success or failure branch keeps the blast radius small.",
        position: { x: 420, y: 250 },
        detail: {
          filePath: "apps/frontend/app/login/callback/oauthCallbackState.mjs",
          modificationReason:
            "Provider errors and next redirects need separate handling so login recovery does not land on an unsafe or confusing route.",
          changeGroups: [
            {
              id: "mock-review-change-group-safe-next",
              title: "Safe next path branch",
              summary:
                "Rejects external redirect targets and falls back to the workspace dashboard.",
              newStartLine: 31,
              newEndLine: 44,
              diffHunkId: "mock-review-diff-safe-next",
            },
          ],
          diffHunks: [
            {
              id: "mock-review-diff-safe-next",
              oldStartLine: 28,
              newStartLine: 31,
              oldCode: "return next || '/';",
              newCode:
                "if (!next || next.startsWith('http') || next.startsWith('//')) {\n  return `/workspaces/${workspaceId}`;\n}\nreturn next;",
            },
          ],
        },
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
    {
      id: "88888888-8888-4888-8888-8888888888b2",
      analysisId: REVIEW_FIXTURE_ANALYSIS_ID,
      filePath: "apps/frontend/app/login/callback/oauthCallbackState.mjs",
      changeType: "modified",
      additions: 54,
      deletions: 2,
      summary:
        "Normalizes OAuth callback outcomes into safe redirects and visible provider states.",
      functions: [
        {
          id: "88888888-8888-4888-8888-8888888888c2",
          changedFileId: "88888888-8888-4888-8888-8888888888b2",
          name: "resolveOAuthCallbackState",
          changeType: "modified",
          summary:
            "Separates provider error handling from the next path redirect decision.",
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

const NEUTRAL_REVIEW_TIMESTAMP = "1970-01-01T00:00:00.000Z";

const NEUTRAL_PULL_REQUEST = {
  id: "",
  repositoryId: "",
  number: 0,
  title: "Untitled pull request",
  authorLogin: null,
  state: "open",
  branch: null,
  baseBranch: null,
  url: "",
  changedFilesCount: 0,
  additions: 0,
  deletions: 0,
  linkedTaskIds: [],
  syncedAt: null,
};

const NEUTRAL_REVIEW_ROOM = {
  id: "",
  workspaceId: "",
  pullRequestId: "",
  status: "open",
  createdByMemberId: null,
  createdAt: NEUTRAL_REVIEW_TIMESTAMP,
  updatedAt: NEUTRAL_REVIEW_TIMESTAMP,
};

const NEUTRAL_ANALYSIS = {
  id: "",
  pullRequestId: "",
  purposeSummary: null,
  impactSummary: null,
  testRecommendation: null,
  riskLevel: "low",
  analysisStatus: "pending",
  okCount: 0,
  discussCount: 0,
  riskCount: 0,
  conclusion: null,
};

const NEUTRAL_CANVAS = {
  id: "",
  analysisId: "",
  pullRequestId: null,
  summary: null,
  intentSummary: "Analysis is pending.",
  reviewStrategy: "Review graph data is not available yet.",
  reviewOrder: [],
  nodes: [],
  edges: [],
};

const NEUTRAL_REVIEW_NODE = {
  id: "",
  analysisId: "",
  nodeType: "file",
  label: "Review node",
  filePath: null,
  functionName: null,
  riskLevel: "low",
  status: "unknown",
  reviewOrder: 1,
  roleSummary: "Runtime node summary is not available yet.",
  reviewReason: "Runtime node reason is not available yet.",
  position: { x: 0, y: 0 },
};

const NEUTRAL_CHANGED_FILE = {
  id: "",
  analysisId: "",
  filePath: "Unknown file",
  changeType: "modified",
  additions: 0,
  deletions: 0,
  summary: null,
  functions: [],
};

function stringOrFallback(value, fallback) {
  return typeof value === "string" ? value : fallback;
}

function nullableStringOrFallback(value, fallback) {
  return value === null || typeof value === "string" ? value : fallback;
}

function integerOrFallback(value, fallback) {
  return Number.isInteger(value) ? value : fallback;
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

function normalizePullRequest(
  pullRequest,
  fallback = NEUTRAL_PULL_REQUEST,
) {
  const source = isRecord(pullRequest) ? pullRequest : {};

  return {
    ...fallback,
    ...source,
    id: stringOrFallback(source.id, fallback.id),
    repositoryId: stringOrFallback(source.repositoryId, fallback.repositoryId),
    number: integerOrFallback(source.number, fallback.number),
    title: stringOrFallback(source.title, fallback.title),
    authorLogin: nullableStringOrFallback(
      source.authorLogin,
      fallback.authorLogin,
    ),
    state: stringOrFallback(source.state, fallback.state),
    branch: nullableStringOrFallback(source.branch, fallback.branch),
    baseBranch: nullableStringOrFallback(
      source.baseBranch,
      fallback.baseBranch,
    ),
    url: stringOrFallback(source.url, fallback.url),
    changedFilesCount: integerOrFallback(
      source.changedFilesCount,
      fallback.changedFilesCount,
    ),
    additions: integerOrFallback(source.additions, fallback.additions),
    deletions: integerOrFallback(source.deletions, fallback.deletions),
    linkedTaskIds: Array.isArray(source.linkedTaskIds)
      ? source.linkedTaskIds
      : fallback.linkedTaskIds,
    syncedAt: nullableStringOrFallback(source.syncedAt, fallback.syncedAt),
  };
}

export function normalizeReviewRoom(
  rawRoom,
  {
    workspaceId,
    fallbackRoom = NEUTRAL_REVIEW_ROOM,
    pullRequestFallback = NEUTRAL_PULL_REQUEST,
  } = {},
) {
  const fallbackPullRequest = normalizePullRequest(pullRequestFallback);
  const fallback = {
    ...fallbackRoom,
    workspaceId: workspaceId ?? fallbackRoom.workspaceId,
    pullRequestId: fallbackRoom.pullRequestId || fallbackPullRequest.id,
    pullRequest: fallbackPullRequest,
  };
  const room = isRecord(rawRoom) ? rawRoom : fallback;

  return {
    ...fallback,
    ...room,
    id: stringOrFallback(room.id, fallback.id),
    workspaceId: stringOrFallback(room.workspaceId, fallback.workspaceId),
    pullRequestId: stringOrFallback(room.pullRequestId, fallback.pullRequestId),
    status: stringOrFallback(room.status, fallback.status),
    createdByMemberId: nullableStringOrFallback(
      room.createdByMemberId,
      fallback.createdByMemberId,
    ),
    createdAt: stringOrFallback(room.createdAt, fallback.createdAt),
    updatedAt: stringOrFallback(room.updatedAt, fallback.updatedAt),
    pullRequest: normalizePullRequest(room.pullRequest, fallbackPullRequest),
  };
}

export function normalizeReviewAnalysis(
  rawAnalysis,
  pullRequestId,
  fallbackAnalysis = NEUTRAL_ANALYSIS,
) {
  const fallback = {
    ...fallbackAnalysis,
    pullRequestId: pullRequestId ?? fallbackAnalysis.pullRequestId,
  };
  const analysis = isRecord(rawAnalysis) ? rawAnalysis : fallback;
  const valueOrFallback = (value, fallbackValue) =>
    value === undefined ? fallbackValue : value;

  return {
    ...fallback,
    ...analysis,
    id: stringOrFallback(analysis.id, fallback.id),
    pullRequestId: stringOrFallback(
      analysis.pullRequestId,
      fallback.pullRequestId,
    ),
    purposeSummary: valueOrFallback(
      analysis.purposeSummary,
      fallback.purposeSummary,
    ),
    impactSummary: valueOrFallback(
      analysis.impactSummary,
      fallback.impactSummary,
    ),
    testRecommendation: valueOrFallback(
      analysis.testRecommendation,
      fallback.testRecommendation,
    ),
    conclusion: valueOrFallback(analysis.conclusion, fallback.conclusion),
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

export function normalizeReviewCanvas(
  rawCanvas,
  analysisId,
  fallbackCanvas = NEUTRAL_CANVAS,
) {
  const canvasIsRecord = isRecord(rawCanvas);
  const fallback = {
    ...fallbackCanvas,
    analysisId: analysisId ?? fallbackCanvas.analysisId,
    nodes: (Array.isArray(fallbackCanvas.nodes)
      ? fallbackCanvas.nodes
      : []
    ).map((node) => ({
      ...node,
      analysisId: analysisId ?? node.analysisId,
    })),
  };
  const canvas = canvasIsRecord ? rawCanvas : fallback;
  const nodes = Array.isArray(canvas.nodes)
    ? canvas.nodes
    : canvasIsRecord
      ? []
      : fallback.nodes;
  const normalizedNodes = nodes.map((node, index) => {
    const nodeRecord = isRecord(node) ? node : {};
    const nodeFallback = fallback.nodes.length
      ? fallback.nodes[index % fallback.nodes.length]
      : NEUTRAL_REVIEW_NODE;

    return {
      ...nodeFallback,
      ...nodeRecord,
      analysisId: canvas.analysisId ?? fallback.analysisId,
      reviewOrder: integerOrFallback(nodeRecord.reviewOrder, index + 1),
      status: nodeRecord.status ?? "unknown",
      position: isRecord(nodeRecord.position)
        ? nodeRecord.position
        : nodeFallback.position,
    };
  });
  const edges = Array.isArray(canvas.edges) ? canvas.edges : [];
  const fallbackPullRequestId = canvasIsRecord ? null : fallback.pullRequestId;

  return {
    ...fallback,
    ...canvas,
    id: stringOrFallback(canvas.id, fallback.id),
    analysisId: canvas.analysisId ?? fallback.analysisId,
    pullRequestId:
      canvas.pullRequestId === undefined
        ? fallbackPullRequestId
        : canvas.pullRequestId,
    reviewOrder: Array.isArray(canvas.reviewOrder)
      ? canvas.reviewOrder
      : normalizedNodes.map((node) => node.id),
    nodes: normalizedNodes,
    edges: edges.length
      ? edges
      : canvasIsRecord
        ? []
        : fallbackEdgesFromNodes(normalizedNodes),
  };
}

export function normalizeChangedFiles(
  rawFiles,
  analysisId,
  fallbackFiles = [],
) {
  const files = Array.isArray(rawFiles) ? rawFiles : fallbackFiles;

  return files.map((file, index) => {
    const fallback =
      fallbackFiles.length
        ? fallbackFiles[index % fallbackFiles.length]
        : NEUTRAL_CHANGED_FILE;
    const normalizedFile = isRecord(file) ? file : fallback;

    return {
      ...fallback,
      ...normalizedFile,
      analysisId:
        normalizedFile.analysisId ?? analysisId ?? fallback.analysisId,
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
    fallbackRoom: fixture.room,
    pullRequestFallback: fixture.pullRequests[0],
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
        id:
          existing?.id ?? `mock-review-checklist-${checklistItems.length + 1}`,
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

    async updateChecklistItem(itemId, body) {
      const existing = checklistItems.find((item) => item.id === itemId);

      if (!existing) {
        throw new ReviewApiError("Review checklist item not found", {
          status: 404,
          path: reviewApiPaths.updateChecklistItem(itemId),
        });
      }

      const changedAt = body.changedAt ?? now();
      const status = body.status ?? existing.status;
      const item = {
        ...existing,
        title: body.title ?? existing.title,
        status,
        checkedByMemberId:
          status === "todo"
            ? null
            : (body.checkedByMemberId ?? existing.checkedByMemberId),
        checkedAt:
          status === "todo"
            ? null
            : (body.checkedAt ?? existing.checkedAt ?? changedAt),
        updatedAt: changedAt,
      };

      checklistItems = checklistItems.map((entry) =>
        entry.id === item.id ? item : entry,
      );

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

      return normalizeReviewRoom(room, {
        workspaceId,
        pullRequestFallback: pullRequest ?? NEUTRAL_PULL_REQUEST,
      });
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

    async updateChecklistItem(itemId, body) {
      return requestReviewJson(
        reviewApiPaths.updateChecklistItem(itemId),
        withJsonBody(body, { method: "PATCH" }),
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
