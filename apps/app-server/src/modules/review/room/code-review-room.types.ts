export type CodeReviewRoomStatus =
  | "open"
  | "reviewing"
  | "completed"
  | "archived";

export interface PullRequestSummaryRef {
  id: string;
  repositoryId: string;
  number: number;
  title: string;
  authorLogin: string | null;
  state:
    | "open"
    | "review_requested"
    | "changes_requested"
    | "merged"
    | "closed";
  branch: string | null;
  baseBranch: string | null;
  url: string;
  changedFilesCount: number;
  additions: number;
  deletions: number;
  linkedTaskIds: string[];
  syncedAt: string | null;
}

export interface OpenReviewRoomBody {
  pullRequest?: Partial<PullRequestSummaryRef> | null;
}

export interface CodeReviewRoomRecord {
  id: string;
  workspaceId: string;
  pullRequestId: string;
  status: CodeReviewRoomStatus;
  createdByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
  pullRequestSnapshot: PullRequestSummaryRef | null;
}

export interface CodeReviewRoomSummary
  extends Omit<CodeReviewRoomRecord, "pullRequestSnapshot"> {
  pullRequest: PullRequestSummaryRef;
}

export interface CreateCodeReviewRoomInput {
  id: string;
  workspaceId: string;
  pullRequestId: string;
  createdByMemberId: string | null;
  createdAt: string;
  pullRequestSnapshot?: PullRequestSummaryRef | null;
}

export interface ReviewRoomActorContext {
  workspaceId: string;
  memberId: string | null;
}

export interface ReviewRoomCreatedEvent {
  eventType: "review.room_created";
  roomId: string;
  pullRequestId: string;
  workspaceId: string;
  createdByMemberId: string | null;
  occurredAt: string;
}
