import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import {
  CodeReviewRoomRecord,
  CodeReviewRoomSummary,
  PullRequestSummaryRef,
  ReviewRoomActorContext,
  ReviewRoomCreatedEvent,
} from "./code-review-room.types";
import { InMemoryCodeReviewRoomRepository } from "./in-memory-code-review-room.repository";
import {
  DEFAULT_REVIEW_ROOM_CONTEXT,
  REVIEW_ROOM_PULL_REQUEST_FIXTURES,
} from "./review-room.fixtures";

@Injectable()
export class ReviewRoomService {
  constructor(
    private readonly roomRepository: InMemoryCodeReviewRoomRepository,
    private readonly defaultContext: ReviewRoomActorContext = DEFAULT_REVIEW_ROOM_CONTEXT,
    private readonly pullRequestSummaries: ReadonlyMap<
      string,
      PullRequestSummaryRef
    > = REVIEW_ROOM_PULL_REQUEST_FIXTURES,
  ) {}

  openRoomForPullRequest(
    pullRequestId: string,
    context: ReviewRoomActorContext = this.defaultContext,
  ): CodeReviewRoomSummary {
    const pullRequest = this.findPullRequestOrThrow(pullRequestId);
    const existingRoom = this.roomRepository.findByPullRequestId(pullRequestId);

    if (existingRoom) {
      return this.toSummary(existingRoom, pullRequest);
    }

    const createdAt = new Date().toISOString();
    const room = this.roomRepository.create({
      id: randomUUID(),
      workspaceId: context.workspaceId,
      pullRequestId,
      createdByMemberId: context.memberId,
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
    const pullRequest = this.pullRequestSummaries.get(pullRequestId);

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
