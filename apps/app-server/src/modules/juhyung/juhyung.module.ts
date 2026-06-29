import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import {
  JuhyungGithubAppCallbackController,
  JuhyungGithubConnectionController,
} from "./juhyung-github-connection.controller";
import { JuhyungGithubConnectionRepository } from "./juhyung-github-connection.repository";
import { JuhyungGithubConnectionService } from "./juhyung-github-connection.service";
import { JuhyungGithubReadController } from "./juhyung-github-read.controller";
import { JuhyungGithubReadService } from "./juhyung-github-read.service";
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
    JuhyungProgressController,
  ],
  providers: [
    JuhyungRepository,
    JuhyungPublicAdapter,
    JuhyungTaskService,
    JuhyungGithubConnectionRepository,
    JuhyungGithubConnectionService,
    JuhyungGithubReadService,
    JuhyungProgressService,
  ],
  exports: [
    JuhyungRepository,
    JuhyungPublicAdapter,
    JuhyungTaskService,
    JuhyungGithubConnectionRepository,
    JuhyungGithubConnectionService,
    JuhyungGithubReadService,
    JuhyungProgressService,
  ],
})
export class JuhyungModule {}
