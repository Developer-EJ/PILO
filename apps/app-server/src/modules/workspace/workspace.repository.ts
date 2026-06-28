import { Injectable } from "@nestjs/common";
import type {
  FindWorkspaceForUserInput,
  WorkspaceMemberRecord,
  WorkspaceRepositoryPort,
  WorkspaceSummary,
} from "./workspace.types";

@Injectable()
export class WorkspaceRepository implements WorkspaceRepositoryPort {
  readonly storageMode = "not-connected";

  async listWorkspaceSummariesForUser(
    userId: string,
  ): Promise<WorkspaceSummary[]> {
    void userId;

    return [];
  }

  async findWorkspaceSummaryForUser(
    input: FindWorkspaceForUserInput,
  ): Promise<WorkspaceSummary | null> {
    void input;

    return null;
  }

  async findCurrentMember(
    input: FindWorkspaceForUserInput,
  ): Promise<WorkspaceMemberRecord | null> {
    void input;

    return null;
  }
}
