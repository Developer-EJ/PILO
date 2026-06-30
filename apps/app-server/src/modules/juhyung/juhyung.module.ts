import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import {
  JuhyungGithubAppCallbackController,
  JuhyungGithubConnectionController,
} from "./juhyung-github-connection.controller";
import { JuhyungGithubConnectionRepository } from "./juhyung-github-connection.repository";
import { JuhyungGithubConnectionService } from "./juhyung-github-connection.service";
import { JuhyungPublicAdapter } from "./juhyung-public.adapter";
import { JuhyungTaskService } from "./juhyung-task.service";
import { JuhyungTasksController } from "./juhyung-tasks.controller";
import { JuhyungRepository } from "./juhyung.repository";
import {
  JuhyungTaskDraftPublicWriteAdapter,
  TASK_DRAFT_PUBLIC_WRITE_ADAPTER,
} from "./public/task-draft-public-write.adapter";

@Module({
  imports: [DatabaseModule, WorkspaceModule],
  controllers: [
    JuhyungTasksController,
    JuhyungGithubConnectionController,
    JuhyungGithubAppCallbackController,
  ],
  providers: [
    JuhyungRepository,
    JuhyungPublicAdapter,
    JuhyungTaskService,
    JuhyungTaskDraftPublicWriteAdapter,
    {
      provide: TASK_DRAFT_PUBLIC_WRITE_ADAPTER,
      useExisting: JuhyungTaskDraftPublicWriteAdapter,
    },
    JuhyungGithubConnectionRepository,
    JuhyungGithubConnectionService,
  ],
  exports: [
    JuhyungRepository,
    JuhyungPublicAdapter,
    JuhyungTaskService,
    TASK_DRAFT_PUBLIC_WRITE_ADAPTER,
    JuhyungGithubConnectionRepository,
    JuhyungGithubConnectionService,
  ],
})
export class JuhyungModule {}
