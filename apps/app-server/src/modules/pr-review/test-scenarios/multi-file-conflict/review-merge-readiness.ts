import type { ReviewProgress } from "./review-progress";

export interface MergeReadinessInput {
  conflictStatus: "checking" | "clean" | "conflicted" | "unknown";
  reviewSubmitted: boolean;
  progress: ReviewProgress;
}

export interface MergeReadinessResult {
  ready: boolean;
  blockers: string[];
}

export function evaluateMergeReadiness(
  input: MergeReadinessInput
): MergeReadinessResult {
  const blockers: string[] = [];

  if (input.conflictStatus !== "clean") {
    blockers.push("Resolve every conflict before merging.");
  }

  if (!input.reviewSubmitted) {
    blockers.push("Submit the GitHub review before merging.");
  }

  if (!input.progress.complete) {
    blockers.push("Save a decision for every changed file.");
  }

  return {
    ready: blockers.length === 0,
    blockers
  };
}
