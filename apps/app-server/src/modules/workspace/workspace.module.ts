import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { WorkspaceAccessPublicService } from "./public/workspace-access-public.service";
import { WorkspaceMemberAccessService } from "./workspace-member-access.service";

@Module({
  imports: [DatabaseModule],
  providers: [WorkspaceMemberAccessService, WorkspaceAccessPublicService],
  exports: [WorkspaceAccessPublicService],
})
export class WorkspaceModule {}
