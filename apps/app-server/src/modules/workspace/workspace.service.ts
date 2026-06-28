import { Injectable } from "@nestjs/common";
import { WorkspaceRepository } from "./workspace.repository";
import type {
  CurrentWorkspaceMember,
  UpdateWorkspacePatch,
  WorkspaceAuthUserRef,
  WorkspaceMemberRecord,
  WorkspaceStatus,
  WorkspaceSummary,
  WorkspaceType,
} from "./workspace.types";
import { WORKSPACE_STATUSES, WORKSPACE_TYPES } from "./workspace.types";

export type ResolveCurrentMemberInput = {
  workspaceId: string;
  currentUser: WorkspaceAuthUserRef;
};

export type WorkspaceRequestInput = {
  currentUser: WorkspaceAuthUserRef;
};

export type WorkspaceResourceInput = ResolveCurrentMemberInput;

export type CreateWorkspaceMutationInput = WorkspaceRequestInput & {
  body: unknown;
};

export type WorkspaceMutationInput = ResolveCurrentMemberInput & {
  body: unknown;
};

export type WorkspaceAccessErrorCode =
  | "workspace_member_not_found"
  | "workspace_not_found"
  | "workspace_forbidden";

export class WorkspaceAccessError extends Error {
  constructor(
    readonly workspaceId: string,
    readonly code: WorkspaceAccessErrorCode = "workspace_member_not_found",
  ) {
    super(createWorkspaceAccessErrorMessage(workspaceId, code));
    this.name = "WorkspaceAccessError";
  }
}

export class WorkspaceValidationError extends Error {
  readonly code = "workspace_validation_failed";

  constructor(message: string) {
    super(message);
    this.name = "WorkspaceValidationError";
  }
}

@Injectable()
export class WorkspaceService {
  constructor(private readonly workspaceRepository: WorkspaceRepository) {}

  getRepositoryStatus() {
    return {
      storageMode: this.workspaceRepository.storageMode,
    };
  }

  async listWorkspaces(
    input: WorkspaceRequestInput,
  ): Promise<WorkspaceSummary[]> {
    return this.workspaceRepository.listWorkspaceSummariesForUser(
      input.currentUser.id,
    );
  }

  async createWorkspace(
    input: CreateWorkspaceMutationInput,
  ): Promise<WorkspaceSummary> {
    const body = parseCreateWorkspaceBody(input.body);

    return this.workspaceRepository.createWorkspace({
      currentUser: input.currentUser,
      name: body.name,
      description: body.description,
      type: body.type,
    });
  }

  async getWorkspace(input: WorkspaceResourceInput): Promise<WorkspaceSummary> {
    const workspace =
      await this.workspaceRepository.findWorkspaceSummaryForUser({
        workspaceId: input.workspaceId,
        userId: input.currentUser.id,
      });

    if (!workspace) {
      throw new WorkspaceAccessError(input.workspaceId, "workspace_not_found");
    }

    return workspace;
  }

  async updateWorkspace(
    input: WorkspaceMutationInput,
  ): Promise<WorkspaceSummary> {
    const currentMember = await this.requireCurrentMember(input);

    if (currentMember.role !== "owner") {
      throw new WorkspaceAccessError(input.workspaceId, "workspace_forbidden");
    }

    const workspace = await this.workspaceRepository.updateWorkspaceForUser({
      workspaceId: input.workspaceId,
      userId: input.currentUser.id,
      patch: parseUpdateWorkspaceBody(input.body),
    });

    if (!workspace) {
      throw new WorkspaceAccessError(input.workspaceId, "workspace_not_found");
    }

    return workspace;
  }

  async resolveCurrentMember(
    input: ResolveCurrentMemberInput,
  ): Promise<CurrentWorkspaceMember | null> {
    const member = await this.workspaceRepository.findCurrentMember({
      workspaceId: input.workspaceId,
      userId: input.currentUser.id,
    });

    return member ? toCurrentWorkspaceMember(member) : null;
  }

  async requireCurrentMember(input: ResolveCurrentMemberInput) {
    const currentMember = await this.resolveCurrentMember(input);

    if (!currentMember) {
      throw new WorkspaceAccessError(input.workspaceId);
    }

    return currentMember;
  }
}

function createWorkspaceAccessErrorMessage(
  workspaceId: string,
  code: WorkspaceAccessErrorCode,
) {
  if (code === "workspace_forbidden") {
    return `Current user cannot modify workspace ${workspaceId}`;
  }

  if (code === "workspace_not_found") {
    return `Workspace ${workspaceId} was not found`;
  }

  return `Current user is not a member of workspace ${workspaceId}`;
}

function parseCreateWorkspaceBody(body: unknown): {
  name: string;
  description: string | null;
  type: WorkspaceType;
} {
  const record = requirePlainObject(body);

  return {
    name: parseWorkspaceName(record.name, true),
    description: parseWorkspaceDescription(record.description),
    type: parseWorkspaceType(record.type, "side_project"),
  };
}

function parseUpdateWorkspaceBody(body: unknown): UpdateWorkspacePatch {
  const record = requirePlainObject(body);
  const patch: UpdateWorkspacePatch = {};

  if ("name" in record) {
    patch.name = parseWorkspaceName(record.name, true);
  }

  if ("description" in record) {
    patch.description = parseWorkspaceDescription(record.description);
  }

  if ("type" in record) {
    patch.type = parseWorkspaceType(record.type);
  }

  if ("status" in record) {
    patch.status = parseWorkspaceStatus(record.status);
  }

  return patch;
}

function requirePlainObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new WorkspaceValidationError("Workspace request body is required.");
  }

  return body as Record<string, unknown>;
}

function parseWorkspaceName(value: unknown, required: true): string;
function parseWorkspaceName(
  value: unknown,
  required: false,
): string | undefined;
function parseWorkspaceName(value: unknown, required: boolean) {
  if (value === undefined && !required) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new WorkspaceValidationError("Workspace name must be a string.");
  }

  const name = value.trim();

  if (!name) {
    throw new WorkspaceValidationError("Workspace name is required.");
  }

  if (name.length > 100) {
    throw new WorkspaceValidationError(
      "Workspace name must be 100 characters or less.",
    );
  }

  return name;
}

function parseWorkspaceDescription(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new WorkspaceValidationError(
      "Workspace description must be a string or null.",
    );
  }

  const description = value.trim();

  if (description.length > 500) {
    throw new WorkspaceValidationError(
      "Workspace description must be 500 characters or less.",
    );
  }

  return description || null;
}

function parseWorkspaceType(
  value: unknown,
  defaultValue?: WorkspaceType,
): WorkspaceType {
  if (value === undefined && defaultValue) {
    return defaultValue;
  }

  if (
    typeof value !== "string" ||
    !WORKSPACE_TYPES.includes(value as WorkspaceType)
  ) {
    throw new WorkspaceValidationError("Workspace type is invalid.");
  }

  return value as WorkspaceType;
}

function parseWorkspaceStatus(value: unknown): WorkspaceStatus {
  if (
    typeof value !== "string" ||
    !WORKSPACE_STATUSES.includes(value as WorkspaceStatus)
  ) {
    throw new WorkspaceValidationError("Workspace status is invalid.");
  }

  return value as WorkspaceStatus;
}

function toCurrentWorkspaceMember(
  member: WorkspaceMemberRecord,
): CurrentWorkspaceMember {
  return {
    workspaceId: member.workspaceId,
    memberId: member.id,
    userId: member.userId,
    role: member.role,
    displayName: member.displayName,
  };
}
