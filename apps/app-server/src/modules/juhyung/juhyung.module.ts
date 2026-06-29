import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import {
  JuhyungGithubAppCallbackController,
  JuhyungGithubConnectionController,
} from "./juhyung-github-connection.controller";
import { JuhyungGithubConnectionRepository } from "./juhyung-github-connection.repository";
import { JuhyungGithubConnectionService } from "./juhyung-github-connection.service";
import { JuhyungTaskService } from "./juhyung-task.service";
import { JuhyungRepository } from "./juhyung.repository";

@Module({
  imports: [DatabaseModule, WorkspaceModule],
  controllers: [
    JuhyungGithubConnectionController,
    JuhyungGithubAppCallbackController,
  ],
  providers: [
    JuhyungRepository,
    JuhyungTaskService,
    JuhyungGithubConnectionRepository,
    JuhyungGithubConnectionService,
  ],
  exports: [
    JuhyungRepository,
    JuhyungTaskService,
    JuhyungGithubConnectionRepository,
    JuhyungGithubConnectionService,
  ],
})
export class JuhyungModule {}
