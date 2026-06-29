import { Injectable } from "@nestjs/common";
import { WorkspaceMemberRef } from "../types/meeting.types";
import { CurrentMemberAdapter } from "./current-member.adapter";

const MOCK_CURRENT_MEMBER_ID = "00000000-0000-4000-8000-000000000001";

@Injectable()
export class MockCurrentMemberAdapter implements CurrentMemberAdapter {
  private readonly members = new Map<string, WorkspaceMemberRef>();

  getCurrentMember(workspaceId: string): WorkspaceMemberRef {
    const currentMember = {
      id: MOCK_CURRENT_MEMBER_ID,
      workspaceId,
      displayName: "Mock Current Member",
    };

    this.registerWorkspaceMember(currentMember);

    return currentMember;
  }

  getWorkspaceMember(
    workspaceId: string,
    memberId: string,
  ): WorkspaceMemberRef | null {
    const member = this.members.get(memberId);

    if (member && member.workspaceId !== workspaceId) {
      return null;
    }

    return member ?? { id: memberId, workspaceId };
  }

  registerWorkspaceMember(member: WorkspaceMemberRef): void {
    this.members.set(member.id, member);
  }
}
