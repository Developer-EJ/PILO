import {
  ReviewNodeWorkspace,
  type ReviewSession,
} from "./review-node-workspace";

const reviewSessions: ReviewSession[] = [
  {
    pullRequest: {
      id: "66666666-6666-4666-8666-666666666661",
      number: 7,
      title: "Add OAuth callback shell",
      authorLogin: "Developer-EJ",
      state: "review_requested",
      branch: "feature/donghyun/auth-login",
      baseBranch: "dev",
      changedFilesCount: 4,
      additions: 180,
      deletions: 12,
      linkedTaskIds: ["44444444-4444-4444-8444-444444444441"],
    },
    linkedTasks: [
      {
        id: "44444444-4444-4444-8444-444444444441",
        title: "Google/GitHub 로그인 구현",
        status: "in_progress",
        priority: "high",
      },
    ],
    analysis: {
      id: "88888888-8888-4888-8888-888888888881",
      analysisStatus: "succeeded",
      riskLevel: "medium",
      purposeSummary: "OAuth callback 화면 골격을 추가했다.",
      impactSummary: "Auth route와 session redirect flow에 영향이 있다.",
      testRecommendation: "성공/실패 redirect smoke test를 확인한다.",
      conclusion: "리뷰 후 merge 가능",
      reviewNotes: [
        "callback query가 인증 provider의 성공/실패 상태를 올바르게 분기하는지 확인한다.",
        "session redirect 흐름과 충돌하지 않는지 먼저 보고 UI copy 변경은 마지막에 확인한다.",
      ],
    },
    canvas: {
      intentSummary:
        "로그인 callback 진입점을 만들고 provider error 상태를 사용자에게 보여준다.",
      reviewStrategy:
        "라우트 진입점, callback 상태 해석, redirect 영향 순서로 확인한다.",
      nodes: [
        {
          id: "callback-route",
          label: "app/auth/callback/page.tsx",
          nodeType: "file",
          riskLevel: "medium",
          reviewOrder: 1,
          roleSummary:
            "OAuth provider가 돌려준 callback query를 읽어 성공/실패 화면으로 연결한다.",
          position: { x: 120, y: 108 },
          detail: {
            filePath: "apps/frontend/app/auth/callback/page.tsx",
            modificationReason:
              "기존 placeholder만으로는 로그인 성공/실패 맥락을 설명할 수 없었다.",
            changeGroups: [
              {
                id: "query",
                title: "callback query 해석",
                summary:
                  "provider와 error query parameter를 읽어 callback 결과 컴포넌트로 넘긴다.",
                newStartLine: 12,
                newEndLine: 18,
                diffHunkId: "callback-query",
              },
            ],
            diffHunks: [
              {
                id: "callback-query",
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
          id: "callback-result",
          label: "CallbackResult 상태 분기",
          nodeType: "component",
          riskLevel: "low",
          reviewOrder: 2,
          roleSummary:
            "성공/실패 상태를 화면 copy와 다음 행동 안내로 분기한다.",
          position: { x: 122, y: 310 },
          detail: {
            filePath: "apps/frontend/app/auth/callback/page.tsx",
            modificationReason:
              "사용자가 인증 결과를 명확히 이해하고 다음 화면으로 이동할 수 있게 한다.",
            changeGroups: [
              {
                id: "result-copy",
                title: "callback 결과 문구",
                summary:
                  "성공과 실패 상태를 분기해 사용자에게 다음 행동을 안내한다.",
                newStartLine: 20,
                newEndLine: 30,
                diffHunkId: "result-copy",
              },
            ],
            diffHunks: [
              {
                id: "result-copy",
                oldStartLine: 20,
                newStartLine: 20,
                oldCode: "return <StatusMessage />;",
                newCode:
                  "return error ? <FailureMessage provider={provider} /> : <SuccessMessage />;",
              },
            ],
          },
        },
        {
          id: "session-impact",
          label: "session redirect flow",
          nodeType: "impact",
          riskLevel: "high",
          reviewOrder: 3,
          roleSummary:
            "callback 결과가 기존 session redirect 흐름과 충돌하지 않는지 확인한다.",
          position: { x: 430, y: 238 },
          detail: {
            filePath: "apps/frontend/app/auth/callback/page.tsx",
            modificationReason:
              "callback route가 session redirect 흐름에서 성공/실패 상태를 명확히 전달하도록 영향 범위를 확인한다.",
            changeGroups: [
              {
                id: "redirect-impact",
                title: "redirect 영향 범위",
                summary:
                  "기존 session redirect가 callback 결과 화면과 충돌하지 않는지 확인한다.",
                newStartLine: 32,
                newEndLine: 40,
                diffHunkId: "redirect-impact",
              },
            ],
            diffHunks: [
              {
                id: "redirect-impact",
                oldStartLine: 30,
                newStartLine: 32,
                oldCode: "router.replace('/dashboard');",
                newCode:
                  "if (!error) {\n  router.replace('/dashboard');\n}\nsetCallbackState({ provider, error });",
              },
            ],
          },
        },
        {
          id: "smoke-test",
          label: "callback smoke test",
          nodeType: "test",
          riskLevel: "low",
          reviewOrder: 4,
          roleSummary:
            "성공/실패 callback 경로가 모두 렌더링되는지 최소 smoke 범위로 확인한다.",
          position: { x: 620, y: 438 },
          detail: {
            filePath: "apps/frontend/tests/auth-callback.test.tsx",
            modificationReason:
              "인증 callback은 routing 영향이 있어 성공/실패 상태를 최소 테스트로 고정한다.",
            changeGroups: [
              {
                id: "callback-test",
                title: "callback smoke 범위",
                summary:
                  "provider 성공과 error query가 있는 실패 상태를 각각 검증한다.",
                newStartLine: 6,
                newEndLine: 24,
                diffHunkId: "callback-test",
              },
            ],
            diffHunks: [
              {
                id: "callback-test",
                oldStartLine: 1,
                newStartLine: 6,
                oldCode: "it('renders callback page', () => {});",
                newCode:
                  "it('renders success and failure callback states', () => {\n  expect(success).toContain('로그인 완료');\n  expect(failure).toContain('다시 시도');\n});",
              },
            ],
          },
        },
      ],
      edges: [
        { from: "callback-route", to: "callback-result" },
        { from: "callback-result", to: "session-impact" },
        { from: "session-impact", to: "smoke-test" },
      ],
    },
  },
  {
    pullRequest: {
      id: "66666666-6666-4666-8666-666666666662",
      number: 8,
      title: "Persist review checklist items",
      authorLogin: "Developer-EJ",
      state: "open",
      branch: "feature/eunjae/review-checklist",
      baseBranch: "dev",
      changedFilesCount: 3,
      additions: 96,
      deletions: 18,
      linkedTaskIds: [],
    },
    linkedTasks: [],
    analysis: {
      id: "88888888-8888-4888-8888-888888888882",
      analysisStatus: "succeeded",
      riskLevel: "low",
      purposeSummary: "노드별 리뷰 판단 값을 저장할 수 있게 한다.",
      impactSummary:
        "review checklist 저장 모델과 UI 상태 동기화에 영향이 있다.",
      testRecommendation: "저장/재진입 시 판단 값이 유지되는지 확인한다.",
      conclusion: "작은 저장 흐름이라 독립 리뷰 가능",
      reviewNotes: [
        "판단 버튼이 optimistic UI와 서버 상태를 다르게 보여주지 않는지 확인한다.",
        "저장 실패 시 사용자가 다시 판단할 수 있는 상태인지 확인한다.",
      ],
    },
    canvas: {
      intentSummary:
        "사용자의 리뷰 판단을 노드 단위로 남겨 이후 merge 판단에 활용한다.",
      reviewStrategy: "UI 상태, 저장 API, 재조회 반영 순서로 보면 된다.",
      nodes: [
        {
          id: "decision-buttons",
          label: "Review decision buttons",
          nodeType: "ui",
          riskLevel: "low",
          reviewOrder: 1,
          roleSummary:
            "문제 없음, 논의 필요, 판단 불가 선택을 노드별 상태로 반영한다.",
          position: { x: 140, y: 150 },
          detail: {
            filePath:
              "apps/frontend/app/(workspace)/reviews/review-node-workspace.tsx",
            modificationReason:
              "리뷰 결과를 화면 전환 없이 빠르게 남길 수 있어야 한다.",
            changeGroups: [
              {
                id: "decision-state",
                title: "판단 상태 저장",
                summary:
                  "선택한 노드 id를 기준으로 사용자의 판단 값을 저장한다.",
                newStartLine: 52,
                newEndLine: 68,
                diffHunkId: "decision-state",
              },
            ],
            diffHunks: [
              {
                id: "decision-state",
                oldStartLine: 44,
                newStartLine: 52,
                oldCode:
                  "const [selectedNodeId, setSelectedNodeId] = useState(null);",
                newCode:
                  "const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>({});",
              },
            ],
          },
        },
        {
          id: "decision-summary",
          label: "Canvas decision badge",
          nodeType: "ui",
          riskLevel: "low",
          reviewOrder: 2,
          roleSummary:
            "캔버스 노드에서 이미 판단한 상태를 바로 확인할 수 있게 한다.",
          position: { x: 520, y: 268 },
          detail: {
            filePath:
              "apps/frontend/app/(workspace)/reviews/review-node-workspace.tsx",
            modificationReason:
              "리뷰자가 어떤 파일을 이미 검토했는지 캔버스에서 바로 확인해야 한다.",
            changeGroups: [
              {
                id: "decision-badge",
                title: "노드 판단 badge",
                summary:
                  "결정된 판단 값을 노드 하단에 표시해 리뷰 진행 상황을 드러낸다.",
                newStartLine: 130,
                newEndLine: 145,
                diffHunkId: "decision-badge",
              },
            ],
            diffHunks: [
              {
                id: "decision-badge",
                oldStartLine: 120,
                newStartLine: 130,
                oldCode: "<small>{node.nodeType}</small>",
                newCode:
                  "<small>{node.nodeType}{decisions[node.id] ? ` · ${decisionLabels[decisions[node.id]]}` : ''}</small>",
              },
            ],
          },
        },
      ],
      edges: [{ from: "decision-buttons", to: "decision-summary" }],
    },
  },
];

export default function ReviewsPage() {
  return <ReviewNodeWorkspace sessions={reviewSessions} />;
}
