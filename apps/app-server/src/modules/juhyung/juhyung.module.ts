import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import {
  JuhyungGithubAppCallbackController,
  JuhyungGithubConnectionController,
} from "./juhyung-github-connection.controller";
import { JuhyungGithubConnectionRepository } from "./juhyung-github-connection.repository";
import { JuhyungGithubConnectionService } from "./juhyung-github-connection.service";
import { JuhyungGithubProviderClient } from "./juhyung-github-provider.client";
import { JuhyungGithubReadController } from "./juhyung-github-read.controller";
import { JuhyungGithubReadService } from "./juhyung-github-read.service";
import { JuhyungGithubSyncController } from "./juhyung-github-sync.controller";
import { JuhyungGithubSyncService } from "./juhyung-github-sync.service";
import { JuhyungProgressController } from "./juhyung-progress.controller";
import { JuhyungProgressService } from "./juhyung-progress.service";
import { JuhyungPublicAdapter } from "./juhyung-public.adapter";
import { JuhyungTaskService } from "./juhyung-task.service";
import { JuhyungTasksController } from "./juhyung-tasks.controller";
import { JuhyungRepository } from "./juhyung.repository";

@Module({
  imports: [DatabaseModule, WorkspaceModule],
  controllers: [
    JuhyungTasksController,
    JuhyungGithubConnectionController,
    JuhyungGithubAppCallbackController,
    JuhyungGithubReadController,
    JuhyungGithubSyncController,
    JuhyungProgressController,
  ],
  providers: [
    JuhyungRepository,
    JuhyungPublicAdapter,
    JuhyungTaskService,
    JuhyungGithubConnectionRepository,
    JuhyungGithubConnectionService,
    JuhyungGithubProviderClient,
    JuhyungGithubReadService,
    JuhyungGithubSyncService,
    JuhyungProgressService,
  ],
  exports: [
    JuhyungRepository,
    JuhyungPublicAdapter,
    JuhyungTaskService,
    JuhyungGithubConnectionRepository,
    JuhyungGithubConnectionService,
    JuhyungGithubProviderClient,
    JuhyungGithubReadService,
    JuhyungGithubSyncService,
    JuhyungProgressService,
  ],
})
export class JuhyungModule {}
