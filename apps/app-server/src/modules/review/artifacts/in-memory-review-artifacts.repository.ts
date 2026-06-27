import { Injectable } from "@nestjs/common";
import {
  ReviewChecklistItemRecord,
  ReviewChecklistType,
  ReviewCommentRecord,
} from "./review-artifact.types";

@Injectable()
export class InMemoryReviewArtifactsRepository {
  private readonly commentsById = new Map<string, ReviewCommentRecord>();
  private readonly commentIdsByRoom = new Map<string, string[]>();
  private readonly checklistItemsById = new Map<
    string,
    ReviewChecklistItemRecord
  >();
  private readonly checklistItemIdsBySlot = new Map<string, string>();

  saveComment(comment: ReviewCommentRecord): ReviewCommentRecord {
    this.commentsById.set(comment.id, comment);
    const commentIds = this.commentIdsByRoom.get(comment.roomId) ?? [];

    if (!commentIds.includes(comment.id)) {
      this.commentIdsByRoom.set(comment.roomId, [...commentIds, comment.id]);
    }

    return comment;
  }

  listCommentsByRoom(roomId: string): ReviewCommentRecord[] {
    return (this.commentIdsByRoom.get(roomId) ?? []).flatMap((commentId) => {
      const comment = this.commentsById.get(commentId);
      return comment ? [comment] : [];
    });
  }

  findChecklistItemBySlot(
    analysisId: string,
    checklistType: ReviewChecklistType,
    sortOrder: number,
  ): ReviewChecklistItemRecord | null {
    const itemId = this.checklistItemIdsBySlot.get(
      this.slotKey(analysisId, checklistType, sortOrder),
    );
    return itemId ? (this.checklistItemsById.get(itemId) ?? null) : null;
  }

  listChecklistItems(analysisId: string): ReviewChecklistItemRecord[] {
    return [...this.checklistItemsById.values()]
      .filter((item) => item.analysisId === analysisId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  nextChecklistSortOrder(
    analysisId: string,
    checklistType: ReviewChecklistType,
  ): number {
    return this.listChecklistItems(analysisId).filter(
      (item) => item.checklistType === checklistType,
    ).length;
  }

  saveChecklistItem(
    item: ReviewChecklistItemRecord,
  ): ReviewChecklistItemRecord {
    this.checklistItemsById.set(item.id, item);
    this.checklistItemIdsBySlot.set(
      this.slotKey(item.analysisId, item.checklistType, item.sortOrder),
      item.id,
    );
    return item;
  }

  private slotKey(
    analysisId: string,
    checklistType: ReviewChecklistType,
    sortOrder: number,
  ): string {
    return `${analysisId}:${checklistType}:${sortOrder}`;
  }
}
