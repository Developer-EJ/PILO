import { Injectable, Optional, type Type } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JuhyungProgressService } from "../juhyung/juhyung-progress.service";
import { JuhyungTaskService } from "../juhyung/juhyung-task.service";
import { MeetingService } from "../meeting/meeting.service";
import { WorkspaceRepository } from "./workspace.repository";
import type {
  CurrentWorkspaceMember,
  DashboardPreferences,
  DashboardPreferencesLayout,
  UpdateWorkspacePatch,
  WorkspaceAuthUserRef,
  WorkspaceInviteCreated,
  WorkspaceInviteRole,
  WorkspaceMemberRole,
  WorkspaceMemberRecord,
  WorkspaceMemberSummary,
  WorkspaceDashboardReadModel,
  WorkspaceStatus,
  WorkspaceSummary,
  WorkspaceType,
} from "./workspace.types";
import {
  createWorkspaceMemberPermissions,
  hasWorkspaceRole,
  type WorkspaceMemberPermissions,
} from "./workspace.permissions";
import {
  WORKSPACE_INVITE_ROLES,
  WORKSPACE_STATUSES,
  WORKSPACE_TYPES,
} from "./workspace.types";

const WORKSPACE_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

export type AcceptWorkspaceInviteMutationInput = WorkspaceRequestInput & {
  inviteId: string;
  body: unknown;
};

export type RevokeWorkspaceInviteInput = ResolveCurrentMemberInput & {
  inviteId: string;
};

export type WorkspaceRoleRequirement = {
  minimumRole?: WorkspaceMemberRole;
};

export type WorkspaceCurrentMemberContext = {
  currentMember: CurrentWorkspaceMember;
  permissions: WorkspaceMemberPermissions;
};

export type WorkspaceAccessErrorCode =
  | "workspace_member_not_found"
  | "workspace_not_found"
  | "workspace_forbidden";

export type WorkspaceInviteErrorCode =
  | "workspace_invite_not_found"
  | "workspace_invite_token_invalid"
  | "workspace_invite_expired"
  | "workspace_invite_accepted"
  | "workspace_invite_revoked"
  | "workspace_invite_email_mismatch"
  | "workspace_invite_already_member"
  | "workspace_invite_duplicate_active_email";

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

