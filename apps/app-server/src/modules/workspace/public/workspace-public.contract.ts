import {
  WorkspaceMemberSummary,
  WorkspaceSummary,
} from "../../../common/contracts/public-contracts";

export interface WorkspacePublicContract {
  listWorkspaceSummaries(): Promise<WorkspaceSummary[]>;
  listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberSummary[]>;
}
