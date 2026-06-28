import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { WorkspaceMemberAccessService } from "../workspace/workspace-member-access.service";
import { JuhyungPublicAdapter } from "./juhyung-public.adapter";
import { JuhyungTaskService } from "./juhyung-task.service";
import { JuhyungTasksController } from "./juhyung-tasks.controller";
import { JuhyungRepository } from "./juhyung.repository";

@Module({
  imports: [DatabaseModule],
  controllers: [JuhyungTasksController],
  providers: [
    JuhyungRepository,
    JuhyungPublicAdapter,
    JuhyungTaskService,
    WorkspaceMemberAccessService,
  ],
  exports: [
    JuhyungRepository,
    JuhyungPublicAdapter,
    JuhyungTaskService,
    WorkspaceMemberAccessService,
  ],
})
export class JuhyungModule {}
