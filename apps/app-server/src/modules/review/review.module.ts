import { Module } from "@nestjs/common";
import { InMemoryPullRequestAnalysisRepository } from "./analysis/in-memory-pull-request-analysis.repository";
import { PullRequestAnalysisController } from "./analysis/pull-request-analysis.controller";
import { PullRequestAnalysisService } from "./analysis/pull-request-analysis.service";
import { ChangedFilesService } from "./changes/changed-files.service";
import { InMemoryChangedFilesRepository } from "./changes/in-memory-changed-files.repository";
import { InMemoryReviewGraphRepository } from "./graph/in-memory-review-graph.repository";
import { ReviewGraphController } from "./graph/review-graph.controller";
import { ReviewGraphService } from "./graph/review-graph.service";
import { ReviewPublicController } from "./public/review-public.controller";
import { ReviewPublicService } from "./public/review-public.service";
import { AgentChangedFilesResultService } from "./result/agent-changed-files-result.service";
import { AgentGraphResultService } from "./result/agent-graph-result.service";
import { AgentResultConsumerService } from "./result/agent-result-consumer.service";
import { InMemoryCodeReviewRoomRepository } from "./room/in-memory-code-review-room.repository";
import { ReviewRoomController } from "./room/review-room.controller";
import { ReviewRoomService } from "./room/review-room.service";

@Module({
  controllers: [
    ReviewPublicController,
    ReviewRoomController,
    PullRequestAnalysisController,
    ReviewGraphController,
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
    AgentChangedFilesResultService,
    ReviewGraphService,
    InMemoryReviewGraphRepository,
    AgentGraphResultService,
  ],
})
export class ReviewModule {}
