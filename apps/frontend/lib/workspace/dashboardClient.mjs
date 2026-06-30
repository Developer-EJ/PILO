import {
  buildWorkspaceApiUrl,
  defaultWorkspaceApiBaseUrl,
  localMvpActorHeaders,
  mockWorkspaces,
  WorkspaceApiError,
} from "./workspaceClient.mjs";
import { workspaceDashboardFixture } from "./workspaceDashboardFixture.mjs";

const DEFAULT_DASHBOARD_MODE = "mock";

const dashboardArraySections = [
  "members",
  "tasks",
  "githubIssues",
  "pullRequests",
  "pullRequestChangedFiles",
  "meetingReports",
  "meetingActionItems",
  "prAnalyses",
  "agentActions",
  "canvasEntities",
];

export function defaultWorkspaceDashboardMode() {
  return (
    process.env.NEXT_PUBLIC_PILO_DASHBOARD_MODE ??
    process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE ??
    DEFAULT_DASHBOARD_MODE
  );
}

export function resolveWorkspaceDashboardClientMode(
  mode = defaultWorkspaceDashboardMode(),
) {
  return mode === "api" ? "api" : "mock";
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function remapWorkspaceId(value, workspaceId) {
  if (Array.isArray(value)) {
    return value.map((item) => remapWorkspaceId(item, workspaceId));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === "workspaceId"
        ? workspaceId
        : remapWorkspaceId(entry, workspaceId),
    ]),
  );
}

function createFallbackWorkspace(workspaceId) {
  return (
    mockWorkspaces.find((workspace) => workspace.id === workspaceId) ?? {
      ...workspaceDashboardFixture.workspace,
      id: workspaceId,
    }
  );
}

function createFallbackCurrentMember(workspaceId) {
  const firstMember = workspaceDashboardFixture.members[0];

  return {
    workspaceId,
    memberId: firstMember.memberId,
    userId: firstMember.userId,
    role: firstMember.role,
    displayName: firstMember.displayName,
  };
}

function createFallbackPreferences(workspaceId) {
  return {
    workspaceId,
    memberId: workspaceDashboardFixture.members[0].memberId,
    layout: {},
    hiddenSections: [],
    updatedAt: null,
  };
}

export function normalizeWorkspaceDashboard(
  rawDashboard,
  { workspaceId } = {},
) {
  const warnings = [];
  const source = isRecord(rawDashboard) ? rawDashboard : {};
  const requestedWorkspaceId = workspaceId ?? null;
  const incomingWorkspace = isRecord(source.workspace)
    ? source.workspace
    : null;
  const incomingWorkspaceId =
    typeof incomingWorkspace?.id === "string" ? incomingWorkspace.id : null;
  const workspaceIdMismatch =
    Boolean(requestedWorkspaceId && incomingWorkspaceId) &&
    requestedWorkspaceId !== incomingWorkspaceId;
  const resolvedWorkspaceId =
    workspaceId ??
    incomingWorkspaceId ??
    workspaceDashboardFixture.workspace.id;

  if (!isRecord(rawDashboard)) {
    warnings.push("dashboard_payload_invalid");
  }

  if (workspaceIdMismatch) {
    warnings.push("workspace_id_mismatch");
  }

  const dashboard = {
    workspace:
      incomingWorkspace && !workspaceIdMismatch
        ? incomingWorkspace
        : createFallbackWorkspace(resolvedWorkspaceId),
    currentMember: isRecord(source.currentMember)
      ? source.currentMember
      : createFallbackCurrentMember(resolvedWorkspaceId),
    preferences: isRecord(source.preferences)
      ? source.preferences
      : createFallbackPreferences(resolvedWorkspaceId),
    progress:
      source.progress === null || isRecord(source.progress)
        ? source.progress
        : null,
    source: typeof source.source === "string" ? source.source : "fixture",
    generatedAt:
      typeof source.generatedAt === "string"
        ? source.generatedAt
        : new Date().toISOString(),
  };

  if (!incomingWorkspace) warnings.push("workspace_missing");
  if (!isRecord(source.currentMember)) warnings.push("currentMember_missing");
  if (!isRecord(source.preferences)) warnings.push("preferences_missing");
  if (source.progress !== null && !isRecord(source.progress)) {
    warnings.push("progress_invalid");
  }

  for (const section of dashboardArraySections) {
    if (Array.isArray(source[section])) {
      dashboard[section] = source[section];
    } else {
      dashboard[section] = [];
      warnings.push(`${section}_missing`);
    }
  }

  return { dashboard, warnings };
}

