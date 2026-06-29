import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { JuhyungPublicAdapter } from "./juhyung-public.adapter";
import { JuhyungTaskService } from "./juhyung-task.service";
import { JuhyungTasksController } from "./juhyung-tasks.controller";
import { JuhyungRepository } from "./juhyung.repository";

@Module({
  imports: [DatabaseModule, WorkspaceModule],
  controllers: [JuhyungTasksController],
  providers: [JuhyungRepository, JuhyungPublicAdapter, JuhyungTaskService],
  exports: [JuhyungRepository, JuhyungPublicAdapter, JuhyungTaskService],
})
export class JuhyungModule {}
