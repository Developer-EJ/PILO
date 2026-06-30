export const reviewMockWorkspaceId = "22222222-2222-4222-8222-222222222222";
export const reviewMockMemberId = "33333333-3333-4333-8333-333333333331";
export const reviewMockPullRequestId =
  "66666666-6666-4666-8666-666666666661";
export const reviewMockAnalysisId =
  "88888888-8888-4888-8888-888888888881";
export const reviewMockRoomId = "88888888-8888-4888-8888-888888888811";

export const reviewMockPullRequests = [
  {
    id: reviewMockPullRequestId,
    repositoryId: "55555555-5555-4555-8555-555555555501",
    number: 7,
    title: "OAuth callback 화면 골격 추가",
    authorLogin: "Developer-EJ",
    state: "review_requested",
    branch: "feature/donghyun/auth-login",
    baseBranch: "temp-dev",
    url: "https://github.com/example/pilo/pull/7",
    changedFilesCount: 4,
    additions: 180,
    deletions: 12,
    linkedTaskIds: ["44444444-4444-4444-8444-444444444441"],
    syncedAt: "2026-06-27T10:00:00.000Z",
  },
];

export const reviewMockRoom = {
  id: reviewMockRoomId,
  workspaceId: reviewMockWorkspaceId,
  pullRequestId: reviewMockPullRequestId,
  status: "open",
  createdByMemberId: reviewMockMemberId,
  createdAt: "2026-06-27T10:00:00.000Z",
  updatedAt: "2026-06-27T10:00:00.000Z",
  pullRequest: reviewMockPullRequests[0],
};

export const reviewMockAnalysisSummary = {
  id: reviewMockAnalysisId,
  pullRequestId: reviewMockPullRequestId,
  purposeSummary: "OAuth callback 화면 골격을 추가했다.",
  impactSummary: "Auth route와 session redirect flow에 영향이 있다.",
  testRecommendation:
    "성공/실패 redirect smoke test와 session 만료 케이스를 확인한다.",
  riskLevel: "medium",
  analysisStatus: "succeeded",
  okCount: 3,
  discussCount: 1,
  riskCount: 1,
  conclusion: "리뷰 후 merge 가능",
};

export const reviewMockGraph = {
  id: "88888888-8888-4888-8888-8888888888d1",
  analysisId: reviewMockAnalysisId,
  summary: "OAuth callback review graph",
  intentSummary:
    "로그인 callback 진입점을 만들고 provider error 상태를 사용자에게 보여준다.",
  reviewStrategy:
    "라우트 진입점, callback 상태 해석, redirect 영향 순서로 확인한다.",
  reviewOrder: [
    "88888888-8888-4888-8888-888888888891",
    "88888888-8888-4888-8888-888888888892",
  ],
  nodes: [
    {
      id: "88888888-8888-4888-8888-888888888891",
      analysisId: reviewMockAnalysisId,
      nodeType: "file",
      label: "apps/frontend/app/auth/callback/page.tsx",
      filePath: "apps/frontend/app/auth/callback/page.tsx",
      functionName: null,
      riskLevel: "medium",
      status: "unknown",
      reviewOrder: 1,
      roleSummary:
        "OAuth provider가 돌려준 callback query를 읽어 성공/실패 화면으로 연결한다.",
      reviewReason:
        "로그인 실패와 redirect 처리 모두 사용자 흐름에 직접 영향을 준다.",
      position: { x: 104, y: 112 },
    },
    {
      id: "88888888-8888-4888-8888-888888888892",
      analysisId: reviewMockAnalysisId,
      nodeType: "impact",
      label: "session redirect flow",
      filePath: null,
      functionName: null,
      riskLevel: "low",
      status: "unknown",
      reviewOrder: 2,
      roleSummary:
        "callback 결과가 기존 session redirect 흐름과 충돌하지 않는지 확인한다.",
      reviewReason: "성공/실패 상태가 명확히 분기되면 영향 범위가 작다.",
      position: { x: 422, y: 238 },
    },
  ],
};

export const reviewMockChangedFiles = [
  {
    id: "88888888-8888-4888-8888-8888888888b1",
    analysisId: reviewMockAnalysisId,
    filePath: "apps/frontend/app/auth/callback/page.tsx",
    changeType: "modified",
    additions: 42,
    deletions: 8,
    summary: "OAuth callback success/failure route shell을 정리했다.",
    createdAt: "2026-06-27T10:00:00.000Z",
    updatedAt: "2026-06-27T10:00:00.000Z",
    functions: [
      {
        id: "88888888-8888-4888-8888-8888888888c1",
        changedFileId: "88888888-8888-4888-8888-8888888888b1",
        name: "AuthCallbackPage",
        changeType: "modified",
        summary: "provider callback query param을 읽고 redirect 상태를 표시한다.",
        createdAt: "2026-06-27T10:00:00.000Z",
        updatedAt: "2026-06-27T10:00:00.000Z",
      },
    ],
  },
  {
    id: "88888888-8888-4888-8888-8888888888b2",
    analysisId: reviewMockAnalysisId,
    filePath: "apps/frontend/app/login/callback/oauthCallbackState.mjs",
    changeType: "modified",
    additions: 54,
    deletions: 2,
    summary: "OAuth callback 결과를 safe redirect와 provider 상태로 정규화한다.",
    createdAt: "2026-06-27T10:00:00.000Z",
    updatedAt: "2026-06-27T10:00:00.000Z",
    functions: [
      {
        id: "88888888-8888-4888-8888-8888888888c2",
        changedFileId: "88888888-8888-4888-8888-8888888888b2",
        name: "resolveOAuthCallbackState",
        changeType: "modified",
        summary: "성공/실패 callback 상태와 안전한 next path를 분리한다.",
        createdAt: "2026-06-27T10:00:00.000Z",
        updatedAt: "2026-06-27T10:00:00.000Z",
      },
    ],
  },
  {
    id: "88888888-8888-4888-8888-8888888888b3",
    analysisId: reviewMockAnalysisId,
    filePath: "apps/frontend/app/login/LoginAuthNotice.tsx",
    changeType: "added",
    additions: 36,
    deletions: 0,
    summary: "로그인 성공/실패 안내 상태를 화면에 표시한다.",
    createdAt: "2026-06-27T10:00:00.000Z",
    updatedAt: "2026-06-27T10:00:00.000Z",
    functions: [],
  },
  {
    id: "88888888-8888-4888-8888-8888888888b4",
    analysisId: reviewMockAnalysisId,
    filePath: "apps/frontend/tests/smoke.test.mjs",
    changeType: "modified",
    additions: 48,
    deletions: 2,
    summary: "OAuth callback success/error regression test를 추가한다.",
    createdAt: "2026-06-27T10:00:00.000Z",
    updatedAt: "2026-06-27T10:00:00.000Z",
    functions: [],
  },
];

