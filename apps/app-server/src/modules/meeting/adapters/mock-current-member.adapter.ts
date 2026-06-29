import { Injectable } from "@nestjs/common";
import { WorkspaceMemberRef } from "../types/meeting.types";
import { CurrentMemberAdapter } from "./current-member.adapter";

const MOCK_CURRENT_MEMBER_ID = "00000000-0000-4000-8000-000000000001";

@Injectable()
export class MockCurrentMemberAdapter implements CurrentMemberAdapter {
  getCurrentMember(workspaceId: string): WorkspaceMemberRef {
    return {
      id: MOCK_CURRENT_MEMBER_ID,
      workspaceId,
      displayName: "Mock Current Member",
    };
  }
}
