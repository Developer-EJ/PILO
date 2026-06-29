import { WorkspaceMemberRef } from "../types/meeting.types";

export const CURRENT_MEMBER_ADAPTER = Symbol("CURRENT_MEMBER_ADAPTER");

export interface CurrentMemberAdapter {
  getCurrentMember(workspaceId: string): WorkspaceMemberRef;
}
