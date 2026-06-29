import type {
  WorkspaceMemberSummary,
  WorkspaceSummary,
} from "../types/public-contracts";

export interface WorkspaceApiContract {
  listWorkspaceSummaries(): Promise<WorkspaceSummary[]>;
  listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberSummary[]>;
}
