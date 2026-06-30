import {
  NodeReviewStateRecord,
  ReviewGraphRecord,
  ReviewNodeRecord,
} from "./review-graph.types";

export type MaybePromise<T> = T | Promise<T>;

export abstract class ReviewGraphRepository {
  abstract findGraphByAnalysis(
    analysisId: string,
  ): MaybePromise<ReviewGraphRecord | null>;

  abstract saveGraph(
    graph: ReviewGraphRecord,
  ): MaybePromise<ReviewGraphRecord>;

  abstract findNodeById(
    nodeId: string,
  ): MaybePromise<ReviewNodeRecord | null>;

  abstract listNodesByGraph(
    graphId: string,
  ): MaybePromise<ReviewNodeRecord[]>;

  abstract saveNode(node: ReviewNodeRecord): MaybePromise<ReviewNodeRecord>;

  abstract findStateByNodeReviewer(
    nodeId: string,
    reviewerMemberId: string,
  ): MaybePromise<NodeReviewStateRecord | null>;

  abstract listStatesByNode(
    nodeId: string,
  ): MaybePromise<NodeReviewStateRecord[]>;

  abstract saveState(
    state: NodeReviewStateRecord,
  ): MaybePromise<NodeReviewStateRecord>;
}