export class WorkspaceInviteError extends Error {
  constructor(
    readonly code: WorkspaceInviteErrorCode,
    readonly inviteId?: string,
  ) {
    super(createWorkspaceInviteErrorMessage(code, inviteId));
    this.name = "WorkspaceInviteError";
  }
}

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly workspaceRepository: WorkspaceRepository,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

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

  async listWorkspaceMembers(
    input: WorkspaceResourceInput,
  ): Promise<WorkspaceMemberSummary[]> {
    await this.requireCurrentMember(input);

    const members =
      await this.workspaceRepository.listWorkspaceMemberSummariesForUser({
        workspaceId: input.workspaceId,
        userId: input.currentUser.id,
      });

    if (!members) {
      throw new WorkspaceAccessError(input.workspaceId, "workspace_not_found");
    }

    return members;
  }

  async createWorkspaceInvite(
    input: WorkspaceMutationInput,
  ): Promise<WorkspaceInviteCreated> {
    const currentMemberContext = await this.requireCurrentMemberContext(input, {
      minimumRole: "owner",
    });
    const body = parseCreateWorkspaceInviteBody(input.body);
    const token = createInviteToken();
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + body.ttlMs).toISOString();
    const invite = await this.workspaceRepository.createWorkspaceInvite({
      workspaceId: input.workspaceId,
      email: body.email,
      role: body.role,
      tokenHash,
      invitedByMemberId: currentMemberContext.currentMember.memberId,
      expiresAt,
    });

    if (invite.tokenHash !== tokenHash) {
      throw new WorkspaceInviteError(
        "workspace_invite_duplicate_active_email",
        invite.id,
      );
    }

    return {
      id: invite.id,
      workspaceId: invite.workspaceId,
      email: invite.email,
      role: invite.role,
      token,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    };
  }

  async acceptWorkspaceInvite(input: AcceptWorkspaceInviteMutationInput) {
    const body = parseAcceptWorkspaceInviteBody(input.body);
    const result = await this.workspaceRepository.acceptWorkspaceInvite({
      inviteId: input.inviteId,
      tokenHash: hashInviteToken(body.token),
      currentUser: input.currentUser,
      now: new Date(),
    });

    if (!result.ok) {
      throw workspaceInviteResultError(result.reason, input.inviteId);
    }

    return result;
  }

  async revokeWorkspaceInvite(input: RevokeWorkspaceInviteInput) {
    await this.requireCurrentMemberContext(input, { minimumRole: "owner" });

    const result = await this.workspaceRepository.revokeWorkspaceInviteForUser({
      workspaceId: input.workspaceId,
      inviteId: input.inviteId,
      userId: input.currentUser.id,
      now: new Date(),
    });

    if (!result.ok) {
      throw workspaceInviteResultError(result.reason, input.inviteId);
    }

    return {
      id: result.invite.id,
      workspaceId: result.invite.workspaceId,
      email: result.invite.email,
      role: result.invite.role,
      revokedAt: result.invite.revokedAt,
    };
  }

  async getDashboardPreferences(
    input: WorkspaceResourceInput,
  ): Promise<DashboardPreferences> {
    await this.requireCurrentMember(input);

    const preferences =
      await this.workspaceRepository.getDashboardPreferencesForUser({
        workspaceId: input.workspaceId,
        userId: input.currentUser.id,
      });

    if (!preferences) {
      throw new WorkspaceAccessError(input.workspaceId, "workspace_not_found");
    }

    return preferences;
  }

  async getWorkspaceDashboard(
    input: WorkspaceResourceInput,
  ): Promise<WorkspaceDashboardReadModel> {
    const [workspace, currentMember, members, preferences] = await Promise.all([
      this.getWorkspace(input),
      this.requireCurrentMember(input),
      this.listWorkspaceMembers(input),
      this.getDashboardPreferences(input),
    ]);
    const readModels = await this.overlayRuntimeDashboardReadModels(
      input,
      currentMember,
      loadFixtureDashboardReadModels(input.workspaceId),
    );

    return {
      workspace,
      currentMember,
      preferences,
      members,
      ...readModels,
      generatedAt: new Date().toISOString(),
    };
  }

  private async overlayRuntimeDashboardReadModels(
    input: WorkspaceResourceInput,
    currentMember: CurrentWorkspaceMember,
    readModels: FixtureDashboardReadModels,
  ): Promise<FixtureDashboardReadModels> {
    if (!this.moduleRef || process.env.PILO_SKIP_DATABASE_CONNECT === "true") {
      return readModels;
    }

    const actor = {
      userId: input.currentUser.id,
      memberId: currentMember.memberId,
    };
    const nextReadModels = { ...readModels };
    let hasRuntimeSection = false;
    const taskService = this.getRuntimeProvider(JuhyungTaskService);
    const progressService = this.getRuntimeProvider(JuhyungProgressService);
    const meetingService = this.getRuntimeProvider(MeetingService);

    if (taskService) {
      try {
        nextReadModels.tasks = await taskService.listTasks(
          input.workspaceId,
          {},
          actor,
        );
        hasRuntimeSection = true;
      } catch {
        // Dashboard stays available while owner services catch up or are down.
      }
    }

    if (progressService) {
      try {
        const progress = await progressService.getProgressSummary(
          input.workspaceId,
          actor,
        );
        nextReadModels.progress = { ...progress };
        hasRuntimeSection = true;
      } catch {
        // Dashboard stays available while owner services catch up or are down.
      }
    }

    if (meetingService) {
      try {
        const meetingReports = await meetingService.listRecentReports(
          input.workspaceId,
        );
        const meetingReportCanvasEntities =
          await meetingService.listRecentReportCanvasEntityRefs(
            input.workspaceId,
          );
        nextReadModels.meetingReports = meetingReports;
        nextReadModels.canvasEntities = replaceCanvasEntitiesByType(
          nextReadModels.canvasEntities,
          "meeting_report",
          meetingReportCanvasEntities,
        );
        hasRuntimeSection = true;
      } catch {
        // Dashboard stays available while owner services catch up or are down.
      }
    }

    return hasRuntimeSection
      ? {
          ...nextReadModels,
          source: "mixed",
        }
      : readModels;
  }

  private getRuntimeProvider<T>(token: Type<T>): T | null {
    if (!this.moduleRef) {
      return null;
    }

    try {
      return this.moduleRef.get(token, { strict: false });
    } catch {
      return null;
    }
  }

  async updateDashboardPreferences(
    input: WorkspaceMutationInput,
  ): Promise<DashboardPreferences> {
    await this.requireCurrentMember(input);

    const body = parseDashboardPreferencesBody(input.body);
    const preferences =
      await this.workspaceRepository.upsertDashboardPreferencesForUser({
        workspaceId: input.workspaceId,
        userId: input.currentUser.id,
        layout: body.layout,
        hiddenSections: body.hiddenSections,
      });

    if (!preferences) {
      throw new WorkspaceAccessError(input.workspaceId, "workspace_not_found");
    }

    return preferences;
  }

  async updateWorkspace(
    input: WorkspaceMutationInput,
  ): Promise<WorkspaceSummary> {
    await this.requireCurrentMemberContext(input, { minimumRole: "owner" });

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

  async resolveCurrentMemberContext(
    input: ResolveCurrentMemberInput,
  ): Promise<WorkspaceCurrentMemberContext | null> {
    const currentMember = await this.resolveCurrentMember(input);

    if (!currentMember) {
      return null;
    }

    return toWorkspaceCurrentMemberContext(currentMember);
  }

  async requireCurrentMember(input: ResolveCurrentMemberInput) {
    const currentMember = await this.resolveCurrentMember(input);

    if (!currentMember) {
      throw new WorkspaceAccessError(input.workspaceId);
    }

    return currentMember;
  }

  async requireCurrentMemberContext(
    input: ResolveCurrentMemberInput,
    requirement: WorkspaceRoleRequirement = {},
  ) {
    const context = await this.resolveCurrentMemberContext(input);

    if (!context) {
      throw new WorkspaceAccessError(input.workspaceId);
    }

    if (
      requirement.minimumRole &&
      !hasWorkspaceRole(context.currentMember.role, requirement.minimumRole)
    ) {
      throw new WorkspaceAccessError(input.workspaceId, "workspace_forbidden");
    }

    return context;
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

function createWorkspaceInviteErrorMessage(
  code: WorkspaceInviteErrorCode,
  inviteId?: string,
) {
  const suffix = inviteId ? ` (${inviteId})` : "";

  if (code === "workspace_invite_not_found") {
    return `Workspace invite was not found${suffix}`;
  }

  if (code === "workspace_invite_token_invalid") {
    return `Workspace invite token is invalid${suffix}`;
  }

  if (code === "workspace_invite_expired") {
    return `Workspace invite is expired${suffix}`;
  }

  if (code === "workspace_invite_accepted") {
    return `Workspace invite is already accepted${suffix}`;
  }

  if (code === "workspace_invite_revoked") {
    return `Workspace invite is revoked${suffix}`;
  }

  if (code === "workspace_invite_email_mismatch") {
    return `Workspace invite email does not match current user${suffix}`;
  }

  if (code === "workspace_invite_already_member") {
    return `Current user is already a workspace member${suffix}`;
  }

  return `An active workspace invite already exists for this email${suffix}`;
}

function workspaceInviteResultError(
  reason:
    | "not_found"
    | "token_mismatch"
    | "expired"
    | "accepted"
    | "revoked"
    | "email_mismatch"
    | "already_member",
  inviteId: string,
) {
  const errorCodeByReason = {
    not_found: "workspace_invite_not_found",
    token_mismatch: "workspace_invite_token_invalid",
    expired: "workspace_invite_expired",
    accepted: "workspace_invite_accepted",
    revoked: "workspace_invite_revoked",
    email_mismatch: "workspace_invite_email_mismatch",
    already_member: "workspace_invite_already_member",
  } satisfies Record<string, WorkspaceInviteErrorCode>;

  return new WorkspaceInviteError(errorCodeByReason[reason], inviteId);
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

function parseCreateWorkspaceInviteBody(body: unknown): {
  email: string;
  role: WorkspaceInviteRole;
  ttlMs: number;
} {
  const record = requirePlainObject(body);

  return {
    email: parseInviteEmail(record.email),
    role: parseWorkspaceInviteRole(record.role),
    ttlMs: parseInviteTtlMs(record.ttlHours),
  };
}

function parseAcceptWorkspaceInviteBody(body: unknown): {
  token: string;
} {
  const record = requirePlainObject(body);

  if (typeof record.token !== "string" || !record.token.trim()) {
    throw new WorkspaceValidationError("Workspace invite token is required.");
  }

  return {
    token: record.token.trim(),
  };
}

function parseDashboardPreferencesBody(body: unknown): {
  layout: DashboardPreferencesLayout;
  hiddenSections: string[];
} {
  const record = requirePlainObject(body);

  return {
    layout: parseDashboardPreferencesLayout(record.layout),
    hiddenSections: parseHiddenSections(record.hiddenSections),
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

function parseDashboardPreferencesLayout(
  value: unknown,
): DashboardPreferencesLayout {
  if (value === undefined) {
    return {};
  }

  if (!isPlainJsonObject(value)) {
    throw new WorkspaceValidationError(
      "Dashboard preferences layout must be an object.",
    );
  }

  return value;
}

function parseHiddenSections(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new WorkspaceValidationError(
      "Dashboard preferences hiddenSections must be an array.",
    );
  }

  const hiddenSections = value.map((item) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new WorkspaceValidationError(
        "Dashboard preferences hiddenSections must contain strings.",
      );
    }

    return item.trim();
  });

  return Array.from(new Set(hiddenSections));
}

function parseInviteEmail(value: unknown) {
  if (typeof value !== "string") {
    throw new WorkspaceValidationError("Workspace invite email is required.");
  }

  const email = value.trim().toLowerCase();

  if (!email || !email.includes("@") || email.length > 320) {
    throw new WorkspaceValidationError("Workspace invite email is invalid.");
  }

  return email;
}

function parseWorkspaceInviteRole(value: unknown): WorkspaceInviteRole {
  if (value === undefined) {
    return "member";
  }

  if (
    typeof value !== "string" ||
    !WORKSPACE_INVITE_ROLES.includes(value as WorkspaceInviteRole)
  ) {
    throw new WorkspaceValidationError("Workspace invite role is invalid.");
  }

  return value as WorkspaceInviteRole;
}

function parseInviteTtlMs(value: unknown) {
  if (value === undefined) {
    return WORKSPACE_INVITE_TTL_MS;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new WorkspaceValidationError(
      "Workspace invite ttlHours must be a number.",
    );
  }

  if (value < 0 || value > 720) {
    throw new WorkspaceValidationError(
      "Workspace invite ttlHours must be between 0 and 720.",
    );
  }

  return value * 60 * 60 * 1000;
}

function createInviteToken() {
  return randomBytes(24).toString("base64url");
}

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function requirePlainObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new WorkspaceValidationError("Workspace request body is required.");
  }

  return body as Record<string, unknown>;
}

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function toWorkspaceCurrentMemberContext(
  currentMember: CurrentWorkspaceMember,
): WorkspaceCurrentMemberContext {
  return {
    currentMember,
    permissions: createWorkspaceMemberPermissions(currentMember.role),
  };
}

