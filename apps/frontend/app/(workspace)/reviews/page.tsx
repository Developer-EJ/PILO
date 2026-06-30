import { reviewFixture } from "../../../lib/review/reviewClient.mjs";
import {
  ReviewNodeWorkspace,
  type ReviewSession,
} from "./review-node-workspace";

const reviewSessions: ReviewSession[] = [
  {
    pullRequest: reviewFixture.pullRequests[0],
    linkedTasks: [
      {
        id: "44444444-4444-4444-8444-444444444441",
        title: "Google 로그인 콜백 플로우 검증",
        status: "진행 중",
        priority: "높음",
      },
    ],
    analysis: {
      id: reviewFixture.analysis.id,
      analysisStatus: reviewFixture.analysis.analysisStatus,
      riskLevel: reviewFixture.analysis.riskLevel,
      purposeSummary: reviewFixture.analysis.purposeSummary,
      impactSummary: reviewFixture.analysis.impactSummary,
      testRecommendation: reviewFixture.analysis.testRecommendation,
      conclusion: reviewFixture.analysis.conclusion,
      reviewNotes: [
        "provider error와 외부 next 차단 케이스를 먼저 확인하세요.",
        "세션 만료 후 원래 workspace로 복귀하는지 마지막에 확인하세요.",
      ],
    },
    canvas: {
      intentSummary: reviewFixture.canvas.intentSummary,
      reviewStrategy: reviewFixture.canvas.reviewStrategy,
      nodes: reviewFixture.canvas.nodes as ReviewSession["canvas"]["nodes"],
      edges: reviewFixture.canvas.edges,
    },
    changedFiles: reviewFixture.changedFiles as ReviewSession["changedFiles"],
    checklistItems:
      reviewFixture.checklistItems as ReviewSession["checklistItems"],
    comments: reviewFixture.comments as ReviewSession["comments"],
  },
];

export default function ReviewsPage() {
  return <ReviewNodeWorkspace sessions={reviewSessions} />;
}
