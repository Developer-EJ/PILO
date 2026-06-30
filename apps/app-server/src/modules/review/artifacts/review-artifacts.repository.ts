import {
  ReviewChecklistItemRecord,
  ReviewChecklistType,
  ReviewCommentRecord,
} from "./review-artifact.types";

export type MaybePromise<T> = T | Promise<T>;

export abstract class ReviewArtifactsRepository {
  abstract saveComment(
    comment: ReviewCommentRecord,
  ): MaybePromise<ReviewCommentRecord>;

  abstract listCommentsByRoom(
    roomId: string,
  ): MaybePromise<ReviewCommentRecord[]>;

  abstract findChecklistItemBySlot(
    analysisId: string,
    checklistType: ReviewChecklistType,
    sortOrder: number,
  ): MaybePromise<ReviewChecklistItemRecord | null>;

  abstract listChecklistItems(
    analysisId: string,
  ): MaybePromise<ReviewChecklistItemRecord[]>;

  abstract findChecklistItemById(
    itemId: string,
  ): MaybePromise<ReviewChecklistItemRecord | null>;

  abstract nextChecklistSortOrder(
    analysisId: string,
    checklistType: ReviewChecklistType,
  ): MaybePromise<number>;

  abstract saveChecklistItem(
    item: ReviewChecklistItemRecord,
  ): MaybePromise<ReviewChecklistItemRecord>;
}
