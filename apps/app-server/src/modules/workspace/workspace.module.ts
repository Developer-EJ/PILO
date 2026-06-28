import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkspaceCurrentMemberAdapter } from "./workspace-current-member.adapter";
import { WorkspaceController } from "./workspace.controller";
import { WorkspaceMemberGuard } from "./workspace-member.guard";
import { WorkspaceRepository } from "./workspace.repository";
import { WorkspaceService } from "./workspace.service";

@Module({
  imports: [AuthModule],
  controllers: [WorkspaceController],
  providers: [
    WorkspaceRepository,
    WorkspaceService,
    WorkspaceCurrentMemberAdapter,
    WorkspaceMemberGuard,
  ],
  exports: [
    WorkspaceService,
    WorkspaceCurrentMemberAdapter,
    WorkspaceMemberGuard,
  ],
})
export class WorkspaceModule {}