export function createWorkspaceDashboardFixture(workspaceId) {
  const workspace = createFallbackWorkspace(workspaceId);
  const firstMember = workspaceDashboardFixture.members[0];

  return {
    workspace,
    currentMember: {
      workspaceId,
      memberId: firstMember.memberId,
      userId: workspaceDashboardFixture.currentUser.id,
      role: firstMember.role,
      displayName: firstMember.displayName,
    },
    preferences: {
      workspaceId,
      memberId: firstMember.memberId,
      layout: {},
      hiddenSections: [],
      updatedAt: null,
    },
    members: workspaceDashboardFixture.members,
    tasks: remapWorkspaceId(workspaceDashboardFixture.tasks, workspaceId),
    progress: remapWorkspaceId(workspaceDashboardFixture.progress, workspaceId),
    githubIssues: workspaceDashboardFixture.githubIssues,
    pullRequests: workspaceDashboardFixture.pullRequests,
    pullRequestChangedFiles: workspaceDashboardFixture.pullRequestChangedFiles,
    meetingReports: remapWorkspaceId(
      workspaceDashboardFixture.meetingReports,
      workspaceId,
    ),
    meetingActionItems: workspaceDashboardFixture.meetingActionItems,
    prAnalyses: workspaceDashboardFixture.prAnalyses,
    agentActions: remapWorkspaceId(
      workspaceDashboardFixture.agentActions,
      workspaceId,
    ),
    canvasEntities: workspaceDashboardFixture.canvasEntities,
    source: "fixture",
    generatedAt: new Date().toISOString(),
  };
}

export class WorkspaceDashboardApiError extends WorkspaceApiError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "WorkspaceDashboardApiError";
  }
}

async function readDashboardJson(response, path) {
  try {
    return await response.json();
  } catch (error) {
    throw new WorkspaceDashboardApiError(
      "Workspace dashboard API returned invalid JSON",
      {
        status: response.status,
        path,
      },
    );
  }
}

export function createWorkspaceDashboardApiClient({
  baseUrl = defaultWorkspaceApiBaseUrl(),
  fetcher = fetch,
} = {}) {
  return {
    async getDashboard(workspaceId) {
      const path = `/api/workspaces/${encodeURIComponent(workspaceId)}/dashboard`;
      const response = await fetcher(buildWorkspaceApiUrl(path, baseUrl), {
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...localMvpActorHeaders(),
        },
      });

      if (!response.ok) {
        throw new WorkspaceDashboardApiError("Failed to load dashboard", {
          status: response.status,
          path,
        });
      }

      return normalizeWorkspaceDashboard(
        await readDashboardJson(response, path),
        {
          workspaceId,
        },
      );
    },
  };
}

export function createMockWorkspaceDashboardClient() {
  return {
    async getDashboard(workspaceId = workspaceDashboardFixture.workspace.id) {
      return normalizeWorkspaceDashboard(
        createWorkspaceDashboardFixture(workspaceId),
        { workspaceId },
      );
    },
  };
}

export function createWorkspaceDashboardClient(options = {}) {
  const mode = resolveWorkspaceDashboardClientMode(options.mode);

  if (mode === "api") {
    return createWorkspaceDashboardApiClient(options);
  }

  return createMockWorkspaceDashboardClient();
}
