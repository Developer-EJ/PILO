import {
  buildWorkspaceApiUrl,
  defaultWorkspaceApiBaseUrl,
  listMockStoredWorkspaces,
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

export function defaultWorkspaceDailyBriefingMode() {
  return (
    process.env.NEXT_PUBLIC_PILO_DAILY_BRIEFING_MODE ??
    defaultWorkspaceDashboardMode()
  );
}

export function resolveWorkspaceDailyBriefingClientMode(
  mode = defaultWorkspaceDailyBriefingMode(),
) {
  return mode === "mock" ? "mock" : "api";
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
    [...listMockStoredWorkspaces(), ...mockWorkspaces].find(
      (workspace) => workspace.id === workspaceId,
    ) ?? {
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

function toStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : [];
}

function normalizeBriefingSources(value, fallbackSources) {
  if (Array.isArray(value)) {
    return toStringArray(value);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).filter(([, enabled]) =>
        typeof enabled === "boolean" ? true : typeof enabled === "string",
      ),
    );
  }

  return fallbackSources;
}

function sourceStatusLabel(source, status) {
  if (source === "personalization" && status === "current_member") {
    return "현재 멤버 기준";
  }

  if (status === "dashboard_read_model") {
    return "대시보드 읽기 모델";
  }

  if (status === "empty") {
    return "데이터 없음";
  }

  if (status === "deferred") {
    return "워크스페이스 기준 참고 신호";
  }

  if (status === "fixture") {
    return "워크스페이스 기준 참고 신호";
  }

  return typeof status === "string" && status.trim()
    ? status.replace(/_/g, " ")
    : "워크스페이스 참고 신호";
}

function normalizeSourceDetailEntry(source, detail) {
  if (isRecord(detail)) {
    const sourceName =
      typeof detail.source === "string" && detail.source.trim()
        ? detail.source
        : source;
    const status =
      typeof detail.status === "string" && detail.status.trim()
        ? detail.status
        : typeof detail.value === "string" && detail.value.trim()
          ? detail.value
          : null;

    return {
      ...detail,
      source: sourceName,
      status,
      label:
        typeof detail.label === "string" && detail.label.trim()
          ? detail.label
          : sourceStatusLabel(sourceName, status),
    };
  }

  const status =
    typeof detail === "string" && detail.trim()
      ? detail
      : typeof detail === "boolean"
        ? String(detail)
        : null;

  return {
    source,
    status,
    label: sourceStatusLabel(source, status),
  };
}

function normalizeSourceDetails(value, fallbackSourceDetails) {
  if (Array.isArray(value)) {
    return value
      .map((detail, index) => normalizeSourceDetailEntry(`source_${index}`, detail))
      .filter(isRecord);
  }

  if (isRecord(value)) {
    return Object.entries(value).map(([source, detail]) =>
      normalizeSourceDetailEntry(source, detail),
    );
  }

  return fallbackSourceDetails;
}

function normalizeBriefingBlock(value, defaults) {
  const source = isRecord(value) ? value : {};

  return {
    headline:
      typeof source.headline === "string" && source.headline.trim()
        ? source.headline
        : defaults.headline,
    summary:
      typeof source.summary === "string" && source.summary.trim()
        ? source.summary
        : defaults.summary,
    highlights: toStringArray(source.highlights ?? defaults.highlights),
    risks: toStringArray(source.risks ?? defaults.risks),
    recommendedActions: toStringArray(
      source.recommendedActions ?? defaults.recommendedActions,
    ),
    myTasks: toStringArray(source.myTasks ?? defaults.myTasks),
    needsAttention: toStringArray(
      source.needsAttention ?? defaults.needsAttention,
    ),
  };
}

function createDefaultProjectBriefing() {
  return {
    headline: "오늘 워크스페이스 흐름을 확인하세요",
    summary:
      "작업, PR, 회의, 진행률 데이터를 바탕으로 오늘 확인할 신호를 정리합니다.",
    highlights: ["대시보드의 작업과 리뷰 현황을 기준으로 우선순위를 점검하세요."],
    risks: ["연결된 런타임 데이터가 부족하면 일부 항목은 참고 신호로 표시됩니다."],
    recommendedActions: ["막힌 작업과 리뷰 대기 항목을 먼저 확인하세요."],
  };
}

function createDefaultPersonalBriefing() {
  return {
    headline: "내가 바로 확인할 일을 모았어요",
    summary:
      "나에게 연결된 작업과 주의 항목을 중심으로 개인 브리핑을 구성합니다.",
    myTasks: ["담당 작업과 리뷰 요청을 확인하세요."],
    needsAttention: ["데이터 연결이 부족하면 개인 지정 항목 대신 워크스페이스 신호를 보여줍니다."],
    recommendedActions: ["오늘 처리할 항목을 작업 보드에서 갱신하세요."],
  };
}

