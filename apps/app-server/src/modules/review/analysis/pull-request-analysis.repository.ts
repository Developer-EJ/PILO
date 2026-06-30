import {
  CreatePullRequestAnalysisInput,
  PullRequestAnalysisRecord,
} from "./pull-request-analysis.types";

export type MaybePromise<T> = T | Promise<T>;

export abstract class PullRequestAnalysisRepository {
  abstract findById(
    analysisId: string,
  ): MaybePromise<PullRequestAnalysisRecord | null>;

  abstract findByPullRequestId(
    pullRequestId: string,
  ): MaybePromise<PullRequestAnalysisRecord | null>;

  abstract create(
    input: CreatePullRequestAnalysisInput,
  ): MaybePromise<PullRequestAnalysisRecord>;

  abstract save(
    analysis: PullRequestAnalysisRecord,
  ): MaybePromise<PullRequestAnalysisRecord>;
}
