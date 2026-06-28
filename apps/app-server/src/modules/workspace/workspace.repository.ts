import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  CreateWorkspaceInput,
  FindWorkspaceForUserInput,
  WorkspaceMemberRecord,
  WorkspaceRecord,
  WorkspaceRepositoryPort,
  WorkspaceSummary,
  UpdateWorkspaceForUserInput,
} from "./workspace.types";

@Injectable()
export class WorkspaceRepository implements WorkspaceRepositoryPort {
  readonly storageMode = "memory";

  private readonly workspacesById = new Map<string, WorkspaceRecord>();
  private readonly membersById = new Map<string, WorkspaceMemberRecord>();

  async listWorkspaceSummariesForUser(
    userId: string,
  ): Promise<WorkspaceSummary[]> {
    return Array.from(this.membersById.values())
      .filter((member) => member.userId === userId)
      .map((member) => {
        const workspace = this.workspacesById.get(member.workspaceId);

        if (!workspace || workspace.deletedAt) {
          return null;
        }

        return this.toWorkspaceSummary(workspace, member);
      })
      .filter((summary): summary is WorkspaceSummary => summary !== null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findWorkspaceSummaryForUser(
    input: FindWorkspaceForUserInput,
  ): Promise<WorkspaceSummary | null> {
    const workspace = this.findVisibleWorkspace(input.workspaceId);
    const member = this.findMemberRecord(input);

    if (!workspace || !member) {
      return null;
    }

    return this.toWorkspaceSummary(workspace, member);
  }

  async findCurrentMember(
    input: FindWorkspaceForUserInput,
  ): Promise<WorkspaceMemberRecord | null> {
    const workspace = this.findVisibleWorkspace(input.workspaceId);

    if (!workspace) {
      return null;
    }

    return this.findMemberRecord(input);
  }

  async createWorkspace(
    input: CreateWorkspaceInput,
  ): Promise<WorkspaceSummary> {
    const now = new Date().toISOString();
    const workspace: WorkspaceRecord = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      type: input.type,
      status: "active",
      createdByUserId: input.currentUser.id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const ownerMember: WorkspaceMemberRecord = {
      id: randomUUID(),
      workspaceId: workspace.id,
      userId: input.currentUser.id,
      role: "owner",
      displayName: input.currentUser.name ?? null,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    this.workspacesById.set(workspace.id, workspace);
    this.membersById.set(ownerMember.id, ownerMember);

    return this.toWorkspaceSummary(workspace, ownerMember);
  }

  async updateWorkspaceForUser(
    input: UpdateWorkspaceForUserInput,
  ): Promise<WorkspaceSummary | null> {
    const workspace = this.findVisibleWorkspace(input.workspaceId);
    const member = this.findMemberRecord(input);

    if (!workspace || !member) {
      return null;
    }

    const updatedWorkspace: WorkspaceRecord = {
      ...workspace,
      ...input.patch,
      updatedAt: new Date().toISOString(),
    };

    this.workspacesById.set(updatedWorkspace.id, updatedWorkspace);

    return this.toWorkspaceSummary(updatedWorkspace, member);
  }

  async softDeleteWorkspaceForUser(
    input: FindWorkspaceForUserInput,
  ): Promise<boolean> {
    const workspace = this.findVisibleWorkspace(input.workspaceId);
    const member = this.findMemberRecord(input);

    if (!workspace || !member) {
      return false;
    }

    this.workspacesById.set(workspace.id, {
      ...workspace,
      updatedAt: new Date().toISOString(),
      deletedAt: new Date().toISOString(),
    });

    return true;
  }

  private findVisibleWorkspace(workspaceId: string) {
    const workspace = this.workspacesById.get(workspaceId);

    if (!workspace || workspace.deletedAt) {
      return null;
    }

    return workspace;
  }

  private findMemberRecord(input: FindWorkspaceForUserInput) {
    return (
      Array.from(this.membersById.values()).find(
        (member) =>
          member.workspaceId === input.workspaceId &&
          member.userId === input.userId,
      ) ?? null
    );
  }

  private countMembers(workspaceId: string) {
    return Array.from(this.membersById.values()).filter(
      (member) => member.workspaceId === workspaceId,
    ).length;
  }

  private toWorkspaceSummary(
    workspace: WorkspaceRecord,
    member: WorkspaceMemberRecord,
  ): WorkspaceSummary {
    return {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description,
      type: workspace.type,
      status: workspace.status,
      myRole: member.role,
      memberCount: this.countMembers(workspace.id),
      createdAt: workspace.createdAt,
    };
  }
}
