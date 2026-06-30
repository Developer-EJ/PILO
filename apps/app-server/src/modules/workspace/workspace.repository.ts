import { Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import {
  createLocalMvpMemberRecord,
  createLocalMvpWorkspaceRecord,
  LOCAL_MVP_MEMBER_ID,
  LOCAL_MVP_WORKSPACE_ID,
  shouldExposeLocalMvpWorkspace,
} from "./local-mvp-workspace";
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
import {
  WORKSPACE_MEMBER_ROLES,
  WORKSPACE_STATUSES,
  WORKSPACE_TYPES,
  type WorkspaceMemberRole,
  type WorkspaceStatus,
  type WorkspaceType,
} from "./workspace.types";

type DatabaseClient = DatabaseService | Prisma.TransactionClient;

type DbWorkspaceSummaryRow = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  myRole: string;
  memberCount: number | bigint;
  createdAt: Date | string;
};

type DbWorkspaceMemberRow = {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  displayName: string | null;
  joinedAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DbWorkspaceInviteRow = {
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  tokenHash: string;
  invitedByMemberId: string;
  acceptedByMemberId: string | null;
  expiresAt: Date | string;
  acceptedAt: Date | string | null;
  revokedAt: Date | string | null;
  createdAt: Date | string;
};

type DbDashboardPreferencesRow = {
  workspaceId: string;
  memberId: string;
  layout: unknown;
  hiddenSections: unknown;
  updatedAt: Date | string;
};

@Injectable()
export class WorkspaceRepository implements WorkspaceRepositoryPort {
  private readonly workspacesById = new Map<string, WorkspaceRecord>();
  private readonly membersById = new Map<string, WorkspaceMemberRecord>();
  private readonly invitesById = new Map<string, WorkspaceInviteRecord>();
  private readonly dashboardPreferencesByKey = new Map<
    string,
    DashboardPreferencesRecord
  >();

  constructor(@Optional() private readonly database?: DatabaseService) {}

  get storageMode() {
    return this.shouldUseDatabase ? "database" : "memory";
  }

  async listWorkspaceSummariesForUser(
    userId: string,
  ): Promise<WorkspaceSummary[]> {
    if (this.shouldUseDatabase) {
      return this.listDbWorkspaceSummariesForUser(userId);
    }

    this.ensureLocalMvpWorkspace();

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
    if (this.shouldUseDatabase) {
      return this.findDbWorkspaceSummaryForUser(input);
    }

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
    if (this.shouldUseDatabase) {
      return this.findDbCurrentMember(input);
    }

    const workspace = this.findVisibleWorkspace(input.workspaceId);

    if (!workspace) {
      return null;
    }

    return this.findMemberRecord(input);
  }

  async listWorkspaceMemberSummariesForUser(
    input: FindWorkspaceForUserInput,
  ): Promise<WorkspaceMemberSummary[] | null> {
    if (this.shouldUseDatabase) {
      return this.listDbWorkspaceMemberSummariesForUser(input);
    }

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
    if (this.shouldUseDatabase) {
      return this.createDbWorkspaceInvite(input);
    }

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
    if (this.shouldUseDatabase) {
      return this.acceptDbWorkspaceInvite(input);
    }

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
    if (this.shouldUseDatabase) {
      return this.revokeDbWorkspaceInviteForUser(input);
    }

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
    if (this.shouldUseDatabase) {
      return this.getDbDashboardPreferencesForUser(input);
    }

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
    if (this.shouldUseDatabase) {
      return this.upsertDbDashboardPreferencesForUser(input);
    }

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
    if (this.shouldUseDatabase) {
      return this.createDbWorkspace(input);
    }

    this.ensureLocalMvpWorkspace();

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
    if (this.shouldUseDatabase) {
      return this.updateDbWorkspaceForUser(input);
    }

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
    if (this.shouldUseDatabase) {
      return this.softDeleteDbWorkspaceForUser(input);
    }

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

  private get shouldUseDatabase() {
    return Boolean(
      this.database && process.env.PILO_SKIP_DATABASE_CONNECT !== "true",
    );
  }

  private get db(): DatabaseService {
    if (!this.database) {
      throw new Error("Workspace database repository is not configured.");
    }

    return this.database;
  }

  private async listDbWorkspaceSummariesForUser(userId: string) {
    const rows = await this.db.$queryRaw<DbWorkspaceSummaryRow[]>`
      SELECT
        w.id::text AS id,
        w.name,
        w.description,
        w.type,
        w.status,
        m.role AS "myRole",
        COUNT(all_members.id)::int AS "memberCount",
        w.created_at AS "createdAt"
      FROM workspace_members m
      JOIN workspaces w ON w.id = m.workspace_id
      LEFT JOIN workspace_members all_members
        ON all_members.workspace_id = w.id
      WHERE m.user_id = ${userId}::uuid
        AND w.deleted_at IS NULL
      GROUP BY w.id, m.role
      ORDER BY w.created_at DESC, w.id ASC
    `;

    return rows.map(toWorkspaceSummaryFromDbRow);
  }

  private async findDbWorkspaceSummaryForUser(
    input: FindWorkspaceForUserInput,
    client: DatabaseClient = this.db,
  ) {
    const rows = await client.$queryRaw<DbWorkspaceSummaryRow[]>`
      SELECT
        w.id::text AS id,
        w.name,
        w.description,
        w.type,
        w.status,
        m.role AS "myRole",
        COUNT(all_members.id)::int AS "memberCount",
        w.created_at AS "createdAt"
      FROM workspace_members m
      JOIN workspaces w ON w.id = m.workspace_id
      LEFT JOIN workspace_members all_members
        ON all_members.workspace_id = w.id
      WHERE w.id = ${input.workspaceId}::uuid
        AND m.user_id = ${input.userId}::uuid
        AND w.deleted_at IS NULL
      GROUP BY w.id, m.role
      LIMIT 1
    `;

    return rows[0] ? toWorkspaceSummaryFromDbRow(rows[0]) : null;
  }

  private async findDbCurrentMember(
    input: FindWorkspaceForUserInput,
    client: DatabaseClient = this.db,
  ) {
    const rows = await client.$queryRaw<DbWorkspaceMemberRow[]>`
      SELECT
        m.id::text AS id,
        m.workspace_id::text AS "workspaceId",
        m.user_id::text AS "userId",
        u.name,
        u.email::text AS email,
        u.avatar_url AS "avatarUrl",
        m.role,
        m.display_name AS "displayName",
        m.joined_at AS "joinedAt",
        m.created_at AS "createdAt",
        m.updated_at AS "updatedAt"
      FROM workspace_members m
      JOIN workspaces w ON w.id = m.workspace_id
      JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = ${input.workspaceId}::uuid
        AND m.user_id = ${input.userId}::uuid
        AND w.deleted_at IS NULL
      LIMIT 1
    `;

    return rows[0] ? toWorkspaceMemberRecordFromDbRow(rows[0]) : null;
  }

  private async listDbWorkspaceMemberSummariesForUser(
    input: FindWorkspaceForUserInput,
  ) {
    const currentMember = await this.findDbCurrentMember(input);

    if (!currentMember) {
      return null;
    }

    const rows = await this.db.$queryRaw<DbWorkspaceMemberRow[]>`
      SELECT
        m.id::text AS id,
        m.workspace_id::text AS "workspaceId",
        m.user_id::text AS "userId",
        u.name,
        u.email::text AS email,
        u.avatar_url AS "avatarUrl",
        m.role,
        m.display_name AS "displayName",
        m.joined_at AS "joinedAt",
        m.created_at AS "createdAt",
        m.updated_at AS "updatedAt"
      FROM workspace_members m
      JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = ${input.workspaceId}::uuid
      ORDER BY m.joined_at ASC, m.id ASC
    `;

    return rows.map((row) =>
      this.toWorkspaceMemberSummary(toWorkspaceMemberRecordFromDbRow(row)),
    );
  }

  private async createDbWorkspaceInvite(input: CreateWorkspaceInviteInput) {
    return this.db.$transaction(async (transaction) => {
      const existing = await this.findPendingDbInviteByEmail(
        {
          workspaceId: input.workspaceId,
          email: input.email,
        },
        transaction,
      );

      if (existing) {
        if (getInactiveInviteReason(existing, new Date()) === null) {
          return existing;
        }

        await transaction.$executeRaw`
          UPDATE workspace_invites
          SET revoked_at = now()
          WHERE id = ${existing.id}::uuid
            AND accepted_at IS NULL
            AND revoked_at IS NULL
        `;
      }

      const rows = await transaction.$queryRaw<DbWorkspaceInviteRow[]>`
        INSERT INTO workspace_invites (
          workspace_id,
          email,
          role,
          token_hash,
          invited_by_member_id,
          expires_at
        )
        VALUES (
          ${input.workspaceId}::uuid,
          ${input.email},
          ${input.role},
          ${input.tokenHash},
          ${input.invitedByMemberId}::uuid,
          ${input.expiresAt}::timestamptz
        )
        RETURNING
          id::text AS id,
          workspace_id::text AS "workspaceId",
          email::text AS email,
          role,
          token_hash AS "tokenHash",
          invited_by_member_id::text AS "invitedByMemberId",
          accepted_by_member_id::text AS "acceptedByMemberId",
          expires_at AS "expiresAt",
          accepted_at AS "acceptedAt",
          revoked_at AS "revokedAt",
          created_at AS "createdAt"
      `;

      return toWorkspaceInviteRecordFromDbRow(rows[0]);
    });
  }

  private async acceptDbWorkspaceInvite(
    input: AcceptWorkspaceInviteInput,
  ): Promise<AcceptWorkspaceInviteResult> {
    const invite = await this.findDbInviteById(input.inviteId);

    if (!invite) {
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
      await this.findDbCurrentMember({
        workspaceId: invite.workspaceId,
        userId: input.currentUser.id,
      })
    ) {
      return { ok: false, reason: "already_member" };
    }

    return this.db.$transaction(async (transaction) => {
      await this.upsertDbUser(input.currentUser, transaction);

      const memberRows = await transaction.$queryRaw<DbWorkspaceMemberRow[]>`
        INSERT INTO workspace_members (
          workspace_id,
          user_id,
          role,
          display_name
        )
        VALUES (
          ${invite.workspaceId}::uuid,
          ${input.currentUser.id}::uuid,
          ${invite.role},
          ${input.currentUser.name ?? null}
        )
        RETURNING
          id::text AS id,
          workspace_id::text AS "workspaceId",
          user_id::text AS "userId",
          ${input.currentUser.name ?? "Workspace member"}::text AS name,
          ${normalizeEmail(input.currentUser.email)}::text AS email,
          ${input.currentUser.avatarUrl ?? null}::text AS "avatarUrl",
          role,
          display_name AS "displayName",
          joined_at AS "joinedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `;
      const member = toWorkspaceMemberRecordFromDbRow(memberRows[0]);

      await transaction.$executeRaw`
        UPDATE workspace_invites
        SET accepted_by_member_id = ${member.id}::uuid,
            accepted_at = ${input.now.toISOString()}::timestamptz
        WHERE id = ${invite.id}::uuid
      `;

      return {
        ok: true,
        workspaceId: member.workspaceId,
        member: this.toWorkspaceMemberSummary(member),
      };
    });
  }

  private async revokeDbWorkspaceInviteForUser(
    input: RevokeWorkspaceInviteForUserInput,
  ): Promise<RevokeWorkspaceInviteResult> {
    const [invite, member] = await Promise.all([
      this.findDbInviteById(input.inviteId),
      this.findDbCurrentMember(input),
    ]);

    if (!invite || invite.workspaceId !== input.workspaceId || !member) {
      return { ok: false, reason: "not_found" };
    }

    const inactiveReason = getInactiveInviteReason(invite, input.now);

    if (inactiveReason) {
      return { ok: false, reason: inactiveReason };
    }

    const rows = await this.db.$queryRaw<DbWorkspaceInviteRow[]>`
      UPDATE workspace_invites
      SET revoked_at = ${input.now.toISOString()}::timestamptz
      WHERE id = ${input.inviteId}::uuid
      RETURNING
        id::text AS id,
        workspace_id::text AS "workspaceId",
        email::text AS email,
        role,
        token_hash AS "tokenHash",
        invited_by_member_id::text AS "invitedByMemberId",
        accepted_by_member_id::text AS "acceptedByMemberId",
        expires_at AS "expiresAt",
        accepted_at AS "acceptedAt",
        revoked_at AS "revokedAt",
        created_at AS "createdAt"
    `;

    return {
      ok: true,
      invite: toWorkspaceInviteRecordFromDbRow(rows[0]),
    };
  }

  private async getDbDashboardPreferencesForUser(
    input: FindWorkspaceForUserInput,
  ): Promise<DashboardPreferences | null> {
    const member = await this.findDbCurrentMember(input);

    if (!member) {
      return null;
    }

    const rows = await this.db.$queryRaw<DbDashboardPreferencesRow[]>`
      SELECT
        workspace_id::text AS "workspaceId",
        member_id::text AS "memberId",
        layout,
        hidden_sections AS "hiddenSections",
        updated_at AS "updatedAt"
      FROM dashboard_preferences
      WHERE workspace_id = ${input.workspaceId}::uuid
        AND member_id = ${member.id}::uuid
      LIMIT 1
    `;

    if (!rows[0]) {
      return {
        workspaceId: input.workspaceId,
        memberId: member.id,
        layout: {},
        hiddenSections: [],
        updatedAt: null,
      };
    }

    return toDashboardPreferencesFromDbRow(rows[0]);
  }

  private async upsertDbDashboardPreferencesForUser(
    input: UpsertDashboardPreferencesForUserInput,
  ): Promise<DashboardPreferences | null> {
    const member = await this.findDbCurrentMember(input);

    if (!member) {
      return null;
    }

    const layout = JSON.stringify(input.layout);
    const hiddenSections = JSON.stringify(input.hiddenSections);
    const rows = await this.db.$queryRaw<DbDashboardPreferencesRow[]>`
      INSERT INTO dashboard_preferences (
        workspace_id,
        member_id,
        layout,
        hidden_sections
      )
      VALUES (
        ${input.workspaceId}::uuid,
        ${member.id}::uuid,
        ${layout}::jsonb,
        ${hiddenSections}::jsonb
      )
      ON CONFLICT (workspace_id, member_id) DO UPDATE SET
        layout = EXCLUDED.layout,
        hidden_sections = EXCLUDED.hidden_sections,
        updated_at = now()
      RETURNING
        workspace_id::text AS "workspaceId",
        member_id::text AS "memberId",
        layout,
        hidden_sections AS "hiddenSections",
        updated_at AS "updatedAt"
    `;

    return toDashboardPreferencesFromDbRow(rows[0]);
  }

  private async createDbWorkspace(input: CreateWorkspaceInput) {
    return this.db.$transaction(async (transaction) => {
      await this.upsertDbUser(input.currentUser, transaction);

      const workspaceRows = await transaction.$queryRaw<Array<{ id: string }>>`
        INSERT INTO workspaces (
          name,
          description,
          type,
          status,
          created_by_user_id
        )
        VALUES (
          ${input.name},
          ${input.description},
          ${input.type},
          'active',
          ${input.currentUser.id}::uuid
        )
        RETURNING id::text AS id
      `;
      const workspaceId = workspaceRows[0].id;

      await transaction.$executeRaw`
        INSERT INTO workspace_members (
          workspace_id,
          user_id,
          role,
          display_name
        )
        VALUES (
          ${workspaceId}::uuid,
          ${input.currentUser.id}::uuid,
          'owner',
          ${input.currentUser.name ?? null}
        )
      `;

      const summary = await this.findDbWorkspaceSummaryForUser(
        {
          workspaceId,
          userId: input.currentUser.id,
        },
        transaction,
      );

      if (!summary) {
        throw new Error("Created workspace could not be read.");
      }

      return summary;
    });
  }

  private async updateDbWorkspaceForUser(
    input: UpdateWorkspaceForUserInput,
  ): Promise<WorkspaceSummary | null> {
    const existing = await this.findDbWorkspaceSummaryForUser(input);

    if (!existing) {
      return null;
    }

    await this.db.$executeRaw`
      UPDATE workspaces
      SET
        name = ${input.patch.name ?? existing.name},
        description = ${
          Object.prototype.hasOwnProperty.call(input.patch, "description")
            ? input.patch.description
            : existing.description
        },
        type = ${input.patch.type ?? existing.type},
        status = ${input.patch.status ?? existing.status},
        updated_at = now()
      WHERE id = ${input.workspaceId}::uuid
    `;

    return this.findDbWorkspaceSummaryForUser(input);
  }

  private async softDeleteDbWorkspaceForUser(input: FindWorkspaceForUserInput) {
    const rows = await this.db.$queryRaw<Array<{ id: string }>>`
      UPDATE workspaces w
      SET
        deleted_at = now(),
        updated_at = now()
      WHERE w.id = ${input.workspaceId}::uuid
        AND w.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_members m
          WHERE m.workspace_id = w.id
            AND m.user_id = ${input.userId}::uuid
        )
      RETURNING w.id::text AS id
    `;

    return rows.length > 0;
  }

  private async upsertDbUser(
    currentUser: {
      id: string;
      name?: string | null;
      email?: string | null;
      avatarUrl?: string | null;
    },
    client: DatabaseClient,
  ) {
    const email =
      normalizeEmail(currentUser.email) || `${currentUser.id}@local.pilo.dev`;
    const name = currentUser.name?.trim() || "Workspace member";

    await client.$executeRaw`
      INSERT INTO users (
        id,
        email,
        name,
        avatar_url
      )
      VALUES (
        ${currentUser.id}::uuid,
        ${email},
        ${name},
        ${currentUser.avatarUrl ?? null}
      )
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = now()
    `;
  }

  private async findPendingDbInviteByEmail(
    input: { workspaceId: string; email: string },
    client: DatabaseClient = this.db,
  ) {
    const rows = await client.$queryRaw<DbWorkspaceInviteRow[]>`
      SELECT
        id::text AS id,
        workspace_id::text AS "workspaceId",
        email::text AS email,
        role,
        token_hash AS "tokenHash",
        invited_by_member_id::text AS "invitedByMemberId",
        accepted_by_member_id::text AS "acceptedByMemberId",
        expires_at AS "expiresAt",
        accepted_at AS "acceptedAt",
        revoked_at AS "revokedAt",
        created_at AS "createdAt"
      FROM workspace_invites
      WHERE workspace_id = ${input.workspaceId}::uuid
        AND email = ${input.email}
        AND accepted_at IS NULL
        AND revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;

    return rows[0] ? toWorkspaceInviteRecordFromDbRow(rows[0]) : null;
  }

  private async findDbInviteById(
    inviteId: string,
    client: DatabaseClient = this.db,
  ) {
    const rows = await client.$queryRaw<DbWorkspaceInviteRow[]>`
      SELECT
        invites.id::text AS id,
        invites.workspace_id::text AS "workspaceId",
        invites.email::text AS email,
        invites.role,
        invites.token_hash AS "tokenHash",
        invites.invited_by_member_id::text AS "invitedByMemberId",
        invites.accepted_by_member_id::text AS "acceptedByMemberId",
        invites.expires_at AS "expiresAt",
        invites.accepted_at AS "acceptedAt",
        invites.revoked_at AS "revokedAt",
        invites.created_at AS "createdAt"
      FROM workspace_invites invites
      JOIN workspaces w ON w.id = invites.workspace_id
      WHERE invites.id = ${inviteId}::uuid
        AND w.deleted_at IS NULL
      LIMIT 1
    `;

    return rows[0] ? toWorkspaceInviteRecordFromDbRow(rows[0]) : null;
  }

  private findVisibleWorkspace(workspaceId: string) {
    this.ensureLocalMvpWorkspace();

    const workspace = this.workspacesById.get(workspaceId);

    if (!workspace || workspace.deletedAt) {
      return null;
    }

    return workspace;
  }

  private findMemberRecord(input: FindWorkspaceForUserInput) {
    this.ensureLocalMvpWorkspace();

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
    this.ensureLocalMvpWorkspace();

    return Array.from(this.membersById.values()).filter(
      (member) => member.workspaceId === workspaceId,
    ).length;
  }

  private ensureLocalMvpWorkspace() {
    if (!shouldExposeLocalMvpWorkspace()) {
      return;
    }

    if (!this.workspacesById.has(LOCAL_MVP_WORKSPACE_ID)) {
      this.workspacesById.set(
        LOCAL_MVP_WORKSPACE_ID,
        createLocalMvpWorkspaceRecord(),
      );
    }

    if (!this.membersById.has(LOCAL_MVP_MEMBER_ID)) {
      this.membersById.set(LOCAL_MVP_MEMBER_ID, createLocalMvpMemberRecord());
    }
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

function toWorkspaceSummaryFromDbRow(
  row: DbWorkspaceSummaryRow,
): WorkspaceSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: toWorkspaceType(row.type),
    status: toWorkspaceStatus(row.status),
    myRole: toWorkspaceMemberRole(row.myRole),
    memberCount: Number(row.memberCount),
    createdAt: toIsoString(row.createdAt),
  };
}

function toWorkspaceMemberRecordFromDbRow(
  row: DbWorkspaceMemberRow,
): WorkspaceMemberRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    role: toWorkspaceMemberRole(row.role),
    displayName: row.displayName,
    joinedAt: toIsoString(row.joinedAt),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toWorkspaceInviteRecordFromDbRow(
  row: DbWorkspaceInviteRow,
): WorkspaceInviteRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    email: normalizeEmail(row.email),
    role: toWorkspaceInviteRole(row.role),
    tokenHash: row.tokenHash,
    invitedByMemberId: row.invitedByMemberId,
    acceptedByMemberId: row.acceptedByMemberId,
    expiresAt: toIsoString(row.expiresAt),
    acceptedAt: row.acceptedAt ? toIsoString(row.acceptedAt) : null,
    revokedAt: row.revokedAt ? toIsoString(row.revokedAt) : null,
    createdAt: toIsoString(row.createdAt),
  };
}

function toDashboardPreferencesFromDbRow(
  row: DbDashboardPreferencesRow,
): DashboardPreferences {
  return {
    workspaceId: row.workspaceId,
    memberId: row.memberId,
    layout: toJsonObject(row.layout),
    hiddenSections: toStringArray(row.hiddenSections),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toWorkspaceType(value: string): WorkspaceType {
  return WORKSPACE_TYPES.includes(value as WorkspaceType)
    ? (value as WorkspaceType)
    : "other";
}

function toWorkspaceStatus(value: string): WorkspaceStatus {
  return WORKSPACE_STATUSES.includes(value as WorkspaceStatus)
    ? (value as WorkspaceStatus)
    : "active";
}

function toWorkspaceMemberRole(value: string): WorkspaceMemberRole {
  return WORKSPACE_MEMBER_ROLES.includes(value as WorkspaceMemberRole)
    ? (value as WorkspaceMemberRole)
    : "member";
}

function toWorkspaceInviteRole(value: string) {
  return value === "viewer" ? "viewer" : "member";
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
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
