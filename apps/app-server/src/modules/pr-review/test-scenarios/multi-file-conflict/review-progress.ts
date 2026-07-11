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
  const reviewed =
    counts.approved + counts.discussionNeeded + counts.unknown;
  const total = reviewed + counts.notReviewed;

  return {
    reviewed,
    total,
    complete: total > 0 && reviewed === total
  };
}

export function formatReviewProgress(progress: ReviewProgress): string {
  return `${progress.reviewed} / ${progress.total} files reviewed`;
}
