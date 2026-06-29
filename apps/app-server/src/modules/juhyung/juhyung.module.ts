import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { WorkspaceMemberAccessService } from "../workspace/workspace-member-access.service";
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
    JuhyungGithubConnectionRepository,
    JuhyungGithubConnectionService,
    WorkspaceMemberAccessService,
  ],
  exports: [
    JuhyungRepository,
    JuhyungPublicAdapter,
    JuhyungTaskService,
    JuhyungGithubConnectionRepository,
    JuhyungGithubConnectionService,
    WorkspaceMemberAccessService,
  ],
})
export class JuhyungModule {}
