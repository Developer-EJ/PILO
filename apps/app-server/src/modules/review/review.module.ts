import { Module } from "@nestjs/common";
import { InMemoryPullRequestAnalysisRepository } from "./analysis/in-memory-pull-request-analysis.repository";
import { PullRequestAnalysisController } from "./analysis/pull-request-analysis.controller";
import { PullRequestAnalysisService } from "./analysis/pull-request-analysis.service";
import { ReviewPublicController } from "./public/review-public.controller";
import { ReviewPublicService } from "./public/review-public.service";
import { InMemoryCodeReviewRoomRepository } from "./room/in-memory-code-review-room.repository";
import { ReviewRoomController } from "./room/review-room.controller";
import { ReviewRoomService } from "./room/review-room.service";

@Module({
  controllers: [
    ReviewPublicController,
    ReviewRoomController,
    PullRequestAnalysisController,
  ],
  providers: [
    ReviewPublicService,
    ReviewRoomService,
    InMemoryCodeReviewRoomRepository,
    PullRequestAnalysisService,
    InMemoryPullRequestAnalysisRepository,
  ],
})
export class ReviewModule {}
