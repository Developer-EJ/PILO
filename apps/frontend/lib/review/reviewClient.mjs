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
      title: "OAuth 콜백 로그인 흐름 정리",
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
    purposeSummary:
      "OAuth provider가 돌아온 뒤 사용자가 성공, 실패, 재시도 상태를 명확히 이해하도록 콜백 화면과 상태 정규화 로직을 정리합니다.",
    impactSummary:
      "인증 callback route, safe redirect 계산, 로그인 안내 UI, 회귀 테스트에 영향을 주며 잘못 처리되면 사용자가 빈 화면이나 외부 URL로 이동할 수 있습니다.",
    testRecommendation:
      "Google 성공 콜백, provider error, next 외부 URL 차단, 세션 만료 후 재시도 경로를 smoke test로 확인해야 합니다.",
    riskLevel: "medium",
    analysisStatus: "succeeded",
    okCount: 2,
    discussCount: 2,
    riskCount: 1,
    conclusion:
      "리다이렉트 차단과 실패 안내 copy만 확인되면 MVP 시연 기준에서는 병합 가능한 변경입니다.",
  },
  canvas: {
    id: "88888888-8888-4888-8888-8888888888c1",
    analysisId: REVIEW_FIXTURE_ANALYSIS_ID,
    pullRequestId: REVIEW_FIXTURE_PULL_REQUEST_ID,
    summary: "OAuth callback review workflow",
    intentSummary:
      "로그인 콜백을 사용자가 이해 가능한 성공/실패 흐름으로 만들고, 위험한 redirect 입력을 차단합니다.",
    reviewStrategy:
      "화면 진입점, 상태 정규화, 사용자 안내, 테스트, 세션 복구 순서로 보면 PR의 위험 지점을 빠르게 확인할 수 있습니다.",
    reviewOrder: [
      "88888888-8888-4888-8888-888888888891",
      "88888888-8888-4888-8888-888888888892",
      "88888888-8888-4888-8888-888888888893",
      "88888888-8888-4888-8888-888888888894",
      "88888888-8888-4888-8888-888888888895",
    ],
    nodes: [
      {
        id: "88888888-8888-4888-8888-888888888891",
        analysisId: REVIEW_FIXTURE_ANALYSIS_ID,
        nodeType: "file",
        label: "콜백 페이지 진입점",
        filePath: "apps/frontend/app/auth/callback/page.tsx",
        functionName: null,
        riskLevel: "medium",
        status: "discuss",
        reviewOrder: 1,
        roleSummary:
          "provider, error, next query를 읽어 사용자가 보는 콜백 결과 화면으로 연결합니다.",
        reviewReason:
          "로그인 성공/실패를 처음 보여주는 화면이라 빈 상태나 잘못된 안내가 있으면 온보딩이 바로 끊깁니다.",
        position: { x: 92, y: 92 },
        detail: {
          filePath: "apps/frontend/app/auth/callback/page.tsx",
          modificationReason:
            "기존 placeholder는 provider 인증이 끝난 뒤 성공인지 실패인지 설명하지 못했고, 사용자가 다음 행동을 알기 어려웠습니다.",
          changeGroups: [
            {
              id: "mock-review-change-group-callback-query",
              title: "콜백 query 해석",
              summary:
                "provider, error, next 값을 분리해서 결과 컴포넌트에 넘기고, 실패 상태를 화면에 노출합니다.",
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
                "const provider = searchParams.get('provider');\nconst error = searchParams.get('error');\nconst next = searchParams.get('next');\nreturn <CallbackResult provider={provider} error={error} next={next} />;",
            },
          ],
        },
      },
      {
        id: "88888888-8888-4888-8888-888888888892",
        analysisId: REVIEW_FIXTURE_ANALYSIS_ID,
        nodeType: "impact",
        label: "안전한 redirect 결정",
        filePath: "apps/frontend/app/login/callback/oauthCallbackState.mjs",
        functionName: null,
        riskLevel: "high",
        status: "discuss",
        reviewOrder: 2,
        roleSummary:
          "next 파라미터가 내부 경로인지 검증하고, 외부 URL이나 빈 값이면 안전한 workspace 경로로 되돌립니다.",
        reviewReason:
          "redirect allowlist가 느슨하면 로그인 직후 외부 URL 이동이나 잘못된 workspace 진입으로 이어질 수 있습니다.",
        position: { x: 380, y: 92 },
        detail: {
          filePath: "apps/frontend/app/login/callback/oauthCallbackState.mjs",
          modificationReason:
            "provider error와 next redirect를 섞어서 처리하면 실패 케이스에서도 잘못된 화면으로 이동할 수 있어 분리 검증이 필요합니다.",
          changeGroups: [
            {
              id: "mock-review-change-group-safe-next",
              title: "safe next path 분기",
              summary:
                "외부 URL과 protocol-relative URL을 버리고 workspace dashboard로 fallback합니다.",
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
      {
        id: "88888888-8888-4888-8888-888888888893",
        analysisId: REVIEW_FIXTURE_ANALYSIS_ID,
        nodeType: "component",
        label: "로그인 결과 안내 UI",
        filePath: "apps/frontend/app/login/LoginAuthNotice.tsx",
        functionName: "LoginAuthNotice",
        riskLevel: "low",
        status: "ok",
        reviewOrder: 3,
        roleSummary:
          "사용자에게 OAuth 성공, 실패, 재시도 가능 여부를 카드 상단에서 즉시 안내합니다.",
        reviewReason:
          "실패 copy가 모호하면 사용자가 다시 로그인해야 하는지, 관리자에게 문의해야 하는지 판단하기 어렵습니다.",
        position: { x: 660, y: 230 },
        detail: {
          filePath: "apps/frontend/app/login/LoginAuthNotice.tsx",
          modificationReason:
            "콜백 결과를 login 화면에서 다시 설명해 사용자가 실패 원인과 다음 행동을 이해하도록 합니다.",
          changeGroups: [
            {
              id: "mock-review-change-group-auth-notice",
              title: "성공/실패 안내 카드",
              summary:
                "provider와 error 상태에 따라 성공 안내, 실패 안내, 재시도 안내를 분기합니다.",
              newStartLine: 8,
              newEndLine: 34,
              diffHunkId: "mock-review-diff-auth-notice",
            },
          ],
          diffHunks: [
            {
              id: "mock-review-diff-auth-notice",
              oldStartLine: 1,
              newStartLine: 8,
              oldCode: "return null;",
              newCode:
                "if (error) {\n  return <p role=\"alert\">로그인에 실패했습니다. 다시 시도해 주세요.</p>;\n}\nreturn <p>인증이 완료되었습니다. 워크스페이스로 이동합니다.</p>;",
            },
          ],
        },
      },
      {
        id: "88888888-8888-4888-8888-888888888894",
        analysisId: REVIEW_FIXTURE_ANALYSIS_ID,
        nodeType: "test",
        label: "OAuth 회귀 테스트",
        filePath: "apps/frontend/tests/smoke.test.mjs",
        functionName: "OAuth callback smoke",
        riskLevel: "medium",
        status: "unknown",
        reviewOrder: 4,
        roleSummary:
          "성공 콜백, provider error, 외부 next 차단 케이스가 깨지지 않는지 smoke test로 고정합니다.",
        reviewReason:
          "auth flow는 수동 확인만으로 놓치기 쉬워 PR 병합 전에 최소 회귀 테스트가 있어야 합니다.",
        position: { x: 390, y: 408 },
        detail: {
          filePath: "apps/frontend/tests/smoke.test.mjs",
          modificationReason:
            "콜백 성공/실패/외부 redirect 방어 조건을 테스트로 남겨 이후 refactor 때 회귀를 잡습니다.",
          changeGroups: [
            {
              id: "mock-review-change-group-oauth-tests",
              title: "콜백 상태 회귀 테스트",
              summary:
                "성공 redirect, 실패 메시지, 외부 next fallback을 각각 독립 assertion으로 확인합니다.",
              newStartLine: 980,
              newEndLine: 1018,
              diffHunkId: "mock-review-diff-oauth-tests",
            },
          ],
          diffHunks: [
            {
              id: "mock-review-diff-oauth-tests",
              oldStartLine: 980,
              newStartLine: 980,
              oldCode: "assert.equal(resolveOAuthCallbackState({}), null);",
              newCode:
                "assert.equal(resolveOAuthCallbackState({ provider: 'google' }).status, 'success');\nassert.equal(resolveOAuthCallbackState({ error: 'access_denied' }).status, 'error');\nassert.equal(safeNextPath('https://evil.example'), `/workspaces/${workspaceId}`);",
            },
          ],
        },
      },
      {
        id: "88888888-8888-4888-8888-888888888895",
        analysisId: REVIEW_FIXTURE_ANALYSIS_ID,
        nodeType: "impact",
        label: "세션 만료 복구 경로",
        filePath: "apps/frontend/lib/auth/protectedRoutes.mjs",
        functionName: "createLoginRedirectHref",
        riskLevel: "medium",
        status: "discuss",
        reviewOrder: 5,
        roleSummary:
          "보호된 workspace route에서 세션이 만료됐을 때 로그인 후 원래 위치로 돌아오는 경로를 확인합니다.",
        reviewReason:
          "Scene1 시연에서는 workspace 생성 후 dashboard 진입이 핵심이라, 인증 복구가 끊기면 전체 플로우가 흔들립니다.",
        position: { x: 105, y: 408 },
        detail: {
          filePath: "apps/frontend/lib/auth/protectedRoutes.mjs",
          modificationReason:
            "로그인 콜백이 next 경로를 더 엄격히 다루면서 기존 보호 route 복귀 흐름과 충돌하지 않는지 확인해야 합니다.",
          changeGroups: [
            {
              id: "mock-review-change-group-session-recovery",
              title: "보호 route 복귀 경로",
              summary:
                "로그인 필요 상태에서 현재 workspace URL을 next로 보존하고 callback 후 안전하게 복귀합니다.",
              newStartLine: 42,
              newEndLine: 58,
              diffHunkId: "mock-review-diff-session-recovery",
            },
          ],
          diffHunks: [
            {
              id: "mock-review-diff-session-recovery",
              oldStartLine: 42,
              newStartLine: 42,
              oldCode: "return `/login?next=${pathname}`;",
              newCode:
                "const next = safeNextPath(pathname);\nreturn `/login?next=${encodeURIComponent(next)}`;",
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
        label: "query state",
      },
      {
        id: "88888888-8888-4888-8888-8888888888e2",
        sourceNodeId: "88888888-8888-4888-8888-888888888892",
        targetNodeId: "88888888-8888-4888-8888-888888888893",
        label: "safe result",
      },
      {
        id: "88888888-8888-4888-8888-8888888888e3",
        sourceNodeId: "88888888-8888-4888-8888-888888888893",
        targetNodeId: "88888888-8888-4888-8888-888888888894",
        label: "coverage",
      },
      {
        id: "88888888-8888-4888-8888-8888888888e4",
        sourceNodeId: "88888888-8888-4888-8888-888888888894",
        targetNodeId: "88888888-8888-4888-8888-888888888895",
        label: "session recovery",
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
      summary:
        "OAuth 콜백 route에서 provider/error/next query를 읽고 결과 화면으로 전달합니다.",
      functions: [
        {
          id: "88888888-8888-4888-8888-8888888888c1",
          changedFileId: "88888888-8888-4888-8888-8888888888b1",
          name: "AuthCallbackPage",
          changeType: "modified",
          summary:
            "provider 콜백 query를 읽고 성공/실패 상태를 표시합니다.",
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
        "OAuth callback 결과를 safe redirect와 provider 상태로 정규화합니다.",
      functions: [
        {
          id: "88888888-8888-4888-8888-8888888888c2",
          changedFileId: "88888888-8888-4888-8888-8888888888b2",
          name: "resolveOAuthCallbackState",
          changeType: "modified",
          summary:
            "provider error 처리와 next path redirect 결정을 분리합니다.",
        },
      ],
    },
    {
      id: "88888888-8888-4888-8888-8888888888b3",
      analysisId: REVIEW_FIXTURE_ANALYSIS_ID,
      filePath: "apps/frontend/app/login/LoginAuthNotice.tsx",
      changeType: "added",
      additions: 36,
      deletions: 0,
      summary:
        "로그인 성공/실패 안내 상태를 login 화면 카드 상단에 표시합니다.",
      functions: [
        {
          id: "88888888-8888-4888-8888-8888888888c3",
          changedFileId: "88888888-8888-4888-8888-8888888888b3",
          name: "LoginAuthNotice",
          changeType: "added",
          summary:
            "callback 상태에 따라 성공 안내, 실패 안내, 재시도 안내를 분기합니다.",
        },
      ],
    },
    {
      id: "88888888-8888-4888-8888-8888888888b4",
      analysisId: REVIEW_FIXTURE_ANALYSIS_ID,
      filePath: "apps/frontend/tests/smoke.test.mjs",
      changeType: "modified",
      additions: 48,
      deletions: 2,
      summary:
        "OAuth callback 성공/실패/외부 redirect 방어 smoke test를 추가합니다.",
      functions: [],
    },
  ],
  checklistItems: [
    {
      id: "mock-review-checklist-1",
      analysisId: REVIEW_FIXTURE_ANALYSIS_ID,
      checklistType: "review",
      title: "콜백 페이지에서 성공/실패 상태가 모두 보이는지 확인",
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
      body: "실패 copy가 provider error와 외부 redirect 차단 케이스를 구분해서 설명하는지 확인이 필요합니다.",
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
  intentSummary: "분석이 대기 중입니다.",
  reviewStrategy: "리뷰 그래프 데이터가 아직 준비되지 않았습니다.",
  reviewOrder: [],
  nodes: [],
  edges: [],
};

const NEUTRAL_REVIEW_NODE = {
  id: "",
  analysisId: "",
  nodeType: "file",
  label: "리뷰 노드",
  filePath: null,
  functionName: null,
  riskLevel: "low",
  status: "unknown",
  reviewOrder: 1,
  roleSummary: "런타임 노드 요약이 아직 준비되지 않았습니다.",
  reviewReason: "런타임 노드 리뷰 이유가 아직 준비되지 않았습니다.",
  position: { x: 0, y: 0 },
};

const NEUTRAL_CHANGED_FILE = {
  id: "",
  analysisId: "",
  filePath: "알 수 없는 파일",
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
