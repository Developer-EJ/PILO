import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { WorkspaceAccessPublicService } from "./public/workspace-access-public.service";
import { WorkspaceController } from "./workspace.controller";
import { WorkspaceMemberAccessService } from "./workspace-member-access.service";
import { WorkspaceRepository } from "./workspace.repository";
import { WorkspaceService } from "./workspace.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [WorkspaceController],
  providers: [
    WorkspaceMemberAccessService,
    WorkspaceAccessPublicService,
    WorkspaceRepository,
    WorkspaceService,
  ],
  exports: [WorkspaceAccessPublicService, WorkspaceService],
})
export class WorkspaceModule {}
