import type { WorkspaceMemberRecord, WorkspaceRecord } from "./workspace.types";

export const LOCAL_MVP_USER_ID = "11111111-1111-4111-8111-111111111111";
export const LOCAL_MVP_MEMBER_ID = "33333333-3333-4333-8333-333333333331";
export const LOCAL_MVP_WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

const LOCAL_MVP_CREATED_AT = "2026-06-28T00:00:00.000Z";

export function shouldExposeLocalMvpWorkspace() {
  return process.env.PILO_SKIP_DATABASE_CONNECT === "true";
}

export function createLocalMvpWorkspaceRecord(): WorkspaceRecord {
  return {
    id: LOCAL_MVP_WORKSPACE_ID,
    name: "PILO MVP",
    description: "Runtime workspace",
    type: "side_project",
    status: "active",
    createdByUserId: LOCAL_MVP_USER_ID,
    createdAt: LOCAL_MVP_CREATED_AT,
    updatedAt: LOCAL_MVP_CREATED_AT,
    deletedAt: null,
  };
}

export function createLocalMvpMemberRecord(): WorkspaceMemberRecord {
  return {
    id: LOCAL_MVP_MEMBER_ID,
    workspaceId: LOCAL_MVP_WORKSPACE_ID,
    userId: LOCAL_MVP_USER_ID,
    name: "PILO MVP User",
    email: "local.mvp@pilo.dev",
    avatarUrl: null,
    role: "owner",
    displayName: "Local MVP Owner",
    joinedAt: LOCAL_MVP_CREATED_AT,
    createdAt: LOCAL_MVP_CREATED_AT,
    updatedAt: LOCAL_MVP_CREATED_AT,
  };
}
