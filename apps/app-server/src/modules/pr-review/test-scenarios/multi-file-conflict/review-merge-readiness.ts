import type { ReviewProgress } from "./review-progress";

export interface MergeReadinessInput {
  conflictStatus: "checking" | "clean" | "conflicted" | "unknown";
  reviewSubmitted: boolean;
  progress: ReviewProgress;
  requiredChecks: "pending" | "passing" | "failing";
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
    blockers.push("The pull request must have a clean merge status.");
  }

  if (input.requiredChecks !== "passing") {
    blockers.push("Every required check must pass before merging.");
  }

  if (!input.reviewSubmitted) {
    blockers.push("A GitHub review submission is required.");
  }

  if (!input.progress.complete) {
    blockers.push("Every changed file needs a final review decision.");
  }

  return {
    ready: blockers.length === 0,
    blockers
  };
}
