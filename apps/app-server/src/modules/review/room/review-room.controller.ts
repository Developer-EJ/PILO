import {
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import {
  CodeReviewRoomSummary,
  ReviewRoomActorContext,
} from "./code-review-room.types";
import { DEFAULT_REVIEW_ROOM_CONTEXT } from "./review-room.fixtures";
import { ReviewRoomService } from "./review-room.service";

@Controller()
export class ReviewRoomController {
  constructor(private readonly reviewRoomService: ReviewRoomService) {}

  @Post("pull-requests/:pullRequestId/review-room")
  openRoomForPullRequest(
    @Param("pullRequestId", ParseUUIDPipe) pullRequestId: string,
    @Headers("x-workspace-id") workspaceId?: string,
    @Headers("x-member-id") memberId?: string,
  ): CodeReviewRoomSummary {
    return this.reviewRoomService.openRoomForPullRequest(
      pullRequestId,
      this.actorContextFromHeaders(workspaceId, memberId),
    );
  }

  @Get("code-review-rooms/:roomId")
  getRoom(
    @Param("roomId", ParseUUIDPipe) roomId: string,
  ): CodeReviewRoomSummary {
    return this.reviewRoomService.getRoom(roomId);
  }

  private actorContextFromHeaders(
    workspaceId?: string,
    memberId?: string,
  ): ReviewRoomActorContext {
    return {
      workspaceId: workspaceId ?? DEFAULT_REVIEW_ROOM_CONTEXT.workspaceId,
      memberId: memberId ?? DEFAULT_REVIEW_ROOM_CONTEXT.memberId,
    };
  }
}
