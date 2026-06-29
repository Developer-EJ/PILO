export interface CurrentMemberContext {
  userId: string;
  memberId: string;
  workspaceId: string;
  role: "owner" | "member" | "viewer";
}
