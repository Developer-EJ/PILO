import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  AcceptWorkspaceInviteInput,
  AcceptWorkspaceInviteResult,
  CreateWorkspaceInviteInput,
  CreateWorkspaceInput,
  DashboardPreferences,
  DashboardPreferencesRecord,
  FindWorkspaceForUserInput,
  RevokeWorkspaceInviteForUserInput,
  RevokeWorkspaceInviteResult,
  UpsertDashboardPreferencesForUserInput,
  WorkspaceInviteRecord,
  WorkspaceMemberRecord,
  WorkspaceMemberSummary,
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
  private readonly invitesById = new Map<string, WorkspaceInviteRecord>();
  private readonly dashboardPreferencesByKey = new Map<
    string,
    DashboardPreferencesRecord
  >();

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

  async listWorkspaceMemberSummariesForUser(
    input: FindWorkspaceForUserInput,
  ): Promise<WorkspaceMemberSummary[] | null> {
    const workspace = this.findVisibleWorkspace(input.workspaceId);
    const currentMember = this.findMemberRecord(input);

    if (!workspace || !currentMember) {
      return null;
    }

    return Array.from(this.membersById.values())
      .filter((member) => member.workspaceId === input.workspaceId)
      .map((member) => this.toWorkspaceMemberSummary(member))
      .sort((left, right) => left.joinedAt.localeCompare(right.joinedAt));
  }

  async createWorkspaceInvite(
    input: CreateWorkspaceInviteInput,
  ): Promise<WorkspaceInviteRecord> {
    const now = new Date().toISOString();
    const invite: WorkspaceInviteRecord = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      email: input.email,
      role: input.role,
      tokenHash: input.tokenHash,
      invitedByMemberId: input.invitedByMemberId,
      acceptedByMemberId: null,
      expiresAt: input.expiresAt,
      acceptedAt: null,
      revokedAt: null,
      createdAt: now,
    };

    const activeInvite = this.findActiveInviteByEmail({
      workspaceId: input.workspaceId,
      email: input.email,
      now: new Date(now),
    });

    if (activeInvite) {
      return activeInvite;
    }

    this.invitesById.set(invite.id, invite);

    return invite;
  }

  async acceptWorkspaceInvite(
    input: AcceptWorkspaceInviteInput,
  ): Promise<AcceptWorkspaceInviteResult> {
    const invite = this.invitesById.get(input.inviteId);

    if (!invite || !this.findVisibleWorkspace(invite.workspaceId)) {
      return { ok: false, reason: "not_found" };
    }

    const inactiveReason = getInactiveInviteReason(invite, input.now);

    if (inactiveReason) {
      return { ok: false, reason: inactiveReason };
    }

    if (invite.tokenHash !== input.tokenHash) {
      return { ok: false, reason: "token_mismatch" };
    }

    if (normalizeEmail(input.currentUser.email) !== invite.email) {
      return { ok: false, reason: "email_mismatch" };
    }

    if (
      this.findMemberRecord({
        workspaceId: invite.workspaceId,
        userId: input.currentUser.id,
      })
    ) {
      return { ok: false, reason: "already_member" };
    }

    const nowIso = input.now.toISOString();
    const member: WorkspaceMemberRecord = {
      id: randomUUID(),
      workspaceId: invite.workspaceId,
      userId: input.currentUser.id,
      name: input.currentUser.name ?? "Workspace member",
      email: invite.email,
      avatarUrl: input.currentUser.avatarUrl ?? null,
      role: invite.role,
      displayName: input.currentUser.name ?? null,
      joinedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const acceptedInvite: WorkspaceInviteRecord = {
      ...invite,
      acceptedByMemberId: member.id,
      acceptedAt: nowIso,
    };

    this.membersById.set(member.id, member);
    this.invitesById.set(acceptedInvite.id, acceptedInvite);

    return {
      ok: true,
      workspaceId: member.workspaceId,
      member: this.toWorkspaceMemberSummary(member),
    };
  }

  async revokeWorkspaceInviteForUser(
    input: RevokeWorkspaceInviteForUserInput,
  ): Promise<RevokeWorkspaceInviteResult> {
    const invite = this.invitesById.get(input.inviteId);
    const member = this.findMemberRecord(input);

    if (!invite || invite.workspaceId !== input.workspaceId || !member) {
      return { ok: false, reason: "not_found" };
    }

    const inactiveReason = getInactiveInviteReason(invite, input.now);

    if (inactiveReason) {
      return { ok: false, reason: inactiveReason };
    }

    const revokedInvite: WorkspaceInviteRecord = {
      ...invite,
      revokedAt: input.now.toISOString(),
    };

    this.invitesById.set(revokedInvite.id, revokedInvite);

    return {
      ok: true,
      invite: revokedInvite,
    };
  }

  async getDashboardPreferencesForUser(
    input: FindWorkspaceForUserInput,
  ): Promise<DashboardPreferences | null> {
    const workspace = this.findVisibleWorkspace(input.workspaceId);
    const member = this.findMemberRecord(input);

    if (!workspace || !member) {
      return null;
    }

    const preferences = this.dashboardPreferencesByKey.get(
      createDashboardPreferencesKey(input.workspaceId, member.id),
    );

    if (!preferences) {
      return {
        workspaceId: input.workspaceId,
        memberId: member.id,
        layout: {},
        hiddenSections: [],
        updatedAt: null,
      };
    }

    return this.toDashboardPreferences(preferences);
  }

  async upsertDashboardPreferencesForUser(
    input: UpsertDashboardPreferencesForUserInput,
  ): Promise<DashboardPreferences | null> {
    const workspace = this.findVisibleWorkspace(input.workspaceId);
    const member = this.findMemberRecord(input);

    if (!workspace || !member) {
      return null;
    }

    const now = new Date().toISOString();
    const key = createDashboardPreferencesKey(input.workspaceId, member.id);
    const existing = this.dashboardPreferencesByKey.get(key);
    const preferences: DashboardPreferencesRecord = {
      id: existing?.id ?? randomUUID(),
      workspaceId: input.workspaceId,
      memberId: member.id,
      layout: input.layout,
      hiddenSections: input.hiddenSections,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.dashboardPreferencesByKey.set(key, preferences);

    return this.toDashboardPreferences(preferences);
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
      name: input.currentUser.name ?? "Workspace member",
      email: input.currentUser.email ?? "",
      avatarUrl: input.currentUser.avatarUrl ?? null,
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

  private findActiveInviteByEmail(input: {
    workspaceId: string;
    email: string;
    now: Date;
  }) {
    return (
      Array.from(this.invitesById.values()).find(
        (invite) =>
          invite.workspaceId === input.workspaceId &&
          invite.email === input.email &&
          getInactiveInviteReason(invite, input.now) === null,
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

  private toWorkspaceMemberSummary(
    member: WorkspaceMemberRecord,
  ): WorkspaceMemberSummary {
    return {
      memberId: member.id,
      userId: member.userId,
      name: member.name,
      email: member.email,
      avatarUrl: member.avatarUrl,
      role: member.role,
      displayName: member.displayName,
      joinedAt: member.joinedAt,
    };
  }

  private toDashboardPreferences(
    preferences: DashboardPreferencesRecord,
  ): DashboardPreferences {
    return {
      workspaceId: preferences.workspaceId,
      memberId: preferences.memberId,
      layout: preferences.layout,
      hiddenSections: preferences.hiddenSections,
      updatedAt: preferences.updatedAt,
    };
  }
}

type InactiveWorkspaceInviteReason = "accepted" | "revoked" | "expired";

function getInactiveInviteReason(
  invite: WorkspaceInviteRecord,
  now: Date,
): InactiveWorkspaceInviteReason | null {
  if (invite.acceptedAt) {
    return "accepted";
  }

  if (invite.revokedAt) {
    return "revoked";
  }

  if (new Date(invite.expiresAt).getTime() <= now.getTime()) {
    return "expired";
  }

  return null;
}

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

function createDashboardPreferencesKey(workspaceId: string, memberId: string) {
  return `${workspaceId}:${memberId}`;
}