type FixtureDashboardReadModels = Pick<
  WorkspaceDashboardReadModel,
  | "tasks"
  | "progress"
  | "githubIssues"
  | "pullRequests"
  | "meetingReports"
  | "prAnalyses"
  | "agentActions"
  | "canvasEntities"
  | "source"
>;

let cachedFixture: Record<string, unknown> | null | undefined;

function loadFixtureDashboardReadModels(
  workspaceId: string,
): FixtureDashboardReadModels {
  const fixture = readWorkspaceDashboardFixture();

  if (!fixture) {
    return createEmptyDashboardReadModels();
  }

  return {
    tasks: remapWorkspaceIdArray(fixture.tasks, workspaceId),
    progress: remapWorkspaceIdRecord(fixture.progress, workspaceId),
    githubIssues: readFixtureArray(fixture.githubIssues),
    pullRequests: readFixtureArray(fixture.pullRequests),
    meetingReports: remapWorkspaceIdArray(fixture.meetingReports, workspaceId),
    prAnalyses: readFixtureArray(fixture.prAnalyses),
    agentActions: remapAgentActionWorkspaceIds(
      readFixtureArray(fixture.agentActions),
      workspaceId,
    ),
    canvasEntities: readFixtureArray(fixture.canvasEntities),
    source: "fixture",
  };
}

