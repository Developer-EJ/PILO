import type {
  PrReviewPullRequest,
  PrReviewPullRequestDetail,
  PrReviewSession,
  PrReviewSessionVersionState
} from "@/features/pr-review/types";

type PullRequestVersionSource =
  | PrReviewPullRequest
  | PrReviewPullRequestDetail
  | null;

export function getPrReviewSessionVersionState(
  session: Pick<PrReviewSession, "headSha">,
  pullRequest: PullRequestVersionSource
): PrReviewSessionVersionState {
  if (!pullRequest?.headSha) {
    return "unavailable";
  }

  return pullRequest.headSha === session.headSha ? "current" : "stale";
}

export function isPrReviewSessionVersionStale(
  session: Pick<PrReviewSession, "headSha">,
  pullRequest: PullRequestVersionSource
) {
  return getPrReviewSessionVersionState(session, pullRequest) === "stale";
}
