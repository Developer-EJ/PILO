import { Controller, Get, Param, Post } from "@nestjs/common";
import { CodeReviewRoomSummary } from "./code-review-room.types";
import { ReviewRoomService } from "./review-room.service";

@Controller()
export class ReviewRoomController {
  constructor(private readonly reviewRoomService: ReviewRoomService) {}

  @Post("pull-requests/:pullRequestId/review-room")
  openRoomForPullRequest(
    @Param("pullRequestId") pullRequestId: string,
  ): CodeReviewRoomSummary {
    return this.reviewRoomService.openRoomForPullRequest(pullRequestId);
  }

  @Get("code-review-rooms/:roomId")
  getRoom(@Param("roomId") roomId: string): CodeReviewRoomSummary {
    return this.reviewRoomService.getRoom(roomId);
  }
}
