import type { WorkspaceMemberRole } from "./workspace.types";

export const WORKSPACE_ROLE_RANK: Record<WorkspaceMemberRole, number> = {
  viewer: 10,
  member: 20,
  owner: 30,
};

export type WorkspaceMemberPermissions = {
  canRead: boolean;
  canWrite: boolean;
  canManage: boolean;
};

export function hasWorkspaceRole(
  role: WorkspaceMemberRole,
  minimumRole: WorkspaceMemberRole,
) {
  return WORKSPACE_ROLE_RANK[role] >= WORKSPACE_ROLE_RANK[minimumRole];
}

export function createWorkspaceMemberPermissions(
  role: WorkspaceMemberRole,
): WorkspaceMemberPermissions {
  return {
    canRead: hasWorkspaceRole(role, "viewer"),
    canWrite: hasWorkspaceRole(role, "member"),
    canManage: hasWorkspaceRole(role, "owner"),
  };
}
