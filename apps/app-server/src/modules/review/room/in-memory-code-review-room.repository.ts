import { Injectable } from "@nestjs/common";
import {
  CodeReviewRoomRecord,
  CreateCodeReviewRoomInput,
} from "./code-review-room.types";
import { CodeReviewRoomRepository } from "./code-review-room.repository";

@Injectable()
export class InMemoryCodeReviewRoomRepository
  implements CodeReviewRoomRepository
{
  private readonly roomsById = new Map<string, CodeReviewRoomRecord>();
  private readonly roomIdsByPullRequestId = new Map<string, string>();

  findById(roomId: string): CodeReviewRoomRecord | null {
    return this.roomsById.get(roomId) ?? null;
  }

  findByPullRequestId(pullRequestId: string): CodeReviewRoomRecord | null {
    const roomId = this.roomIdsByPullRequestId.get(pullRequestId);
    return roomId ? this.findById(roomId) : null;
  }

  create(input: CreateCodeReviewRoomInput): CodeReviewRoomRecord {
    const existing = this.findByPullRequestId(input.pullRequestId);

    if (existing) {
      return existing;
    }

    const room: CodeReviewRoomRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      pullRequestId: input.pullRequestId,
      status: "open",
      createdByMemberId: input.createdByMemberId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };

    this.roomsById.set(room.id, room);
    this.roomIdsByPullRequestId.set(room.pullRequestId, room.id);
    return room;
  }
}
