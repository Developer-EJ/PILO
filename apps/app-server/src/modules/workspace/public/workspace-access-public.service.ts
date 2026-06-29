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
  displayName?: string | null;
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

  async listWorkspaceMembersByIds(
    workspaceId: string,
    memberIds: string[],
  ): Promise<WorkspaceMemberAccessResult[]> {
    const members = await this.workspaceMemberAccess.listWorkspaceMembersByIds(
      workspaceId,
      memberIds,
    );

    return members.map((member) => this.toAccessResult(member));
  }

  private toAccessResult(member: WorkspaceMemberAccessResult) {
    return {
      id: member.id,
      workspaceId: member.workspaceId,
      userId: member.userId,
      role: member.role,
      displayName: member.displayName ?? null,
    };
  }
}
