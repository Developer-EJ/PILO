export type ReviewChecklistType = "review" | "merge";
export type ReviewChecklistStatus = "todo" | "done" | "skipped";

export interface ReviewCommentRecord {
  id: string;
  roomId: string;
  authorMemberId: string | null;
  nodeId: string | null;
  changedFileId: string | null;
  changedFunctionId: string | null;
  body: string;
  createdAt: string;
}

export interface ReviewChecklistItemRecord {
  id: string;
  analysisId: string;
  checklistType: ReviewChecklistType;
  title: string;
  status: ReviewChecklistStatus;
  checkedByMemberId: string | null;
  checkedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReviewCommentInput {
  authorMemberId?: string | null;
  nodeId?: string | null;
  changedFileId?: string | null;
  changedFunctionId?: string | null;
  body?: string | null;
  createdAt?: string;
}

export interface CreateReviewChecklistItemInput {
  checklistType?: string;
  title?: string | null;
  status?: string;
  checkedByMemberId?: string | null;
  checkedAt?: string | null;
  sortOrder?: number;
  changedAt?: string;
}
