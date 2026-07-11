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
    `Approved ${input.counts.approved}`,
    `Discuss ${input.counts.discussionNeeded}`,
    `Unknown ${input.counts.unknown}`,
    `Not reviewed ${input.counts.notReviewed}`
  ].join(" / ");

  const readiness = progress.complete
    ? "All files have saved decisions."
    : `${input.counts.notReviewed} file(s) still need review decisions.`;

  return [
    `## ${input.pullRequestTitle}`,
    "",
    `Reviewer: @${input.reviewerLogin}`,
    `Progress: ${formatReviewProgress(progress)}`,
    `Decisions: ${decisionSummary}`,
    readiness
  ].join("\n");
}
