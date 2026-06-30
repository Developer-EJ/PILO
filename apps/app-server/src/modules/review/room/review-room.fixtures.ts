import {
  PullRequestSummaryRef,
  ReviewRoomActorContext,
} from "./code-review-room.types";

export const DEFAULT_REVIEW_ROOM_CONTEXT: ReviewRoomActorContext = {
  workspaceId: "22222222-2222-4222-8222-222222222222",
  memberId: "33333333-3333-4333-8333-333333333331",
};

export const REVIEW_ROOM_PULL_REQUEST_FIXTURE: PullRequestSummaryRef = {
  id: "66666666-6666-4666-8666-666666666661",
  repositoryId: "55555555-5555-4555-8555-555555555501",
  number: 7,
  title: "OAuth callback 화면 골격 추가",
  authorLogin: "Developer-EJ",
  state: "review_requested",
  branch: "feature/donghyun/auth-login",
  baseBranch: "temp-dev",
  url: "https://github.com/example/pilo/pull/7",
  changedFilesCount: 4,
  additions: 180,
  deletions: 12,
  linkedTaskIds: ["44444444-4444-4444-8444-444444444441"],
  syncedAt: "2026-06-27T10:00:00.000Z",
};

export const REVIEW_ROOM_PULL_REQUEST_FIXTURES = new Map<
  string,
  PullRequestSummaryRef
>([[REVIEW_ROOM_PULL_REQUEST_FIXTURE.id, REVIEW_ROOM_PULL_REQUEST_FIXTURE]]);
