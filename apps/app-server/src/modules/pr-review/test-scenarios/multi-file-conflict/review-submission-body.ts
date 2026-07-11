import {
  calculateReviewProgress,
  formatReviewProgress,
  type ReviewDecisionCounts
} from "./review-progress";

export interface ReviewSubmissionBodyInput {
  pullRequestTitle: string;
  reviewerLogin: string;
  counts: ReviewDecisionCounts;
}

export function buildReviewSubmissionBody(
  input: ReviewSubmissionBodyInput
): string {
  const progress = calculateReviewProgress(input.counts);
  const decisionSummary = [
    `- Approved: ${input.counts.approved}`,
    `- Discussion needed: ${input.counts.discussionNeeded}`,
    `- Needs classification: ${input.counts.unknown}`,
    `- Not reviewed: ${input.counts.notReviewed}`
  ].join("\n");

  const unresolvedCount = input.counts.unknown + input.counts.notReviewed;
  const readiness =
    unresolvedCount === 0
      ? "Review decisions are ready to submit."
      : `${unresolvedCount} file(s) still need a final classification.`;

  return [
    `## Review result: ${input.pullRequestTitle}`,
    "",
    `Submitted by @${input.reviewerLogin}`,
    `Review progress: ${formatReviewProgress(progress)}`,
    "",
    "### Decision summary",
    decisionSummary,
    "",
    readiness
  ].join("\n");
}
