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
        title: "Implement Google/GitHub login",
        status: "in_progress",
        priority: "high",
      },
    ],
    analysis: {
      id: "88888888-8888-4888-8888-888888888881",
      analysisStatus: "succeeded",
      riskLevel: "medium",
      purposeSummary: "Adds an OAuth callback page and redirect handling.",
      impactSummary: "Auth routes and session redirect flow are affected.",
      testRecommendation: "Verify success and failure redirect smoke tests.",
      conclusion: "Ready to merge after reviewer confirmation.",
      reviewNotes: [
        "Confirm provider callback query values split success and failure states correctly.",
        "Check session redirect behavior before final UI copy changes.",
      ],
    },
    canvas: {
      intentSummary:
        "Create the login callback entry point and expose provider errors clearly.",
      reviewStrategy:
        "Review the route entry, callback state parsing, and redirect impact in order.",
      nodes: [
        {
          id: "callback-route",
          label: "app/auth/callback/page.tsx",
          nodeType: "file",
          riskLevel: "medium",
          reviewOrder: 1,
          roleSummary:
            "Reads provider callback query values and routes users to success or failure states.",
          position: { x: 120, y: 108 },
          detail: {
            filePath: "apps/frontend/app/auth/callback/page.tsx",
            modificationReason:
              "The previous placeholder did not explain login success or failure outcomes.",
            changeGroups: [
              {
                id: "query",
                title: "Callback query parsing",
                summary:
                  "Reads provider and error query parameters before rendering the callback result.",
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
          label: "CallbackResult states",
          nodeType: "component",
          riskLevel: "low",
          reviewOrder: 2,
          roleSummary:
            "Splits success and failure UI states and guides the user's next action.",
          position: { x: 122, y: 310 },
          detail: {
            filePath: "apps/frontend/app/auth/callback/page.tsx",
            modificationReason:
              "Users need a clear outcome after provider authentication completes.",
            changeGroups: [
              {
                id: "result-copy",
                title: "Callback result copy",
                summary:
                  "Branches copy and next-action guidance between success and failure states.",
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
            "Checks that callback outcomes do not conflict with the existing session redirect flow.",
          position: { x: 430, y: 238 },
          detail: {
            filePath: "apps/frontend/app/auth/callback/page.tsx",
            modificationReason:
              "The callback route must report success and failure without breaking session redirects.",
            changeGroups: [
              {
                id: "redirect-impact",
                title: "Redirect impact",
                summary:
                  "Checks that existing session redirects do not fight the callback result screen.",
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
      ],
      edges: [
        { from: "callback-route", to: "callback-result" },
        { from: "callback-result", to: "session-impact" },
      ],
    },
  },
];

export default function ReviewsPage() {
  return <ReviewNodeWorkspace sessions={reviewSessions} />;
}
