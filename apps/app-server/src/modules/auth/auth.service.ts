import { Injectable } from "@nestjs/common";
import {
  CurrentUser,
  NotImplementedError,
  WorkspacePermissionDecision,
  WorkspacePermissionResolveRequest,
} from "../../common/contracts/public-contracts";
import { AuthPublicContract } from "./public/auth-public.contract";

@Injectable()
export class AuthService implements AuthPublicContract {
  getCurrentUser(): Promise<CurrentUser> {
    throw new NotImplementedError("AuthPublicContract.getCurrentUser");
  }

  resolveWorkspacePermission(
    workspaceId: string,
    actorMemberId: string,
    request: WorkspacePermissionResolveRequest,
  ): Promise<WorkspacePermissionDecision> {
    void workspaceId;
    void actorMemberId;
    void request;
    throw new NotImplementedError(
      "AuthPublicContract.resolveWorkspacePermission",
    );
  }
}
