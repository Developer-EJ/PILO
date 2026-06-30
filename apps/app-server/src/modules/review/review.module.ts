import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PullRequestAnalysisRepository } from "./analysis/pull-request-analysis.repository";
import { PullRequestAnalysisController } from "./analysis/pull-request-analysis.controller";
import { PullRequestAnalysisService } from "./analysis/pull-request-analysis.service";
import { RuntimePullRequestAnalysisRepository } from "./analysis/runtime-pull-request-analysis.repository";
import { InMemoryReviewArtifactsRepository } from "./artifacts/in-memory-review-artifacts.repository";
import { ReviewArtifactsController } from "./artifacts/review-artifacts.controller";
import { ReviewArtifactsService } from "./artifacts/review-artifacts.service";
import { ChangedFilesController } from "./changes/changed-files.controller";
import { ChangedFilesService } from "./changes/changed-files.service";
import { InMemoryChangedFilesRepository } from "./changes/in-memory-changed-files.repository";
import { ReviewGraphRepository } from "./graph/review-graph.repository";
import { ReviewGraphController } from "./graph/review-graph.controller";
import { ReviewGraphService } from "./graph/review-graph.service";
import { RuntimeReviewGraphRepository } from "./graph/runtime-review-graph.repository";
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
  imports: [DatabaseModule],
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
    {
      provide: PullRequestSummaryRegistry,
      useFactory: () =>
        new PullRequestSummaryRegistry({
          seedFixture: shouldSeedReviewFixtures(),
        }),
    },
    ReviewRoomService,
    InMemoryCodeReviewRoomRepository,
    {
      provide: PullRequestAnalysisRepository,
      useClass: RuntimePullRequestAnalysisRepository,
    },
    {
      provide: PullRequestAnalysisService,
      useFactory: (
        repository: PullRequestAnalysisRepository,
        pullRequestRegistry: PullRequestSummaryRegistry,
        graphService: ReviewGraphService,
      ) =>
        new PullRequestAnalysisService(
          repository,
          { seedFixture: shouldSeedReviewFixtures() },
          pullRequestRegistry,
          graphService,
        ),
      inject: [
        PullRequestAnalysisRepository,
        PullRequestSummaryRegistry,
        ReviewGraphService,
      ],
    },
    ReviewArtifactsService,
    InMemoryReviewArtifactsRepository,
    InMemoryChangedFilesRepository,
    {
      provide: ReviewGraphRepository,
      useClass: RuntimeReviewGraphRepository,
    },
    {
      provide: ChangedFilesService,
      useFactory: (repository: InMemoryChangedFilesRepository) =>
        new ChangedFilesService(repository, {
          seedFixture: shouldSeedReviewFixtures(),
        }),
      inject: [InMemoryChangedFilesRepository],
    },
    {
      provide: ReviewGraphService,
      useFactory: (
        repository: ReviewGraphRepository,
        analysisRepository: PullRequestAnalysisRepository,
      ) =>
        new ReviewGraphService(
          repository,
          { seedFixture: shouldSeedReviewFixtures() },
          analysisRepository,
        ),
      inject: [
        ReviewGraphRepository,
        PullRequestAnalysisRepository,
      ],
    },
    AgentGraphResultService,
    AgentReviewArtifactsResultService,
    AgentResultConsumerService,
    AgentChangedFilesResultService,
  ],
})
export class ReviewModule {}

function shouldSeedReviewFixtures() {
  return process.env.PILO_SEED_REVIEW_FIXTURES === "true";
}
