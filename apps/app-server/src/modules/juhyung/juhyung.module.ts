import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { WorkspaceMemberAccessService } from "../workspace/workspace-member-access.service";
import { JuhyungRepository } from "./juhyung.repository";

@Module({
  imports: [DatabaseModule],
  providers: [JuhyungRepository, WorkspaceMemberAccessService],
  exports: [JuhyungRepository, WorkspaceMemberAccessService],
})
export class JuhyungModule {}
