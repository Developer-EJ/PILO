import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { JuhyungTaskService } from "./juhyung-task.service";
import { JuhyungRepository } from "./juhyung.repository";

@Module({
  imports: [DatabaseModule, WorkspaceModule],
  providers: [JuhyungRepository, JuhyungTaskService],
  exports: [JuhyungRepository, JuhyungTaskService],
})
export class JuhyungModule {}
