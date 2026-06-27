import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import {
  CodeReviewRoomRecord,
  CodeReviewRoomSummary,
  PullRequestSummaryRef,
  ReviewRoomCreatedEvent,
} from "./code-review-room.types";
import { InMemoryCodeReviewRoomRepository } from "./in-memory-code-review-room.repository";

const CURRENT_MEMBER_FIXTURE = {
  workspaceId: "22222222-2222-4222-8222-222222222222",
  memberId: "33333333-3333-4333-8333-333333333331",
};

const PULL_REQUEST_FIXTURES = new Map<string, PullRequestSummaryRef>([
  [
    "66666666-6666-4666-8666-666666666661",
    {
      id: "66666666-6666-4666-8666-666666666661",
      repositoryId: "55555555-5555-4555-8555-555555555501",
      number: 7,
      title: "Add OAuth callback shell",
      authorLogin: "Developer-EJ",
      state: "review_requested",
      branch: "feature/donghyun/auth-login",
      baseBranch: "dev",
      url: "https://github.com/example/pilo/pull/7",
      changedFilesCount: 4,
      additions: 180,
      deletions: 12,
      linkedTaskIds: ["44444444-4444-4444-8444-444444444441"],
      syncedAt: "2026-06-27T10:00:00.000Z",
    },
  ],
]);

@Injectable()
export class ReviewRoomService {
  constructor(
    private readonly roomRepository: InMemoryCodeReviewRoomRepository,
  ) {}

  openRoomForPullRequest(pullRequestId: string): CodeReviewRoomSummary {
    const pullRequest = this.findPullRequestOrThrow(pullRequestId);
    const existingRoom = this.roomRepository.findByPullRequestId(pullRequestId);

    if (existingRoom) {
      return this.toSummary(existingRoom, pullRequest);
    }

    const createdAt = new Date().toISOString();
    const room = this.roomRepository.create({
      id: randomUUID(),
      workspaceId: CURRENT_MEMBER_FIXTURE.workspaceId,
      pullRequestId,
      createdByMemberId: CURRENT_MEMBER_FIXTURE.memberId,
      createdAt,
    });

    return this.toSummary(room, pullRequest);
  }

  getRoom(roomId: string): CodeReviewRoomSummary {
    const room = this.roomRepository.findById(roomId);

    if (!room) {
      throw new NotFoundException(`Code review room was not found: ${roomId}`);
    }

    const pullRequest = this.findPullRequestOrThrow(room.pullRequestId);
    return this.toSummary(room, pullRequest);
  }

  toRoomCreatedEvent(room: CodeReviewRoomSummary): ReviewRoomCreatedEvent {
    return {
      eventType: "review.room_created",
      roomId: room.id,
      pullRequestId: room.pullRequestId,
      workspaceId: room.workspaceId,
      createdByMemberId: room.createdByMemberId,
      occurredAt: room.createdAt,
    };
  }

  private findPullRequestOrThrow(pullRequestId: string): PullRequestSummaryRef {
    const pullRequest = PULL_REQUEST_FIXTURES.get(pullRequestId);

    if (!pullRequest) {
      throw new NotFoundException(
        `PullRequestSummary fixture was not found: ${pullRequestId}`,
      );
    }

    return pullRequest;
  }

  private toSummary(
    room: CodeReviewRoomRecord,
    pullRequest: PullRequestSummaryRef,
  ): CodeReviewRoomSummary {
    return {
      ...room,
      pullRequest,
    };
  }
}
