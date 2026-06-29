import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import {
  CodeReviewRoomRecord,
  CodeReviewRoomSummary,
  OpenReviewRoomBody,
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
  private readonly defaultContext: ReviewRoomActorContext =
    DEFAULT_REVIEW_ROOM_CONTEXT;

  private readonly pullRequestSummaries = new Map<string, PullRequestSummaryRef>(
    REVIEW_ROOM_PULL_REQUEST_FIXTURES,
  );

  constructor(
    private readonly roomRepository: InMemoryCodeReviewRoomRepository,
  ) {}

  openRoomForPullRequest(
    pullRequestId: string,
    context: ReviewRoomActorContext = this.defaultContext,
    body: OpenReviewRoomBody = {},
  ): CodeReviewRoomSummary {
    const pullRequest = this.resolvePullRequest(pullRequestId, body);
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

  private resolvePullRequest(
    pullRequestId: string,
    body: OpenReviewRoomBody,
  ): PullRequestSummaryRef {
    const fromBody = normalizePullRequestSummary(pullRequestId, body.pullRequest);

    if (fromBody) {
      this.pullRequestSummaries.set(pullRequestId, fromBody);
      return fromBody;
    }

    return this.findPullRequestOrThrow(pullRequestId);
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

function normalizePullRequestSummary(
  pullRequestId: string,
  value: OpenReviewRoomBody["pullRequest"],
): PullRequestSummaryRef | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (
    value.id !== pullRequestId ||
    typeof value.repositoryId !== "string" ||
    typeof value.number !== "number" ||
    typeof value.title !== "string" ||
    typeof value.state !== "string" ||
    typeof value.url !== "string"
  ) {
    return null;
  }

  return {
    id: pullRequestId,
    repositoryId: value.repositoryId,
    number: value.number,
    title: value.title,
    authorLogin:
      typeof value.authorLogin === "string" ? value.authorLogin : null,
    state: normalizePullRequestState(value.state),
    branch: typeof value.branch === "string" ? value.branch : null,
    baseBranch:
      typeof value.baseBranch === "string" ? value.baseBranch : null,
    url: value.url,
    changedFilesCount: toInteger(value.changedFilesCount),
    additions: toInteger(value.additions),
    deletions: toInteger(value.deletions),
    linkedTaskIds: Array.isArray(value.linkedTaskIds)
      ? value.linkedTaskIds.filter((id): id is string => typeof id === "string")
      : [],
    syncedAt: typeof value.syncedAt === "string" ? value.syncedAt : null,
  };
}

function normalizePullRequestState(
  state: string,
): PullRequestSummaryRef["state"] {
  if (
    state === "open" ||
    state === "review_requested" ||
    state === "changes_requested" ||
    state === "merged" ||
    state === "closed"
  ) {
    return state;
  }

  return "open";
}

function toInteger(value: unknown): number {
  return Number.isInteger(value) ? (value as number) : 0;
}
