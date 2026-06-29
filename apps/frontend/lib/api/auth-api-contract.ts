import type {
  CurrentUser,
  WorkspacePermissionDecision,
  WorkspacePermissionResolveRequest,
} from "../types/public-contracts";

export interface AuthApiContract {
  getCurrentUser(): Promise<CurrentUser>;
  resolveWorkspacePermission(
    workspaceId: string,
    request: WorkspacePermissionResolveRequest,
  ): Promise<WorkspacePermissionDecision>;
}
