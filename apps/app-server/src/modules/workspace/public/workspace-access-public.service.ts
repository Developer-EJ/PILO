import { Injectable } from "@nestjs/common";
import { WorkspaceMemberAccessService } from "../workspace-member-access.service";

export interface WorkspaceActor {
  userId?: string;
  memberId?: string;
}

export interface WorkspaceMemberAccessResult {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
}

@Injectable()
export class WorkspaceAccessPublicService {
  constructor(
    private readonly workspaceMemberAccess: WorkspaceMemberAccessService,
  ) {}

  async requireWorkspaceMember(
    workspaceId: string,
    actor?: WorkspaceActor,
  ): Promise<WorkspaceMemberAccessResult> {
    const member = await this.workspaceMemberAccess.requireWorkspaceMember(
      workspaceId,
      actor,
    );

    return this.toAccessResult(member);
  }

  async requireWorkspaceMemberById(
    workspaceId: string,
    memberId: string,
  ): Promise<WorkspaceMemberAccessResult> {
    const member = await this.workspaceMemberAccess.requireWorkspaceMember(
      workspaceId,
      { memberId },
    );

    return this.toAccessResult(member);
  }

  private toAccessResult(member: WorkspaceMemberAccessResult) {
    return {
      id: member.id,
      workspaceId: member.workspaceId,
      userId: member.userId,
      role: member.role,
    };
  }
}
