export const WORKSPACE_TYPES = [
  "side_project",
  "bootcamp",
  "university",
  "hackathon",
  "other",
] as const;

export const WORKSPACE_STATUSES = ["active", "archived"] as const;

export const WORKSPACE_MEMBER_ROLES = ["owner", "member", "viewer"] as const;

export type WorkspaceType = (typeof WORKSPACE_TYPES)[number];

export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

export type WorkspaceMemberRole = (typeof WORKSPACE_MEMBER_ROLES)[number];

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
  createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceSummary>;
  updateWorkspaceForUser(
    input: UpdateWorkspaceForUserInput,
  ): Promise<WorkspaceSummary | null>;
  softDeleteWorkspaceForUser(
    input: FindWorkspaceForUserInput,
  ): Promise<boolean>;
};
