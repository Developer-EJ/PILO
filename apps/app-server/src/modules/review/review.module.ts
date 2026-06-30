import { Module } from "@nestjs/common";
import { InMemoryPullRequestAnalysisRepository } from "./analysis/in-memory-pull-request-analysis.repository";
import { PullRequestAnalysisController } from "./analysis/pull-request-analysis.controller";
import { PullRequestAnalysisService } from "./analysis/pull-request-analysis.service";
import { InMemoryReviewArtifactsRepository } from "./artifacts/in-memory-review-artifacts.repository";
import { ReviewArtifactsController } from "./artifacts/review-artifacts.controller";
import { ReviewArtifactsService } from "./artifacts/review-artifacts.service";
import { ChangedFilesController } from "./changes/changed-files.controller";
import { ChangedFilesService } from "./changes/changed-files.service";
import { InMemoryChangedFilesRepository } from "./changes/in-memory-changed-files.repository";
import { InMemoryReviewGraphRepository } from "./graph/in-memory-review-graph.repository";
import { ReviewGraphController } from "./graph/review-graph.controller";
import { ReviewGraphService } from "./graph/review-graph.service";
import { ReviewPublicController } from "./public/review-public.controller";
import { ReviewPublicService } from "./public/review-public.service";
import { AgentChangedFilesResultService } from "./result/agent-changed-files-result.service";
import { AgentGraphResultService } from "./result/agent-graph-result.service";
import { AgentReviewArtifactsResultService } from "./result/agent-review-artifacts-result.service";
import { AgentResultConsumerService } from "./result/agent-result-consumer.service";
import { InMemoryCodeReviewRoomRepository } from "./room/in-memory-code-review-room.repository";
import { PullRequestSummaryRegistry } from "./room/pull-request-summary.registry";
import { ReviewRoomController } from "./room/review-room.controller";
import { ReviewRoomService } from "./room/review-room.service";

@Module({
  controllers: [
    ReviewPublicController,
    ReviewRoomController,
    PullRequestAnalysisController,
    ReviewArtifactsController,
    ChangedFilesController,
    ReviewGraphController,
  ],
  providers: [
    ReviewPublicService,
    PullRequestSummaryRegistry,
    ReviewRoomService,
    InMemoryCodeReviewRoomRepository,
    InMemoryPullRequestAnalysisRepository,
    {
      provide: PullRequestAnalysisService,
      useFactory: (
        repository: InMemoryPullRequestAnalysisRepository,
        pullRequestRegistry: PullRequestSummaryRegistry,
      ) =>
        new PullRequestAnalysisService(
          repository,
          { seedFixture: true },
          pullRequestRegistry,
        ),
      inject: [
        InMemoryPullRequestAnalysisRepository,
        PullRequestSummaryRegistry,
      ],
    },
    ReviewArtifactsService,
    InMemoryReviewArtifactsRepository,
    InMemoryChangedFilesRepository,
    InMemoryReviewGraphRepository,
    {
      provide: ChangedFilesService,
      useFactory: (repository: InMemoryChangedFilesRepository) =>
        new ChangedFilesService(repository, { seedFixture: true }),
      inject: [InMemoryChangedFilesRepository],
    },
    {
      provide: ReviewGraphService,
      useFactory: (repository: InMemoryReviewGraphRepository) =>
        new ReviewGraphService(repository, { seedFixture: true }),
      inject: [InMemoryReviewGraphRepository],
    },
    AgentGraphResultService,
    AgentReviewArtifactsResultService,
    AgentResultConsumerService,
    AgentChangedFilesResultService,
  ],
})
export class ReviewModule {}
