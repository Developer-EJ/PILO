import { Module } from "@nestjs/common";
import { InMemoryPullRequestAnalysisRepository } from "./analysis/in-memory-pull-request-analysis.repository";
import { PullRequestAnalysisController } from "./analysis/pull-request-analysis.controller";
import { PullRequestAnalysisService } from "./analysis/pull-request-analysis.service";
import { InMemoryReviewArtifactsRepository } from "./artifacts/in-memory-review-artifacts.repository";
import { ReviewArtifactsController } from "./artifacts/review-artifacts.controller";
import { ReviewArtifactsService } from "./artifacts/review-artifacts.service";
import { ChangedFilesService } from "./changes/changed-files.service";
import { InMemoryChangedFilesRepository } from "./changes/in-memory-changed-files.repository";
import { ReviewPublicController } from "./public/review-public.controller";
import { ReviewPublicService } from "./public/review-public.service";
import { AgentReviewArtifactsResultService } from "./result/agent-review-artifacts-result.service";
import { InMemoryCodeReviewRoomRepository } from "./room/in-memory-code-review-room.repository";
import { ReviewRoomController } from "./room/review-room.controller";
import { ReviewRoomService } from "./room/review-room.service";

@Module({
  controllers: [
    ReviewPublicController,
    ReviewRoomController,
    PullRequestAnalysisController,
    ReviewArtifactsController,
  ],
  providers: [
    ReviewPublicService,
    ReviewRoomService,
    InMemoryCodeReviewRoomRepository,
    PullRequestAnalysisService,
    InMemoryPullRequestAnalysisRepository,
    ReviewArtifactsService,
    InMemoryReviewArtifactsRepository,
    ChangedFilesService,
    InMemoryChangedFilesRepository,
    AgentReviewArtifactsResultService,
  ],
})
export class ReviewModule {}
