export const WORKSPACE_TYPES = [
  "side_project",
  "bootcamp",
  "university",
  "hackathon",
  "other",
] as const;

export const WORKSPACE_STATUSES = ["active", "archived"] as const;

export const WORKSPACE_MEMBER_ROLES = ["owner", "member", "viewer"] as const;

export const WORKSPACE_INVITE_ROLES = ["member", "viewer"] as const;

export type WorkspaceType = (typeof WORKSPACE_TYPES)[number];

export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

export type WorkspaceMemberRole = (typeof WORKSPACE_MEMBER_ROLES)[number];

export type WorkspaceInviteRole = (typeof WORKSPACE_INVITE_ROLES)[number];

export type WorkspaceAuthUserRef = {
  id: string;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

export type WorkspaceRecord = {
  id: string;
  name: string;
  description: string | null;
  type: WorkspaceType;
  status: WorkspaceStatus;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type WorkspaceMemberRecord = {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: WorkspaceMemberRole;
  displayName: string | null;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceInviteRecord = {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceInviteRole;
  tokenHash: string;
  invitedByMemberId: string;
  acceptedByMemberId: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type DashboardPreferencesLayout = Record<string, unknown>;

export type DashboardPreferencesRecord = {
  id: string;
  workspaceId: string;
  memberId: string;
  layout: DashboardPreferencesLayout;
  hiddenSections: string[];
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  description: string | null;
  type: WorkspaceType;
  status: WorkspaceStatus;
  myRole: WorkspaceMemberRole;
  memberCount: number;
  createdAt: string;
};

export type WorkspaceMemberSummary = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: WorkspaceMemberRole;
  displayName: string | null;
  joinedAt: string;
};

export type WorkspaceInviteCreated = {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceInviteRole;
  token: string;
  expiresAt: string;
  createdAt: string;
};

export type DashboardPreferences = {
  workspaceId: string;
  memberId: string;
  layout: DashboardPreferencesLayout;
  hiddenSections: string[];
  updatedAt: string | null;
};

export type WorkspaceDashboardReadModel = {
  workspace: WorkspaceSummary;
  currentMember: CurrentWorkspaceMember;
  preferences: DashboardPreferences;
  members: WorkspaceMemberSummary[];
  tasks: unknown[];
  progress: Record<string, unknown> | null;
  githubIssues: unknown[];
  pullRequests: unknown[];
  meetingReports: unknown[];
  prAnalyses: unknown[];
  agentActions: unknown[];
  canvasEntities: unknown[];
  source: "fixture" | "empty" | "mixed";
  generatedAt: string;
};

export type CurrentWorkspaceMember = {
  workspaceId: string;
  memberId: string;
  userId: string;
  role: WorkspaceMemberRole;
  displayName: string | null;
};

export type FindWorkspaceForUserInput = {
  workspaceId: string;
  userId: string;
};

export type CreateWorkspaceInput = {
  currentUser: WorkspaceAuthUserRef;
  name: string;
  description: string | null;
  type: WorkspaceType;
};

export type CreateWorkspaceInviteInput = {
  workspaceId: string;
  email: string;
  role: WorkspaceInviteRole;
  tokenHash: string;
  invitedByMemberId: string;
  expiresAt: string;
};

export type AcceptWorkspaceInviteInput = {
  inviteId: string;
  tokenHash: string;
  currentUser: WorkspaceAuthUserRef;
  now: Date;
};

export type AcceptWorkspaceInviteResult =
  | {
      ok: true;
      workspaceId: string;
      member: WorkspaceMemberSummary;
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "token_mismatch"
        | "expired"
        | "accepted"
        | "revoked"
        | "email_mismatch"
        | "already_member";
    };

export type RevokeWorkspaceInviteForUserInput = {
  workspaceId: string;
  inviteId: string;
  userId: string;
  now: Date;
};

export type RevokeWorkspaceInviteResult =
  | {
      ok: true;
      invite: WorkspaceInviteRecord;
    }
  | {
      ok: false;
      reason: "not_found" | "accepted" | "revoked" | "expired";
    };

export type UpsertDashboardPreferencesForUserInput =
  FindWorkspaceForUserInput & {
    layout: DashboardPreferencesLayout;
    hiddenSections: string[];
  };

export type UpdateWorkspacePatch = {
  name?: string;
  description?: string | null;
  type?: WorkspaceType;
  status?: WorkspaceStatus;
};

export type UpdateWorkspaceForUserInput = FindWorkspaceForUserInput & {
  patch: UpdateWorkspacePatch;
};

export type WorkspaceRepositoryPort = {
  readonly storageMode: string;
  listWorkspaceSummariesForUser(userId: string): Promise<WorkspaceSummary[]>;
  findWorkspaceSummaryForUser(
    input: FindWorkspaceForUserInput,
  ): Promise<WorkspaceSummary | null>;
  findCurrentMember(
    input: FindWorkspaceForUserInput,
  ): Promise<WorkspaceMemberRecord | null>;
  listWorkspaceMemberSummariesForUser(
    input: FindWorkspaceForUserInput,
  ): Promise<WorkspaceMemberSummary[] | null>;
  createWorkspaceInvite(
    input: CreateWorkspaceInviteInput,
  ): Promise<WorkspaceInviteRecord>;
  acceptWorkspaceInvite(
    input: AcceptWorkspaceInviteInput,
  ): Promise<AcceptWorkspaceInviteResult>;
  revokeWorkspaceInviteForUser(
    input: RevokeWorkspaceInviteForUserInput,
  ): Promise<RevokeWorkspaceInviteResult>;
  getDashboardPreferencesForUser(
    input: FindWorkspaceForUserInput,
  ): Promise<DashboardPreferences | null>;
  upsertDashboardPreferencesForUser(
    input: UpsertDashboardPreferencesForUserInput,
  ): Promise<DashboardPreferences | null>;
  createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceSummary>;
  updateWorkspaceForUser(
    input: UpdateWorkspaceForUserInput,
  ): Promise<WorkspaceSummary | null>;
  softDeleteWorkspaceForUser(
    input: FindWorkspaceForUserInput,
  ): Promise<boolean>;
};
