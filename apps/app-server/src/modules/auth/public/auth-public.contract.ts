import {
  CurrentUser,
  WorkspacePermissionDecision,
  WorkspacePermissionResolveRequest,
} from "../../../common/contracts/public-contracts";

export interface AuthPublicContract {
  getCurrentUser(): Promise<CurrentUser>;
  resolveWorkspacePermission(
    workspaceId: string,
    actorMemberId: string,
    request: WorkspacePermissionResolveRequest,
  ): Promise<WorkspacePermissionDecision>;
}
