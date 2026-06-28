import { Module } from "@nestjs/common";
import { InMemoryPullRequestAnalysisRepository } from "./analysis/in-memory-pull-request-analysis.repository";
import { PullRequestAnalysisController } from "./analysis/pull-request-analysis.controller";
import { PullRequestAnalysisService } from "./analysis/pull-request-analysis.service";
import { ChangedFilesService } from "./changes/changed-files.service";
import { InMemoryChangedFilesRepository } from "./changes/in-memory-changed-files.repository";
import { ReviewPublicController } from "./public/review-public.controller";
import { ReviewPublicService } from "./public/review-public.service";
import { AgentResultConsumerService } from "./result/agent-result-consumer.service";
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
    ChangedFilesService,
    InMemoryChangedFilesRepository,
    AgentResultConsumerService,
  ],
})
export class ReviewModule {}
