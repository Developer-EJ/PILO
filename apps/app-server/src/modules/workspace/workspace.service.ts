import { Injectable } from "@nestjs/common";
import { WorkspaceRepository } from "./workspace.repository";
import type {
  CurrentWorkspaceMember,
  WorkspaceAuthUserRef,
  WorkspaceMemberRecord,
} from "./workspace.types";

export type ResolveCurrentMemberInput = {
  workspaceId: string;
  currentUser: WorkspaceAuthUserRef;
};

export class WorkspaceAccessError extends Error {
  readonly code = "workspace_member_not_found";

  constructor(readonly workspaceId: string) {
    super(`Current user is not a member of workspace ${workspaceId}`);
    this.name = "WorkspaceAccessError";
  }
}

@Injectable()
export class WorkspaceService {
  constructor(private readonly workspaceRepository: WorkspaceRepository) {}

  getRepositoryStatus() {
    return {
      storageMode: this.workspaceRepository.storageMode,
    };
  }

  async resolveCurrentMember(
    input: ResolveCurrentMemberInput,
  ): Promise<CurrentWorkspaceMember | null> {
    const member = await this.workspaceRepository.findCurrentMember({
      workspaceId: input.workspaceId,
      userId: input.currentUser.id,
    });

    return member ? toCurrentWorkspaceMember(member) : null;
  }

  async requireCurrentMember(input: ResolveCurrentMemberInput) {
    const currentMember = await this.resolveCurrentMember(input);

    if (!currentMember) {
      throw new WorkspaceAccessError(input.workspaceId);
    }

    return currentMember;
  }
}

function toCurrentWorkspaceMember(
  member: WorkspaceMemberRecord,
): CurrentWorkspaceMember {
  return {
    workspaceId: member.workspaceId,
    memberId: member.id,
    userId: member.userId,
    role: member.role,
    displayName: member.displayName,
  };
}
