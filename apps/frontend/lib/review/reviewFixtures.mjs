export const reviewMockWorkspaceId = "22222222-2222-4222-8222-222222222222";
export const reviewMockMemberId = "33333333-3333-4333-8333-333333333331";
export const reviewMockPullRequestId = "66666666-6666-4666-8666-666666666661";
export const reviewMockAnalysisId = "88888888-8888-4888-8888-888888888881";
export const reviewMockRoomId = "88888888-8888-4888-8888-888888888811";

export const reviewMockPullRequests = [
  {
    id: reviewMockPullRequestId,
    repositoryId: "55555555-5555-4555-8555-555555555501",
    number: 7,
    title: "OAuth 콜백 로그인 흐름 정리",
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
};

export const reviewMockGraph = {
  id: "88888888-8888-4888-8888-8888888888d1",
  analysisId: reviewMockAnalysisId,
  pullRequestId: reviewMockPullRequestId,
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
      analysisId: reviewMockAnalysisId,
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
    },
    {
      id: "88888888-8888-4888-8888-888888888892",
      analysisId: reviewMockAnalysisId,
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
    },
    {
      id: "88888888-8888-4888-8888-888888888893",
      analysisId: reviewMockAnalysisId,
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
    },
    {
      id: "88888888-8888-4888-8888-888888888894",
      analysisId: reviewMockAnalysisId,
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
    },
    {
      id: "88888888-8888-4888-8888-888888888895",
      analysisId: reviewMockAnalysisId,
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
};

export const reviewMockChangedFiles = [
  {
    id: "88888888-8888-4888-8888-8888888888b1",
    analysisId: reviewMockAnalysisId,
    filePath: "apps/frontend/app/auth/callback/page.tsx",
    changeType: "modified",
    additions: 42,
    deletions: 8,
    summary:
      "OAuth 콜백 route에서 provider/error/next query를 읽고 결과 화면으로 전달합니다.",
    createdAt: "2026-06-27T10:00:00.000Z",
    updatedAt: "2026-06-27T10:00:00.000Z",
    functions: [
      {
        id: "88888888-8888-4888-8888-8888888888c1",
        changedFileId: "88888888-8888-4888-8888-8888888888b1",
        name: "AuthCallbackPage",
        changeType: "modified",
        summary: "provider 콜백 query를 읽고 성공/실패 상태를 표시합니다.",
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
    summary:
      "OAuth callback 결과를 safe redirect와 provider 상태로 정규화합니다.",
    createdAt: "2026-06-27T10:00:00.000Z",
    updatedAt: "2026-06-27T10:00:00.000Z",
    functions: [
      {
        id: "88888888-8888-4888-8888-8888888888c2",
        changedFileId: "88888888-8888-4888-8888-8888888888b2",
        name: "resolveOAuthCallbackState",
        changeType: "modified",
        summary: "provider error 처리와 next path redirect 결정을 분리합니다.",
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
    summary: "로그인 성공/실패 안내 상태를 login 화면 카드 상단에 표시합니다.",
    createdAt: "2026-06-27T10:00:00.000Z",
    updatedAt: "2026-06-27T10:00:00.000Z",
    functions: [
      {
        id: "88888888-8888-4888-8888-8888888888c3",
        changedFileId: "88888888-8888-4888-8888-8888888888b3",
        name: "LoginAuthNotice",
        changeType: "added",
        summary:
          "callback 상태에 따라 성공 안내, 실패 안내, 재시도 안내를 분기합니다.",
        createdAt: "2026-06-27T10:00:00.000Z",
        updatedAt: "2026-06-27T10:00:00.000Z",
      },
    ],
  },
  {
    id: "88888888-8888-4888-8888-8888888888b4",
    analysisId: reviewMockAnalysisId,
    filePath: "apps/frontend/tests/smoke.test.mjs",
    changeType: "modified",
    additions: 48,
    deletions: 2,
    summary:
      "OAuth callback 성공/실패/외부 redirect 방어 smoke test를 추가합니다.",
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
      "OAuth callback 화면에서 provider와 error query를 읽고 결과 UI로 전달합니다.",
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
      "callback 상태가 기존 session redirect 흐름과 충돌하지 않도록 결과를 정규화합니다.",
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
        highlightLines: [31, 32, 33, 34],
      },
    ],
  },
  "88888888-8888-4888-8888-888888888893": {
    id: "88888888-8888-4888-8888-8888888888d3",
    analysisId: reviewMockAnalysisId,
    nodeId: "88888888-8888-4888-8888-888888888893",
    filePath: "apps/frontend/app/login/LoginAuthNotice.tsx",
    roleSummary:
      "로그인 화면에서 callback 결과를 다시 설명해 사용자가 실패 원인과 다음 행동을 이해하도록 합니다.",
    modificationReason:
      "성공/실패 안내가 없으면 사용자는 인증이 진행 중인지 실패했는지 판단하기 어렵습니다.",
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
          'if (error) {\n  return <p role="alert">로그인에 실패했습니다. 다시 시도해 주세요.</p>;\n}\nreturn <p>인증이 완료되었습니다. 워크스페이스로 이동합니다.</p>;',
        highlightLines: [8, 9, 10, 11],
      },
    ],
  },
  "88888888-8888-4888-8888-888888888894": {
    id: "88888888-8888-4888-8888-8888888888d4",
    analysisId: reviewMockAnalysisId,
    nodeId: "88888888-8888-4888-8888-888888888894",
    filePath: "apps/frontend/tests/smoke.test.mjs",
    roleSummary:
      "콜백 성공/실패/외부 redirect 방어 조건을 테스트로 남겨 이후 refactor 때 회귀를 잡습니다.",
    modificationReason:
      "auth flow는 수동 확인만으로 놓치기 쉬워 병합 전에 최소 회귀 테스트가 있어야 합니다.",
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
        highlightLines: [980, 981, 982],
      },
    ],
  },
  "88888888-8888-4888-8888-888888888895": {
    id: "88888888-8888-4888-8888-8888888888d5",
    analysisId: reviewMockAnalysisId,
    nodeId: "88888888-8888-4888-8888-888888888895",
    filePath: "apps/frontend/lib/auth/protectedRoutes.mjs",
    roleSummary:
      "로그인 필요 상태에서 현재 workspace URL을 next로 보존하고 callback 후 안전하게 복귀합니다.",
    modificationReason:
      "로그인 콜백이 next 경로를 더 엄격히 다루면서 기존 보호 route 복귀 흐름과 충돌하지 않는지 확인해야 합니다.",
    changeGroups: [
      {
        id: "mock-review-change-group-session-recovery",
        title: "보호 route 복귀 경로",
        summary:
          "세션 만료 후 로그인하면 원래 workspace URL로 돌아오도록 next 경로를 보존합니다.",
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
        highlightLines: [42, 43],
      },
    ],
  },
};

export const reviewMockChecklist = [
  {
    id: "local-review-checklist-1",
    analysisId: reviewMockAnalysisId,
    checklistType: "review",
    title: "콜백 페이지에서 성공/실패 상태가 모두 보이는지 확인",
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
    title: "세션 만료 후 원래 workspace로 복귀하는지 확인",
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
    body: "실패 copy가 provider error와 외부 redirect 차단 케이스를 구분해서 설명하는지 확인이 필요합니다.",
    createdAt: "2026-06-27T10:03:00.000Z",
  },
];

export function cloneReviewFixture(value) {
  return JSON.parse(JSON.stringify(value));
}