export function createWorkspaceDailyBriefingFixture(workspaceId) {
  return {
    workspaceId,
    generatedAt: new Date().toISOString(),
    usedModel: null,
    fallback: true,
    projectBriefing: createDefaultProjectBriefing(),
    personalBriefing: createDefaultPersonalBriefing(),
    sources: {
      dashboard: true,
      tasks: true,
      progress: true,
      meetings: true,
      reviews: true,
    },
    sourceDetails: [
      {
        source: "workspace_dashboard_fixture",
        status: "fixture",
        label: "워크스페이스 기준 참고 신호",
      },
    ],
    warnings: ["daily_briefing_fixture_fallback"],
  };
}

export function normalizeWorkspaceDailyBriefing(
  rawBriefing,
  { workspaceId } = {},
) {
  const source = isRecord(rawBriefing) ? rawBriefing : {};
  const fallback = createWorkspaceDailyBriefingFixture(
    workspaceId ?? source.workspaceId ?? workspaceDashboardFixture.workspace.id,
  );

  return {
    workspaceId:
      typeof source.workspaceId === "string"
        ? source.workspaceId
        : fallback.workspaceId,
    generatedAt:
      typeof source.generatedAt === "string"
        ? source.generatedAt
        : fallback.generatedAt,
    usedModel:
      typeof source.usedModel === "string" && source.usedModel.trim()
        ? source.usedModel
        : null,
    fallback:
      typeof source.fallback === "boolean" ? source.fallback : fallback.fallback,
    projectBriefing: normalizeBriefingBlock(
      source.projectBriefing,
      fallback.projectBriefing,
    ),
    personalBriefing: normalizeBriefingBlock(
      source.personalBriefing,
      fallback.personalBriefing,
    ),
    sources: normalizeBriefingSources(source.sources, fallback.sources),
    sourceDetails: normalizeSourceDetails(
      source.sourceDetails,
      fallback.sourceDetails,
    ),
    warnings: toStringArray(source.warnings ?? fallback.warnings),
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
      userId: workspaceDashboardFixture.currentMember.userId,
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

export class WorkspaceDailyBriefingApiError extends WorkspaceApiError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "WorkspaceDailyBriefingApiError";
  }
}

export function dailyBriefingUserMessageFromError(error) {
  if (error?.status === 401) {
    return "AI 브리핑을 불러오려면 로그인/세션이 필요합니다.";
  }

  if (error?.status === 403) {
    return "이 워크스페이스의 AI 브리핑을 볼 권한이 필요합니다.";
  }

  return "데일리 브리핑을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";
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

async function readDailyBriefingJson(response, path) {
  try {
    return await response.json();
  } catch (error) {
    throw new WorkspaceDailyBriefingApiError(
      "Workspace daily briefing API returned invalid JSON",
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

function dailyBriefingPath(workspaceId, suffix = "") {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/daily-briefing${suffix}`;
}

async function requestDailyBriefing(path, init, { baseUrl, fetcher, workspaceId }) {
  const response = await fetcher(buildWorkspaceApiUrl(path, baseUrl), {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new WorkspaceDailyBriefingApiError(
      "Failed to load daily briefing",
      {
        status: response.status,
        path,
      },
    );
  }

  return normalizeWorkspaceDailyBriefing(
    await readDailyBriefingJson(response, path),
    { workspaceId },
  );
}

export function createWorkspaceDailyBriefingApiClient({
  baseUrl = defaultWorkspaceApiBaseUrl(),
  fetcher = fetch,
} = {}) {
  return {
    async getDailyBriefing(workspaceId) {
      const path = dailyBriefingPath(workspaceId);

      return requestDailyBriefing(path, undefined, {
        baseUrl,
        fetcher,
        workspaceId,
      });
    },

    async regenerateDailyBriefing(workspaceId) {
      const path = dailyBriefingPath(workspaceId, "/regenerate");

      return requestDailyBriefing(path, { method: "POST" }, {
        baseUrl,
        fetcher,
        workspaceId,
      });
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

export function createMockWorkspaceDailyBriefingClient() {
  return {
    async getDailyBriefing(workspaceId = workspaceDashboardFixture.workspace.id) {
      return normalizeWorkspaceDailyBriefing(
        createWorkspaceDailyBriefingFixture(workspaceId),
        { workspaceId },
      );
    },

    async regenerateDailyBriefing(
      workspaceId = workspaceDashboardFixture.workspace.id,
    ) {
      return normalizeWorkspaceDailyBriefing(
        {
          ...createWorkspaceDailyBriefingFixture(workspaceId),
          generatedAt: new Date().toISOString(),
          warnings: ["daily_briefing_regenerated_mock"],
        },
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

export function createWorkspaceDailyBriefingClient(options = {}) {
  const mode = resolveWorkspaceDailyBriefingClientMode(options.mode);

  if (mode === "mock") {
    return createMockWorkspaceDailyBriefingClient();
  }

  return createWorkspaceDailyBriefingApiClient(options);
}