export const reviewMockNodeDetails = {
  "88888888-8888-4888-8888-888888888891": {
    id: "88888888-8888-4888-8888-8888888888d1",
    analysisId: reviewMockAnalysisId,
    nodeId: "88888888-8888-4888-8888-888888888891",
    filePath: "apps/frontend/app/auth/callback/page.tsx",
    roleSummary:
      "OAuth callback 화면에서 provider와 error query를 읽고 결과 UI로 전달한다.",
    modificationReason:
      "기존 loading placeholder만으로는 로그인 성공/실패 맥락을 사용자에게 설명할 수 없었다.",
    changeGroups: [
      {
        id: "88888888-8888-4888-8888-8888888888f1",
        title: "callback query 해석",
        summary:
          "provider와 error query parameter를 읽어 callback 결과 컴포넌트로 넘긴다.",
        newStartLine: 12,
        newEndLine: 18,
      },
    ],
    diffHunks: [
      {
        id: "88888888-8888-4888-8888-8888888888f2",
        oldStartLine: 10,
        newStartLine: 12,
        oldCode: "return <div>Loading...</div>;",
        newCode:
          "const provider = searchParams.get('provider');\nconst error = searchParams.get('error');\nreturn <CallbackResult provider={provider} error={error} />;",
        highlightLines: [12, 13, 14],
      },
    ],
  },
  "88888888-8888-4888-8888-888888888892": {
    id: "88888888-8888-4888-8888-8888888888d2",
    analysisId: reviewMockAnalysisId,
    nodeId: "88888888-8888-4888-8888-888888888892",
    filePath: "apps/frontend/app/login/callback/oauthCallbackState.mjs",
    roleSummary:
      "callback 상태가 기존 session redirect 흐름과 충돌하지 않도록 결과를 정규화한다.",
    modificationReason:
      "GitHub/Google provider error와 next redirect가 섞이면 로그인 후 사용자가 잘못된 화면으로 이동할 수 있다.",
    changeGroups: [
      {
        id: "88888888-8888-4888-8888-8888888888f3",
        title: "safe next path 분기",
        summary:
          "외부 URL은 버리고 내부 경로만 callback 이후 이동 대상으로 허용한다.",
        newStartLine: 31,
        newEndLine: 44,
      },
    ],
    diffHunks: [
      {
        id: "88888888-8888-4888-8888-8888888888f4",
        oldStartLine: 28,
        newStartLine: 31,
        oldCode: "return next || '/';",
        newCode:
          "if (!next || next.startsWith('http') || next.startsWith('//')) {\n  return '/';\n}\nreturn next;",
        highlightLines: [31, 32, 33, 34],
      },
    ],
  },
};

export const reviewMockChecklist = [
  {
    id: "local-review-checklist-1",
    analysisId: reviewMockAnalysisId,
    checklistType: "review",
    title: "Callback success/error path를 실제 UI에서 확인한다.",
    status: "todo",
    checkedByMemberId: null,
    checkedAt: null,
    sortOrder: 0,
    createdAt: "2026-06-27T10:00:00.000Z",
    updatedAt: "2026-06-27T10:00:00.000Z",
  },
  {
    id: "local-review-checklist-2",
    analysisId: reviewMockAnalysisId,
    checklistType: "merge",
    title: "Session redirect smoke test 결과를 확인한다.",
    status: "todo",
    checkedByMemberId: null,
    checkedAt: null,
    sortOrder: 1,
    createdAt: "2026-06-27T10:00:00.000Z",
    updatedAt: "2026-06-27T10:00:00.000Z",
  },
];

export const reviewMockComments = [
  {
    id: "local-review-comment-1",
    roomId: reviewMockRoomId,
    authorMemberId: reviewMockMemberId,
    nodeId: "88888888-8888-4888-8888-888888888891",
    changedFileId: null,
    changedFunctionId: null,
    body: "provider error query가 비어 있을 때 fallback copy를 확인해야 합니다.",
    createdAt: "2026-06-27T10:03:00.000Z",
  },
];

export function cloneReviewFixture(value) {
  return JSON.parse(JSON.stringify(value));
}
