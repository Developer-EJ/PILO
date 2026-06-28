import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { WorkspaceMemberAccessService } from "./workspace-member-access.service";

@Module({
  imports: [DatabaseModule],
  providers: [WorkspaceMemberAccessService],
  exports: [WorkspaceMemberAccessService],
})
export class WorkspaceModule {}
