import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { WorkspaceAccessPublicService } from "./public/workspace-access-public.service";
import { WorkspaceCurrentMemberAdapter } from "./workspace-current-member.adapter";
import { WorkspaceController } from "./workspace.controller";
import { WorkspaceInviteController } from "./workspace-invite.controller";
import { WorkspaceMemberAccessService } from "./workspace-member-access.service";
import { WorkspaceMemberGuard } from "./workspace-member.guard";
import { WorkspaceRepository } from "./workspace.repository";
import { WorkspaceService } from "./workspace.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [WorkspaceController, WorkspaceInviteController],
  providers: [
    WorkspaceMemberAccessService,
    WorkspaceAccessPublicService,
    WorkspaceRepository,
    WorkspaceService,
    WorkspaceCurrentMemberAdapter,
    WorkspaceMemberGuard,
  ],
  exports: [
    WorkspaceAccessPublicService,
    WorkspaceService,
    WorkspaceCurrentMemberAdapter,
    WorkspaceMemberGuard,
  ],
})
export class WorkspaceModule {}
