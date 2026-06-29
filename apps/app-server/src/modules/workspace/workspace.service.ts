import { Injectable } from "@nestjs/common";
import {
  NotImplementedError,
  WorkspaceMemberSummary,
  WorkspaceSummary,
} from "../../common/contracts/public-contracts";
import { WorkspacePublicContract } from "./public/workspace-public.contract";

@Injectable()
export class WorkspaceService implements WorkspacePublicContract {
  listWorkspaceSummaries(): Promise<WorkspaceSummary[]> {
    throw new NotImplementedError(
      "WorkspacePublicContract.listWorkspaceSummaries",
    );
  }

  listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberSummary[]> {
    void workspaceId;
    throw new NotImplementedError(
      "WorkspacePublicContract.listWorkspaceMembers",
    );
  }
}
