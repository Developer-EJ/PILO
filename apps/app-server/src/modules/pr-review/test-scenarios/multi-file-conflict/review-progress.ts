export interface ReviewDecisionCounts {
  approved: number;
  discussionNeeded: number;
  unknown: number;
  notReviewed: number;
}

export interface ReviewProgress {
  reviewed: number;
  total: number;
  complete: boolean;
}

export function calculateReviewProgress(
  counts: ReviewDecisionCounts
): ReviewProgress {
  const reviewed = counts.approved + counts.discussionNeeded;
  const total = reviewed + counts.unknown + counts.notReviewed;

  return {
    reviewed,
    total,
    complete: total === 0 || reviewed === total
  };
}

export function formatReviewProgress(progress: ReviewProgress): string {
  const percentage =
    progress.total === 0 ? 100 : Math.round((progress.reviewed / progress.total) * 100);

  return `${progress.reviewed} of ${progress.total} reviewed (${percentage}%)`;
}