function createEmptyDashboardReadModels(): FixtureDashboardReadModels {
  return {
    tasks: [],
    progress: null,
    githubIssues: [],
    pullRequests: [],
    meetingReports: [],
    prAnalyses: [],
    agentActions: [],
    canvasEntities: [],
    source: "empty",
  };
}

function replaceCanvasEntitiesByType(
  entities: unknown[],
  entityType: string,
  replacements: unknown[],
) {
  return [
    ...entities.filter(
      (entity) =>
        !(
          isPlainJsonObject(entity) &&
          typeof entity.entityType === "string" &&
          entity.entityType === entityType
        ),
    ),
    ...replacements,
  ];
}

function readWorkspaceDashboardFixture() {
  if (cachedFixture !== undefined) {
    return cachedFixture;
  }

  for (const fixturePath of createFixturePathCandidates()) {
    if (existsSync(fixturePath)) {
      cachedFixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<
        string,
        unknown
      >;
      return cachedFixture;
    }
  }

  cachedFixture = null;
  return cachedFixture;
}

function createFixturePathCandidates() {
  return [
    resolve(
      process.cwd(),
      "../../docs/contracts/fixtures/workspace-dashboard.fixture.json",
    ),
    resolve(
      process.cwd(),
      "docs/contracts/fixtures/workspace-dashboard.fixture.json",
    ),
  ];
}

function readFixtureArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value.map(cloneJsonValue) : [];
}

function remapWorkspaceIdArray(value: unknown, workspaceId: string) {
  return readFixtureArray(value).map((item) =>
    remapWorkspaceIdRecord(item, workspaceId),
  );
}

function remapWorkspaceIdRecord(
  value: unknown,
  workspaceId: string,
): Record<string, unknown> | null {
  if (!isPlainJsonObject(value)) {
    return null;
  }

  return {
    ...cloneJsonValue(value),
    workspaceId,
  };
}

function remapAgentActionWorkspaceIds(actions: unknown[], workspaceId: string) {
  return actions.map((action) => {
    if (!isPlainJsonObject(action)) {
      return action;
    }

    const payload = action.payload;

    return {
      ...action,
      payload: isPlainJsonObject(payload)
        ? {
            ...payload,
            workspaceId,
          }
        : payload,
    };
  });
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
