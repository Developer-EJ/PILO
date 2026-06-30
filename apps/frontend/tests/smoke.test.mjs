import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildAuthApiUrl,
  createAuthClient,
  createAuthApiClient,
} from "../lib/auth/authClient.mjs";
import {
  createMockAuthClient,
  markMockAuthSignedIn,
  markMockAuthSignedOut,
  mockCurrentUser,
} from "../lib/auth/mockAuthClient.mjs";
import {
  createLoginRedirectHref,
  isProtectedPath,
  safeNextPath,
} from "../lib/auth/protectedRoutes.mjs";
import {
  normalizeCallbackRedirect,
  resolveOAuthCallbackState,
} from "../app/login/callback/oauthCallbackState.mjs";
import { authProviderHref } from "../app/login/authProviderHref.mjs";
import {
  buildWorkspaceApiUrl,
  createMockWorkspaceClient,
  createWorkspaceApiClient,
  createWorkspaceClient,
  isLocalMvpActorEnabled,
  LOCAL_MVP_MEMBER_ID,
  LOCAL_MVP_USER_ID,
  localMvpActorHeaders,
  mockWorkspaces,
  WorkspaceApiError,
} from "../lib/workspace/workspaceClient.mjs";
import {
  createMockWorkspaceDashboardClient,
  createWorkspaceDashboardApiClient,
  createWorkspaceDashboardClient,
  createWorkspaceDashboardFixture,
  normalizeWorkspaceDashboard,
  resolveWorkspaceDashboardClientMode,
} from "../lib/workspace/dashboardClient.mjs";
import {
  buildCanvasApiUrl,
  createCanvasApiClient,
  createCanvasClient,
  createMockCanvasBoardDetail,
  createMockCanvasClient,
  resolveCanvasClientMode,
} from "../lib/workspace/canvasClient.mjs";
import {
  buildTaskApiUrl,
  createMockTaskClient,
  createTaskApiClient,
  createTaskClient,
  resolveTaskClientMode,
} from "../lib/task/taskClient.mjs";
import {
  buildGithubApiUrl,
  createGithubFixture,
  createGithubApiClient,
  createGithubClient,
  createMockGithubClient,
  resolveGithubClientMode,
} from "../lib/github/githubClient.mjs";
import {
  buildMeetingApiUrl,
  createMeetingApiClient,
  createMeetingClient,
  createMockMeetingClient,
  resolveMeetingClientMode,
} from "../lib/meeting/meetingClient.mjs";
import {
  buildVoiceApiUrl,
  createMockVoiceClient,
  createVoiceApiClient,
  createVoiceClient,
  resolveVoiceClientMode,
} from "../lib/voice/voiceClient.mjs";
import {
  buildAgentApiUrl,
  createAgentPlanningApiClient,
  createAgentPlanningClient,
  createMockAgentPlanningClient,
  defaultProjectStartInput,
  resolveAgentPlanningClientMode,
} from "../lib/agent/agentPlanningClient.mjs";
import {
  buildNotificationApiUrl,
  createMockNotificationClient,
  createNotificationApiClient,
  createNotificationClient,
  createNotificationFixture,
  resolveNotificationClientMode,
} from "../lib/notification/notificationClient.mjs";
import {
  buildReviewApiUrl,
  createMockReviewClient,
  createReviewApiClient,
  reviewFixture,
  resolveReviewClientMode,
} from "../lib/review/reviewClient.mjs";
import {
  applyCanvasShapeState,
  buildCanvasShapeStateMutations,
  canvasStorageKey,
  filterCanvasBoard,
  normalizeCanvasFilterSetting,
  normalizeCanvasShapeState,
} from "../lib/workspace/canvasStorage.mjs";
import {
  buildWorkspaceFeatureRoutes,
  buildWorkspaceFeatureTabs,
  CURRENT_WORKSPACE_STORAGE_KEY,
  extractWorkspaceIdFromPathname,
  readStoredWorkspaceId,
  resolveCurrentWorkspaceSelection,
  workspaceAgentHref,
  workspaceCanvasHref,
  workspaceDashboardHref,
  workspaceGithubHref,
  workspaceMeetingsHref,
  workspacePlanningHref,
  workspaceReviewsHref,
  workspaceTasksHref,
  writeStoredWorkspaceId,
} from "../lib/workspace/currentWorkspace.mjs";
import { workspaceDashboardFixture } from "../lib/workspace/workspaceDashboardFixture.mjs";
import packageJson from "../package.json" with { type: "json" };
import contractSchema from "../../../docs/contracts/schemas/pilo-public-contracts.schema.json" with { type: "json" };
import contractCanvasBoardDetailFixture from "../../../docs/contracts/fixtures/canvas-board-detail.fixture.json" with { type: "json" };
import contractWorkspaceDashboardFixture from "../../../docs/contracts/fixtures/workspace-dashboard.fixture.json" with { type: "json" };

const sortContractKeys = (values) =>
  [...values].sort((left, right) => left.localeCompare(right));

function assertLocalActorHeaders(
  request,
  { memberId = LOCAL_MVP_MEMBER_ID } = {},
) {
  assert.equal(request.init.headers["x-user-id"], LOCAL_MVP_USER_ID);
  assert.equal(request.init.headers["x-member-id"], memberId);
}

function assertEveryRequestUsesLocalActor(requests) {
  requests.forEach((request) => assertLocalActorHeaders(request));
}

describe("frontend package", () => {
  it("keeps the PILO frontend package name", () => {
    assert.equal(packageJson.name, "@pilo/frontend");
  });

  it("exposes the PR selector, canvas workspace, and node detail workflow", () => {
    const page = readFileSync("app/(workspace)/reviews/page.tsx", "utf8");
    const workspace = readFileSync(
      "app/(workspace)/reviews/review-node-workspace.tsx",
      "utf8",
    );
    const runtimeContainer = readFileSync(
      "components/review/ReviewRoomWorkspace.tsx",
      "utf8",
    );
    const runtimeStyles = readFileSync(
      "components/review/ReviewRoomWorkspace.module.css",
      "utf8",
    );

    assert.match(page, /reviewSessions/);
    assert.match(workspace, /ReviewNodeWorkspace/);
    assert.match(workspace, /canvasWorkspace/);
    assert.match(workspace, /panelResizeHandle/);
    assert.match(workspace, /detailWorkspace/);
    assert.match(workspace, /decisionLabels/);
    assert.match(workspace, /setDecisions/);
    assert.match(runtimeContainer, /ReviewNodeWorkspace/);
    assert.match(runtimeContainer, /createReviewSelectorSession/);
    assert.doesNotMatch(runtimeStyles, /roomLayout|prCard|reviewNode/);
  });

  it("keeps auth provider hrefs relative when no app server URL is configured", () => {
    assert.equal(
      authProviderHref("/api/auth/google/start", undefined),
      "/api/auth/google/start",
    );
    assert.equal(
      authProviderHref("/api/auth/github/start", undefined),
      "/api/auth/github/start",
    );
  });

  it("uses the configured app server URL for auth provider hrefs", () => {
    assert.equal(
      authProviderHref("/api/auth/google/start", "https://api.pilo.dev/"),
      "https://api.pilo.dev/api/auth/google/start",
    );
    assert.equal(
      authProviderHref("/api/auth/github/start", "https://api.pilo.dev"),
      "https://api.pilo.dev/api/auth/github/start",
    );
  });

  it("builds workspace API URLs from the configured app server base URL", () => {
    assert.equal(
      buildWorkspaceApiUrl("/api/workspaces", ""),
      "/api/workspaces",
    );
    assert.equal(
      buildWorkspaceApiUrl("/api/workspaces", "https://api.pilo.dev/"),
      "https://api.pilo.dev/api/workspaces",
    );
  });

  it("loads workspaces in mock and api modes", async () => {
    const requests = [];
    const fetcher = async (url, init) => {
      requests.push({ url, init });

      return Response.json(mockWorkspaces);
    };

    assert.deepEqual(
      await createMockWorkspaceClient().listWorkspaces(),
      mockWorkspaces,
    );

    const apiClient = createWorkspaceApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher,
    });

    assert.deepEqual(await apiClient.listWorkspaces(), mockWorkspaces);
    assert.equal(requests[0].url, "https://api.pilo.dev/api/workspaces");
    assert.equal(requests[0].init.credentials, "include");
    assertLocalActorHeaders(requests[0]);

    assert.deepEqual(
      await createWorkspaceClient({
        mode: "mock",
        mock: { workspaces: [] },
      }).listWorkspaces(),
      [],
    );

    await assert.rejects(
      createWorkspaceApiClient({
        baseUrl: "https://api.pilo.dev",
        fetcher: async () => new Response(null, { status: 401 }),
      }).listWorkspaces(),
      (error) =>
        error instanceof WorkspaceApiError &&
        error.status === 401 &&
        error.path === "/api/workspaces",
    );
  });

  it("gates local MVP actor headers outside explicit local mode", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousMode = process.env.NEXT_PUBLIC_PILO_LOCAL_ACTOR_MODE;

    try {
      process.env.NODE_ENV = "test";
      delete process.env.NEXT_PUBLIC_PILO_LOCAL_ACTOR_MODE;
      assert.equal(isLocalMvpActorEnabled(), true);
      assert.deepEqual(localMvpActorHeaders(), {
        "x-user-id": LOCAL_MVP_USER_ID,
        "x-member-id": LOCAL_MVP_MEMBER_ID,
      });

      process.env.NODE_ENV = "production";
      assert.equal(isLocalMvpActorEnabled(), false);
      assert.deepEqual(localMvpActorHeaders(), {});

      process.env.NEXT_PUBLIC_PILO_LOCAL_ACTOR_MODE = "enabled";
      assert.equal(isLocalMvpActorEnabled(), true);
      assert.deepEqual(localMvpActorHeaders(), {
        "x-user-id": LOCAL_MVP_USER_ID,
        "x-member-id": LOCAL_MVP_MEMBER_ID,
      });

      process.env.NEXT_PUBLIC_PILO_LOCAL_ACTOR_MODE = "disabled";
      assert.equal(isLocalMvpActorEnabled(), false);
      assert.deepEqual(localMvpActorHeaders(), {});
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }

      if (previousMode === undefined) {
        delete process.env.NEXT_PUBLIC_PILO_LOCAL_ACTOR_MODE;
      } else {
        process.env.NEXT_PUBLIC_PILO_LOCAL_ACTOR_MODE = previousMode;
      }
    }
  });

  it("loads workspace dashboard data in mock and api modes", async () => {
    const workspaceId = mockWorkspaces[0].id;
    const dashboardFixture = createWorkspaceDashboardFixture(workspaceId);
    const requests = [];
    const fetcher = async (url, init) => {
      requests.push({ url, init });

      return Response.json(dashboardFixture);
    };

    const mockResult =
      await createMockWorkspaceDashboardClient().getDashboard(workspaceId);
    assert.equal(mockResult.dashboard.workspace.id, workspaceId);
    assert.equal(mockResult.dashboard.source, "fixture");
    assert.equal(mockResult.dashboard.tasks[0].workspaceId, workspaceId);

    const apiResult = await createWorkspaceDashboardApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher,
    }).getDashboard(workspaceId);

    assert.equal(
      requests[0].url,
      `https://api.pilo.dev/api/workspaces/${workspaceId}/dashboard`,
    );
    assert.equal(requests[0].init.credentials, "include");
    assertLocalActorHeaders(requests[0]);
    assert.equal(apiResult.dashboard.workspace.id, workspaceId);
    assert.equal(
      apiResult.dashboard.tasks.length,
      dashboardFixture.tasks.length,
    );

    assert.equal(resolveWorkspaceDashboardClientMode("api"), "api");
    assert.equal(resolveWorkspaceDashboardClientMode("fixture"), "mock");
    assert.equal(
      (
        await createWorkspaceDashboardClient({
          mode: "mock",
        }).getDashboard(workspaceId)
      ).dashboard.workspace.id,
      workspaceId,
    );

    const mismatchedDashboard = normalizeWorkspaceDashboard(
      {
        ...dashboardFixture,
        workspace: {
          ...dashboardFixture.workspace,
          id: "99999999-9999-4999-8999-999999999999",
        },
      },
      { workspaceId },
    );

    assert.equal(mismatchedDashboard.dashboard.workspace.id, workspaceId);
    assert.equal(
      mismatchedDashboard.warnings.includes("workspace_id_mismatch"),
      true,
    );
  });

  it("keeps frontend dashboard fixture sections aligned with the contract fixture", () => {
    assert.deepEqual(
      Object.keys(workspaceDashboardFixture).sort(),
      Object.keys(contractWorkspaceDashboardFixture).sort(),
    );

    for (const section of [
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
    ]) {
      assert.equal(Array.isArray(workspaceDashboardFixture[section]), true);
      assert.equal(
        Array.isArray(contractWorkspaceDashboardFixture[section]),
        true,
      );
    }
  });

  it("normalizes partial dashboard payloads into quiet fallback sections", () => {
    const workspaceId = mockWorkspaces[0].id;
    const { dashboard, warnings } = normalizeWorkspaceDashboard(
      {
        workspace: mockWorkspaces[0],
        tasks: "not-an-array",
        progress: "not-an-object",
        source: "fixture",
      },
      { workspaceId },
    );

    assert.equal(dashboard.workspace.id, workspaceId);
    assert.deepEqual(dashboard.tasks, []);
    assert.deepEqual(dashboard.pullRequests, []);
    assert.equal(dashboard.progress, null);
    assert.equal(warnings.includes("tasks_missing"), true);
    assert.equal(warnings.includes("pullRequests_missing"), true);
    assert.equal(warnings.includes("progress_invalid"), true);
    assert.equal(warnings.includes("currentMember_missing"), true);
    assert.equal(warnings.includes("preferences_missing"), true);
  });

  it("resolves current workspace from URL before stored state", () => {
    const workspaces = [
      mockWorkspaces[0],
      {
        ...mockWorkspaces[0],
        id: "33333333-3333-4333-8333-333333333333",
        name: "Second Workspace",
      },
    ];
    const selection = resolveCurrentWorkspaceSelection({
      workspaces,
      urlWorkspaceId: workspaces[1].id,
      storedWorkspaceId: workspaces[0].id,
    });

    assert.equal(
      extractWorkspaceIdFromPathname(`/workspaces/${workspaces[1].id}`),
      workspaces[1].id,
    );
    assert.equal(selection.status, "selected");
    assert.equal(selection.source, "url");
    assert.equal(selection.workspace.id, workspaces[1].id);
    assert.equal(selection.shouldPersist, true);
    assert.equal(selection.shouldReplaceRoute, false);
  });

  it("falls back to stored or default workspace when URL has no workspace id", () => {
    const workspaces = [
      mockWorkspaces[0],
      {
        ...mockWorkspaces[0],
        id: "33333333-3333-4333-8333-333333333333",
        name: "Second Workspace",
      },
    ];
    const storedSelection = resolveCurrentWorkspaceSelection({
      workspaces,
      storedWorkspaceId: workspaces[1].id,
    });
    const defaultSelection = resolveCurrentWorkspaceSelection({
      workspaces,
      storedWorkspaceId: "missing-workspace",
    });

    assert.equal(storedSelection.source, "storage");
    assert.equal(storedSelection.workspace.id, workspaces[1].id);
    assert.equal(storedSelection.shouldReplaceRoute, true);
    assert.equal(defaultSelection.source, "default");
    assert.equal(defaultSelection.workspace.id, workspaces[0].id);
    assert.equal(defaultSelection.shouldPersist, true);
    assert.equal(
      workspaceDashboardHref(workspaces[0].id),
      `/workspaces/${workspaces[0].id}`,
    );
    assert.equal(
      workspaceCanvasHref(workspaces[0].id),
      `/workspaces/${workspaces[0].id}/canvas`,
    );
    assert.equal(
      workspaceTasksHref(workspaces[0].id),
      `/workspaces/${workspaces[0].id}/tasks`,
    );
    assert.equal(
      workspaceGithubHref(workspaces[0].id),
      `/workspaces/${workspaces[0].id}/github`,
    );
    assert.equal(
      workspaceMeetingsHref(workspaces[0].id),
      `/workspaces/${workspaces[0].id}/meetings`,
    );
    assert.equal(
      workspaceReviewsHref(workspaces[0].id),
      `/workspaces/${workspaces[0].id}/reviews`,
    );
    assert.equal(
      workspaceAgentHref(workspaces[0].id),
      `/workspaces/${workspaces[0].id}/agent`,
    );
    assert.equal(
      workspacePlanningHref(workspaces[0].id),
      `/workspaces/${workspaces[0].id}/planning`,
    );

    const routes = buildWorkspaceFeatureRoutes(workspaces[0].id);
    assert.deepEqual(Object.keys(routes), [
      "dashboard",
      "canvas",
      "tasks",
      "github",
      "meetings",
      "reviews",
      "agent",
      "planning",
    ]);
    assert.deepEqual(routes, {
      dashboard: workspaceDashboardHref(workspaces[0].id),
      canvas: workspaceCanvasHref(workspaces[0].id),
      tasks: workspaceTasksHref(workspaces[0].id),
      github: workspaceGithubHref(workspaces[0].id),
      meetings: workspaceMeetingsHref(workspaces[0].id),
      reviews: workspaceReviewsHref(workspaces[0].id),
      agent: workspaceAgentHref(workspaces[0].id),
      planning: workspacePlanningHref(workspaces[0].id),
    });

    const tabs = buildWorkspaceFeatureTabs(workspaces[0].id, {
      active: "github",
      badges: { tasks: 2, github: 3 },
    });

    assert.deepEqual(
      tabs.map((tab) => tab.key),
      Object.keys(routes),
    );
    assert.equal(tabs.find((tab) => tab.key === "github").active, true);
    assert.equal(tabs.find((tab) => tab.key === "tasks").badge, "2");
    assert.equal(tabs.find((tab) => tab.key === "github").badge, "3");
    assert.equal(
      tabs.every((tab) => tab.href === routes[tab.key]),
      true,
    );
  });

  it("wires workspace dashboard tabs to implemented feature pages", () => {
    const workspaceId = mockWorkspaces[0].id;
    const routes = buildWorkspaceFeatureRoutes(workspaceId);
    const tabs = buildWorkspaceFeatureTabs(workspaceId);

    assert.deepEqual(
      tabs.map((tab) => tab.href),
      Object.values(routes),
    );

    const sidebar = readFileSync(
      "components/workspace/WorkspaceSidebar.tsx",
      "utf8",
    );
    assert.match(sidebar, /href={item\.href}/);
    assert.match(sidebar, /aria-current={item\.active/);

    const dashboard = readFileSync(
      "components/workspace/WorkspaceDashboard.tsx",
      "utf8",
    );
    assert.match(dashboard, /dashboard-feature-links/);
    assert.match(dashboard, /href={feature\.href}/);
    assert.match(dashboard, /createNotificationClient/);
    assert.match(dashboard, /workspace-notifications/);
    assert.match(dashboard, /notification-list/);
    assert.match(dashboard, /markNotificationRead/);
    assert.match(dashboard, /markWorkspaceNotificationsRead/);
    assert.match(dashboard, /dashboard_fixture_source/);

    for (const featureKey of [
      "canvas",
      "tasks",
      "github",
      "meetings",
      "reviews",
      "agent",
      "planning",
    ]) {
      assert.match(dashboard, new RegExp(`href: routes\\.${featureKey}`));
    }

    const workspacePages = {
      dashboard: {
        file: "app/workspaces/[workspaceId]/page.tsx",
        component: /<WorkspaceDashboard workspaceId={params\.workspaceId} \/>/,
      },
      canvas: {
        file: "app/workspaces/[workspaceId]/canvas/page.tsx",
        component: /<WorkspaceCanvasBoards \/>/,
      },
      tasks: {
        file: "app/workspaces/[workspaceId]/tasks/page.tsx",
        component: /<WorkspaceTasks \/>/,
      },
      github: {
        file: "app/workspaces/[workspaceId]/github/page.tsx",
        component: /<WorkspaceGithub \/>/,
      },
      meetings: {
        file: "app/workspaces/[workspaceId]/meetings/page.tsx",
        component: /<WorkspaceMeetings \/>/,
      },
      reviews: {
        file: "app/workspaces/[workspaceId]/reviews/page.tsx",
        component: /<ReviewRoomWorkspace workspaceId={params\.workspaceId} \/>/,
      },
      agent: {
        file: "app/workspaces/[workspaceId]/agent/page.tsx",
        component:
          /<AgentPlanningWorkspace workspaceId={params\.workspaceId} \/>/,
      },
      planning: {
        file: "app/workspaces/[workspaceId]/planning/page.tsx",
        component:
          /<AgentPlanningWorkspace workspaceId={params\.workspaceId} \/>/,
      },
    };

    for (const tab of tabs) {
      assert.equal(Boolean(workspacePages[tab.key]), true);
      assert.match(
        readFileSync(workspacePages[tab.key].file, "utf8"),
        workspacePages[tab.key].component,
      );
    }

    for (const file of [
      "components/workspace/WorkspaceDashboard.tsx",
      "components/task/WorkspaceTasks.tsx",
      "components/github/WorkspaceGithub.tsx",
      "components/meeting/WorkspaceMeetings.tsx",
      "components/workspace/WorkspaceCanvasBoards.tsx",
      "components/workspace/WorkspaceCanvas.tsx",
      "components/agent/AgentPlanningWorkspace.tsx",
      "components/review/ReviewRoomWorkspace.tsx",
    ]) {
      assert.match(readFileSync(file, "utf8"), /<WorkspaceSidebar/);
    }

    const meetings = readFileSync(
      "components/meeting/WorkspaceMeetings.tsx",
      "utf8",
    );
    assert.match(meetings, /navigator\.mediaDevices\?\.getUserMedia/);
    assert.match(meetings, /new MediaRecorder/);
    assert.match(meetings, /Start browser recording/);
    assert.match(meetings, /Stop and submit recording/);
    assert.match(meetings, /submitAudioChunk/);
  });

  it("keeps API-mode workspace routes and Canvas failures from falling back to fixtures silently", () => {
    const dashboardPage = readFileSync(
      "app/workspaces/[workspaceId]/page.tsx",
      "utf8",
    );
    const dashboard = readFileSync(
      "components/workspace/WorkspaceDashboard.tsx",
      "utf8",
    );
    const planning = readFileSync(
      "components/agent/AgentPlanningWorkspace.tsx",
      "utf8",
    );
    const canvas = readFileSync(
      "components/workspace/WorkspaceCanvas.tsx",
      "utf8",
    );

    assert.match(
      dashboardPage,
      /<WorkspaceDashboard workspaceId={params\.workspaceId} \/>/,
    );
    assert.match(
      dashboard,
      /routeWorkspaceId \?\? extractWorkspaceIdFromPathname/,
    );
    assert.match(
      planning,
      /routeWorkspaceId \?\? extractWorkspaceIdFromPathname/,
    );
    assert.match(canvas, /canvasMode === "api"[\s\S]*status: "error"/);
    assert.match(canvas, /Canvas could not be loaded/);
    assert.doesNotMatch(
      canvas,
      /\.catch\(\(\) => \{\s*writeCanvasStorage\("shape-state"/,
    );
    assert.doesNotMatch(
      canvas,
      /\.catch\(\(\) => \{\s*writeCanvasStorage\("view-setting"/,
    );
    assert.doesNotMatch(
      canvas,
      /\.catch\(\(\) => \{\s*writeCanvasStorage\("filter-setting"/,
    );
  });

  it("keeps workspace routes server-renderable for runtime workspace ids", () => {
    const nextConfig = readFileSync("next.config.js", "utf8");
    assert.doesNotMatch(nextConfig, /output:\s*["']export["']/);

    for (const routeFile of [
      "app/workspaces/[workspaceId]/page.tsx",
      "app/workspaces/[workspaceId]/canvas/page.tsx",
      "app/workspaces/[workspaceId]/canvas/[boardId]/page.tsx",
      "app/workspaces/[workspaceId]/tasks/page.tsx",
      "app/workspaces/[workspaceId]/github/page.tsx",
      "app/workspaces/[workspaceId]/meetings/page.tsx",
      "app/workspaces/[workspaceId]/reviews/page.tsx",
      "app/workspaces/[workspaceId]/agent/page.tsx",
      "app/workspaces/[workspaceId]/planning/page.tsx",
    ]) {
      const route = readFileSync(routeFile, "utf8");

      assert.doesNotMatch(route, /dynamicParams\s*=\s*false/);
    }
  });

  it("does not silently use stored workspace when URL workspace is invalid", () => {
    const selection = resolveCurrentWorkspaceSelection({
      workspaces: mockWorkspaces,
      urlWorkspaceId: "missing-workspace",
      storedWorkspaceId: mockWorkspaces[0].id,
    });

    assert.equal(selection.status, "url_not_found");
    assert.equal(selection.workspace, null);
    assert.equal(selection.invalidWorkspaceId, "missing-workspace");
    assert.equal(selection.fallbackWorkspace.id, mockWorkspaces[0].id);
    assert.equal(selection.shouldPersist, false);
  });

  it("reads and writes the current workspace id in storage", () => {
    const storage = new Map();
    const mockStorage = {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    };

    writeStoredWorkspaceId(mockWorkspaces[0].id, mockStorage);

    assert.equal(
      storage.get(CURRENT_WORKSPACE_STORAGE_KEY),
      mockWorkspaces[0].id,
    );
    assert.equal(readStoredWorkspaceId(mockStorage), mockWorkspaces[0].id);

    const blockedStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };

    assert.equal(readStoredWorkspaceId(blockedStorage), null);
    assert.doesNotThrow(() =>
      writeStoredWorkspaceId(mockWorkspaces[0].id, blockedStorage),
    );
  });

  it("keeps Auth frontend contracts aligned with the public schema", () => {
    const defs = contractSchema.$defs;

    assert.deepEqual(defs.AuthProvider.enum, ["google", "github"]);
    assert.deepEqual([...defs.CurrentUser.required].sort(), [
      "avatarUrl",
      "email",
      "id",
      "lastLoginAt",
      "name",
      "providers",
    ]);
    assert.equal(
      defs.CurrentUser.properties.providers.items.$ref,
      "#/$defs/AuthProvider",
    );
    assert.equal(defs.AuthSessionState.oneOf.length, 2);
    assert.equal(
      defs.AuthSessionState.oneOf.some(
        (branch) => branch.properties?.user?.$ref === "#/$defs/CurrentUser",
      ),
      true,
    );
    assert.equal(
      defs.AuthSessionState.oneOf.some(
        (branch) => branch.properties?.user?.type === "null",
      ),
      true,
    );
    assert.equal(
      defs.AuthProvidersResponse.properties.providers.items.$ref,
      "#/$defs/AuthProviderSummary",
    );
    assert.equal(defs.AuthErrorResponse.properties.statusCode.enum[0], 401);
  });

  it("keeps dashboard frontend contracts aligned with the public schema", () => {
    const dashboard = contractSchema.$defs.WorkspaceDashboardReadModel;

    assert.deepEqual(
      sortContractKeys(dashboard.required),
      sortContractKeys([
        "agentActions",
        "canvasEntities",
        "currentMember",
        "generatedAt",
        "githubIssues",
        "meetingReports",
        "members",
        "preferences",
        "progress",
        "prAnalyses",
        "pullRequests",
        "source",
        "tasks",
        "workspace",
      ]),
    );
    assert.equal(
      dashboard.properties.workspace.$ref,
      "#/$defs/WorkspaceSummary",
    );
    assert.equal(
      dashboard.properties.currentMember.$ref,
      "#/$defs/CurrentWorkspaceMember",
    );
    assert.equal(
      dashboard.properties.preferences.$ref,
      "#/$defs/DashboardPreferences",
    );
    assert.equal(dashboard.properties.tasks.items.$ref, "#/$defs/TaskSummary");
    assert.equal(
      dashboard.properties.pullRequests.items.$ref,
      "#/$defs/PullRequestSummary",
    );
    assert.deepEqual(dashboard.properties.source.enum, [
      "fixture",
      "empty",
      "mixed",
    ]);
  });

  it("keeps Canvas board detail fixture aligned with the public schema", () => {
    const defs = contractSchema.$defs;
    const boardDetail = defs.CanvasBoardDetail;

    assert.deepEqual(Object.keys(contractCanvasBoardDetailFixture).sort(), [
      "boardType",
      "connectionCount",
      "connections",
      "filterSetting",
      "id",
      "shapeCount",
      "shapes",
      "title",
      "updatedAt",
      "viewSetting",
      "workspaceId",
    ]);
    assert.deepEqual(
      Object.keys(contractCanvasBoardDetailFixture).sort(),
      Object.keys(boardDetail.properties).sort(),
    );
    assert.equal(
      boardDetail.properties.shapes.items.$ref,
      "#/$defs/CanvasShapeSummary",
    );
    assert.equal(
      boardDetail.properties.connections.items.$ref,
      "#/$defs/CanvasConnectionSummary",
    );
    assert.equal(
      boardDetail.properties.viewSetting.$ref,
      "#/$defs/CanvasViewSetting",
    );
    assert.equal(
      boardDetail.properties.filterSetting.$ref,
      "#/$defs/CanvasFilterSetting",
    );
  });

  it("uses the PILO app server URL and safe next path for login providers", () => {
    const previousBaseUrl = process.env.NEXT_PUBLIC_PILO_APP_SERVER_URL;
    process.env.NEXT_PUBLIC_PILO_APP_SERVER_URL = "https://api.pilo.dev/";

    try {
      assert.equal(
        authProviderHref("/api/auth/google/start", {
          next: "/canvas?filter=task",
        }),
        "https://api.pilo.dev/api/auth/google/start?next=%2Fcanvas%3Ffilter%3Dtask",
      );
      assert.equal(
        authProviderHref("/api/auth/github/start", {
          baseUrl: "",
          next: "https://evil.example",
        }),
        "/api/auth/github/start?next=%2F",
      );
    } finally {
      if (previousBaseUrl === undefined) {
        delete process.env.NEXT_PUBLIC_PILO_APP_SERVER_URL;
      } else {
        process.env.NEXT_PUBLIC_PILO_APP_SERVER_URL = previousBaseUrl;
      }
    }
  });

  it("routes a successful OAuth callback back through the login transition", () => {
    const state = resolveOAuthCallbackState({
      next: "/workspaces/demo",
      provider: "github",
      status: "success",
    });

    assert.equal(state.kind, "success");
    assert.equal(state.provider, "github");
    assert.equal(state.redirectTo, "/workspaces/demo");
    assert.equal(
      state.loginHref,
      "/login?auth=success&provider=github&next=%2Fworkspaces%2Fdemo",
    );
  });

  it("routes OAuth callback errors back to the login card", () => {
    const state = resolveOAuthCallbackState({
      error: "access_denied",
      next: "/workspaces/demo",
      provider: "google",
    });

    assert.equal(state.kind, "error");
    assert.equal(state.providerLabel, "Google");
    assert.equal(state.errorCode, "access_denied");
    assert.equal(
      state.loginHref,
      "/login?auth=error&provider=google&error=access_denied&next=%2Fworkspaces%2Fdemo",
    );
    assert.equal(state.retryHref, "/login");
  });

  it("keeps OAuth callback redirects inside the app", () => {
    assert.equal(normalizeCallbackRedirect("https://evil.example"), "/");
    assert.equal(normalizeCallbackRedirect("//evil.example"), "/");
    assert.equal(normalizeCallbackRedirect("/canvas"), "/canvas");
  });

  it("keeps the mock auth session aligned with the CurrentUser contract", async () => {
    const authClient = createMockAuthClient();
    const session = await authClient.getAuthSession();

    assert.equal(session.authenticated, true);
    assert.equal(session.user.id, mockCurrentUser.id);
    assert.equal(session.user.email, "donghyun@example.com");
    assert.deepEqual(session.user.providers, ["google", "github"]);
  });

  it("marks the mock auth session as signed out after logout", async () => {
    const authClient = createMockAuthClient();

    await authClient.logout();

    assert.equal(await authClient.getCurrentUser(), null);
    assert.deepEqual(await authClient.getAuthSession(), {
      authenticated: false,
      user: null,
    });
  });

  it("supports persistent mock sign-out state for protected route checks", async () => {
    const storage = new Map();
    const mockStorage = {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      removeItem(key) {
        storage.delete(key);
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    };

    markMockAuthSignedOut(mockStorage);

    assert.equal(
      await createMockAuthClient({ storage: mockStorage }).getCurrentUser(),
      null,
    );

    markMockAuthSignedIn(mockStorage);

    assert.equal(
      (await createMockAuthClient({ storage: mockStorage }).getCurrentUser())
        .email,
      mockCurrentUser.email,
    );
  });

  it("classifies protected auth routes without guarding login", () => {
    assert.equal(isProtectedPath("/"), true);
    assert.equal(isProtectedPath("/dashboard"), true);
    assert.equal(isProtectedPath("/workspaces/demo"), true);
    assert.equal(isProtectedPath("/canvas"), true);
    assert.equal(isProtectedPath("/login"), false);
    assert.equal(isProtectedPath("/login/callback"), false);
  });

  it("creates safe login redirect hrefs for protected pages", () => {
    assert.equal(createLoginRedirectHref("/"), "/login?next=%2F");
    assert.equal(
      createLoginRedirectHref("/canvas?filter=task"),
      "/login?next=%2Fcanvas%3Ffilter%3Dtask",
    );
    assert.equal(safeNextPath("https://evil.example"), "/");
    assert.equal(safeNextPath("//evil.example"), "/");
  });

  it("builds auth API URLs from a configured app server base URL", () => {
    assert.throws(
      () => buildAuthApiUrl("/api/auth/me", ""),
      /Auth API base URL is required/,
    );
    assert.equal(
      buildAuthApiUrl("/api/auth/logout", "https://api.pilo.dev/"),
      "https://api.pilo.dev/api/auth/logout",
    );
  });

  it("keeps mock auth storage safe when Web Storage is blocked", async () => {
    const blockedStorage = {
      getItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };

    assert.doesNotThrow(() => markMockAuthSignedOut(blockedStorage));
    assert.doesNotThrow(() => markMockAuthSignedIn(blockedStorage));

    const authClient = createMockAuthClient({ storage: blockedStorage });

    assert.equal(
      (await authClient.getCurrentUser()).email,
      mockCurrentUser.email,
    );
  });

  it("calls the auth API client with contract routes and credentials", async () => {
    const requests = [];
    const fetcher = async (url, init) => {
      requests.push({ url, init });

      if (url.endsWith("/api/auth/me")) {
        return Response.json(mockCurrentUser);
      }

      return new Response(null, { status: 204 });
    };
    const authClient = createAuthApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher,
    });

    const user = await authClient.getCurrentUser();
    await authClient.logout();

    assert.equal(user.email, mockCurrentUser.email);
    assert.equal(requests[0].url, "https://api.pilo.dev/api/auth/me");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[1].url, "https://api.pilo.dev/api/auth/logout");
    assert.equal(requests[1].init.method, "POST");
    assert.equal(requests[1].init.credentials, "include");
  });

  it("keeps mock and api auth client modes explicitly testable", async () => {
    const previousMode = process.env.NEXT_PUBLIC_PILO_AUTH_MODE;
    const requests = [];
    const fetcher = async (url, init) => {
      requests.push({ url, init });

      if (url.endsWith("/api/auth/me")) {
        return Response.json(mockCurrentUser);
      }

      return new Response(null, { status: 204 });
    };

    try {
      const mockClient = createAuthClient({
        mode: "mock",
        mock: { currentUser: null },
      });

      assert.deepEqual(await mockClient.getAuthSession(), {
        authenticated: false,
        user: null,
      });

      process.env.NEXT_PUBLIC_PILO_AUTH_MODE = "api";

      const apiClient = createAuthClient({
        baseUrl: "https://api.pilo.dev",
        fetcher,
      });
      const apiSession = await apiClient.getAuthSession();
      await apiClient.logout();

      assert.equal(apiSession.authenticated, true);
      assert.equal(apiSession.user.email, mockCurrentUser.email);
      assert.equal(requests[0].url, "https://api.pilo.dev/api/auth/me");
      assert.equal(requests[0].init.credentials, "include");
      assert.equal(requests[1].url, "https://api.pilo.dev/api/auth/logout");
      assert.equal(requests[1].init.method, "POST");
    } finally {
      if (previousMode === undefined) {
        delete process.env.NEXT_PUBLIC_PILO_AUTH_MODE;
      } else {
        process.env.NEXT_PUBLIC_PILO_AUTH_MODE = previousMode;
      }
    }
  });

  it("calls Task API client with MVP route contracts", async () => {
    const workspaceId = mockWorkspaces[0].id;
    const requests = [];
    const fetcher = async (url, init = {}) => {
      requests.push({ url, init });

      if (url.endsWith(`/workspaces/${workspaceId}/tasks`) && !init.method) {
        return Response.json([]);
      }

      if (url.endsWith(`/workspaces/${workspaceId}/task-drafts`)) {
        return Response.json([
          {
            id: "draft-1",
            workspaceId,
            title: "Draft task",
            status: "draft",
            priority: "medium",
            taskId: null,
          },
        ]);
      }

      if (url.endsWith(`/workspaces/${workspaceId}/progress/summary`)) {
        return Response.json({
          workspaceId,
          totalTasks: 1,
          doneTasks: 0,
          blockedTasks: 0,
          reviewTasks: 0,
          delayedTasks: 0,
          progressRate: 0,
        });
      }

      if (url.endsWith(`/workspaces/${workspaceId}/progress/history`)) {
        return Response.json([]);
      }

      return Response.json({
        id: url.includes("task-drafts") ? "draft-1" : "task-1",
        workspaceId,
        title: "Task",
        status: "todo",
        priority: "medium",
        taskId: null,
      });
    };

    assert.equal(buildTaskApiUrl("/api/tasks/task-1", ""), "/api/tasks/task-1");
    assert.equal(resolveTaskClientMode("api"), "api");
    assert.equal(resolveTaskClientMode("fixture"), "mock");

    const mockClient = createMockTaskClient();
    const createdMockTask = await mockClient.createTask(workspaceId, {
      title: "Mock Task",
      priority: "high",
    });
    assert.equal(createdMockTask.workspaceId, workspaceId);
    assert.equal(
      (await createTaskClient({ mode: "mock" }).listTasks(workspaceId)).length >
        0,
      true,
    );

    const apiClient = createTaskApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher,
    });

    await apiClient.listTasks(workspaceId);
    await apiClient.createTask(workspaceId, {
      title: "Task",
      priority: "medium",
    });
    await apiClient.updateTaskStatus("task-1", "in_review");
    await apiClient.listTaskDrafts(workspaceId);
    await apiClient.approveTaskDraft("draft-1");
    await apiClient.rejectTaskDraft("draft-1");
    await apiClient.getProgressSummary(workspaceId);
    await apiClient.listProgressHistory(workspaceId);

    assert.deepEqual(
      requests.map((request) => request.url),
      [
        `https://api.pilo.dev/api/workspaces/${workspaceId}/tasks`,
        `https://api.pilo.dev/api/workspaces/${workspaceId}/tasks`,
        "https://api.pilo.dev/api/tasks/task-1/status",
        `https://api.pilo.dev/api/workspaces/${workspaceId}/task-drafts`,
        "https://api.pilo.dev/api/task-drafts/draft-1/approve",
        "https://api.pilo.dev/api/task-drafts/draft-1/reject",
        `https://api.pilo.dev/api/workspaces/${workspaceId}/progress/summary`,
        `https://api.pilo.dev/api/workspaces/${workspaceId}/progress/history`,
      ],
    );
    assert.deepEqual(
      requests.map((request) => request.init.method ?? "GET"),
      ["GET", "POST", "PATCH", "GET", "POST", "POST", "GET", "GET"],
    );
    assertEveryRequestUsesLocalActor(requests);
  });

  it("calls GitHub API client with MVP route contracts", async () => {
    const workspaceId = mockWorkspaces[0].id;
    const repositoryId = "repo-1";
    const requests = [];
    const fetcher = async (url, init = {}) => {
      requests.push({ url, init });

      if (url.endsWith("/connections") && !init.method) {
        return Response.json([]);
      }

      if (url.endsWith("/connections") && init.method === "POST") {
        return Response.json({
          state: "state-1",
          installationUrl: "https://github.com/apps/pilo/installations/new",
        });
      }

      if (url.endsWith("/repositories")) {
        return Response.json([
          {
            id: repositoryId,
            workspaceId,
            owner: "example",
            repoName: "pilo",
            url: "https://github.com/example/pilo",
          },
        ]);
      }

      if (url.endsWith("/issues")) {
        return Response.json([]);
      }

      if (url.endsWith("/pull-requests")) {
        return Response.json([]);
      }

      return Response.json({});
    };

    assert.equal(
      buildGithubApiUrl("/api/workspaces/workspace/github/repositories", ""),
      "/api/workspaces/workspace/github/repositories",
    );
    assert.equal(resolveGithubClientMode("api"), "api");
    assert.equal(resolveGithubClientMode("fixture"), "mock");

    const mockGithubClient = createMockGithubClient();
    const mockRepositories =
      await mockGithubClient.listRepositories(workspaceId);
    assert.equal(mockRepositories[0].workspaceId, workspaceId);
    const mockIssue = await mockGithubClient.createIssueFromTask("task-1", {
      repositoryId: mockRepositories[0].id,
      title: "Create GitHub issue from Task",
      workspaceId,
    });
    assert.equal(mockIssue.linkedTaskId, "task-1");
    assert.equal(
      (
        await mockGithubClient.linkPullRequestToTask(
          createGithubFixture(workspaceId).pullRequests[0].id,
          "task-1",
          { workspaceId },
        )
      ).linkedTaskIds.includes("task-1"),
      true,
    );
    assert.equal(
      (await createGithubClient({ mode: "mock" }).listRepositories(workspaceId))
        .length > 0,
      true,
    );

    const apiClient = createGithubApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher,
    });

    await apiClient.listConnections(workspaceId);
    await apiClient.startConnection(workspaceId);
    await apiClient.listRepositories(workspaceId);
    await apiClient.listIssues(repositoryId);
    await apiClient.listPullRequests(repositoryId);
    await apiClient.createIssueFromTask("task-1", {
      repositoryId,
      title: "Create GitHub issue from Task",
    });
    await apiClient.linkIssueToTask("issue-1", "task-1");
    await apiClient.linkPullRequestToTask("pull-request-1", "task-1");

    assert.deepEqual(
      requests.map((request) => request.url),
      [
        `https://api.pilo.dev/api/workspaces/${workspaceId}/github/connections`,
        `https://api.pilo.dev/api/workspaces/${workspaceId}/github/connections`,
        `https://api.pilo.dev/api/workspaces/${workspaceId}/github/repositories`,
        `https://api.pilo.dev/api/repositories/${repositoryId}/issues`,
        `https://api.pilo.dev/api/repositories/${repositoryId}/pull-requests`,
        "https://api.pilo.dev/api/tasks/task-1/github-issues",
        "https://api.pilo.dev/api/github/issues/issue-1/link-task",
        "https://api.pilo.dev/api/github/pull-requests/pull-request-1/link-task",
      ],
    );
    assert.deepEqual(
      requests.map((request) => request.init.method ?? "GET"),
      ["GET", "POST", "GET", "GET", "GET", "POST", "POST", "POST"],
    );
    assertEveryRequestUsesLocalActor(requests);
  });

  it("calls Review API client with GitHub PR selector contracts", async () => {
    const workspaceId = mockWorkspaces[0].id;
    const repositoryId = "repo-review-1";
    const pullRequest = {
      id: "66666666-6666-4666-8666-666666666661",
      repositoryId,
      number: 14,
      title: "Wire review room to GitHub PR",
      authorLogin: "reviewer",
      state: "review_requested",
      branch: "feature/review-room",
      baseBranch: "dev",
      url: "https://github.com/example/pilo/pull/14",
      changedFilesCount: 5,
      additions: 120,
      deletions: 24,
      linkedTaskIds: ["task-1"],
      syncedAt: "2026-06-30T00:00:00.000Z",
    };
    const analysisId = "88888888-8888-4888-8888-888888888881";
    const pendingAnalysis = {
      id: analysisId,
      pullRequestId: pullRequest.id,
      purposeSummary: null,
      impactSummary: null,
      testRecommendation: null,
      riskLevel: "low",
      analysisStatus: "pending",
      okCount: 0,
      discussCount: 0,
      riskCount: 0,
      conclusion: null,
    };
    const pendingCanvas = {
      id: `pending-review-graph-${analysisId}`,
      analysisId,
      pullRequestId: pullRequest.id,
      summary: null,
      intentSummary:
        "Analysis is pending. The review graph will be populated after analyzer output arrives.",
      reviewStrategy:
        "Keep the review canvas available with no nodes until analysis results are written.",
      reviewOrder: [],
      nodes: [],
      edges: [],
    };
    const changedFile = {
      id: "88888888-8888-4888-8888-8888888888b1",
      analysisId,
      filePath: "apps/frontend/components/review/ReviewRoomWorkspace.tsx",
      changeType: "modified",
      additions: 24,
      deletions: 6,
      summary: "Loads changed files from the Review API.",
      functions: [
        {
          id: "88888888-8888-4888-8888-8888888888c1",
          changedFileId: "88888888-8888-4888-8888-8888888888b1",
          name: "openPullRequest",
          changeType: "modified",
          summary: "Passes the analysis id to the changed-files API.",
        },
      ],
    };
    const checklistItem = {
      id: "review-checklist-1",
      analysisId,
      checklistType: "review",
      title: "Review risky nodes",
      status: "todo",
      checkedByMemberId: null,
      checkedAt: null,
      sortOrder: 0,
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    };
    const reviewComment = {
      id: "review-comment-1",
      roomId: "88888888-8888-4888-8888-888888888811",
      authorMemberId: "member-1",
      nodeId: null,
      changedFileId: null,
      changedFunctionId: null,
      body: "Check the review room API path.",
      createdAt: "2026-06-30T00:00:00.000Z",
    };
    const requests = [];
    const fetcher = async (url, init = {}) => {
      requests.push({ url, init });

      if (url.endsWith(`/workspaces/${workspaceId}/github/repositories`)) {
        return Response.json([
          {
            id: repositoryId,
            workspaceId,
            owner: "example",
            repoName: "pilo",
            url: "https://github.com/example/pilo",
          },
        ]);
      }

      if (url.endsWith(`/repositories/${repositoryId}/pull-requests`)) {
        return Response.json([pullRequest]);
      }

      if (url.endsWith(`/pull-requests/${pullRequest.id}/review-room`)) {
        return Response.json({
          id: "88888888-8888-4888-8888-888888888811",
          workspaceId,
          pullRequestId: pullRequest.id,
          status: "open",
          createdByMemberId: "member-1",
          createdAt: "2026-06-30T00:00:00.000Z",
          updatedAt: "2026-06-30T00:00:00.000Z",
          pullRequest: JSON.parse(init.body).pullRequest,
        });
      }

      if (url.endsWith(`/pull-requests/${pullRequest.id}/analysis`)) {
        return Response.json(pendingAnalysis);
      }

      if (url.endsWith(`/pull-request-analyses/${analysisId}/canvas`)) {
        return Response.json(pendingCanvas);
      }

      if (url.endsWith(`/pull-request-analyses/${analysisId}/changed-files`)) {
        return Response.json([changedFile]);
      }

      if (
        url.endsWith(`/pull-request-analyses/${analysisId}/checklist-items`)
      ) {
        return init.method === "POST"
          ? Response.json({
              ...checklistItem,
              ...JSON.parse(init.body),
            })
          : Response.json([checklistItem]);
      }

      if (url.endsWith(`/review-checklist-items/${checklistItem.id}`)) {
        return Response.json({
          ...checklistItem,
          ...JSON.parse(init.body),
        });
      }

      if (url.endsWith(`/code-review-rooms/${reviewComment.roomId}/comments`)) {
        return init.method === "POST"
          ? Response.json({
              ...reviewComment,
              ...JSON.parse(init.body),
            })
          : Response.json([reviewComment]);
      }

      return Response.json({});
    };

    assert.equal(
      buildReviewApiUrl("/api/code-review-rooms/room-1", ""),
      "/api/code-review-rooms/room-1",
    );
    assert.equal(resolveReviewClientMode("api"), "api");
    assert.equal(resolveReviewClientMode("fixture"), "mock");

    const mockReviewRoom = await createMockReviewClient().openReviewRoom(
      reviewFixture.pullRequests[0].id,
      { workspaceId },
    );
    assert.equal(mockReviewRoom.workspaceId, workspaceId);

    const apiClient = createReviewApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher,
    });
    const pullRequests = await apiClient.listPullRequests(workspaceId);
    const room = await apiClient.openReviewRoom(pullRequests[0].id, {
      workspaceId,
      memberId: "member-1",
      pullRequest: pullRequests[0],
    });
    const analysis = await apiClient.requestAnalysis(pullRequests[0].id);
    const canvas = await apiClient.getCanvas(analysis.id);
    const changedFiles = await apiClient.listChangedFiles(analysisId);
    const checklist = await apiClient.listChecklistItems(analysisId);
    const comments = await apiClient.listComments(room.id);
    const createdChecklistItem = await apiClient.createChecklistItem(
      analysisId,
      {
        checklistType: "review",
        title: "Review risky nodes",
        status: "todo",
        sortOrder: 1,
      },
    );
    const updatedChecklistItem = await apiClient.updateChecklistItem(
      checklistItem.id,
      {
        status: "done",
        checkedByMemberId: "member-1",
      },
    );
    const createdComment = await apiClient.createComment(room.id, {
      authorMemberId: "member-1",
      body: "Check the review room API path.",
    });

    assert.equal(pullRequests[0].id, pullRequest.id);
    assert.equal(room.pullRequest.title, pullRequest.title);
    assert.equal(analysis.analysisStatus, "pending");
    assert.equal(analysis.purposeSummary, null);
    assert.equal(analysis.impactSummary, null);
    assert.equal(analysis.testRecommendation, null);
    assert.equal(analysis.conclusion, null);
    assert.equal(canvas.pullRequestId, pullRequest.id);
    assert.deepEqual(canvas.nodes, []);
    assert.deepEqual(canvas.edges, []);
    assert.equal(changedFiles[0].filePath, changedFile.filePath);
    assert.equal(changedFiles[0].functions[0].name, "openPullRequest");
    assert.equal(checklist[0].id, checklistItem.id);
    assert.equal(comments[0].id, reviewComment.id);
    assert.equal(createdChecklistItem.sortOrder, 1);
    assert.equal(updatedChecklistItem.status, "done");
    assert.equal(createdComment.body, reviewComment.body);
    assert.deepEqual(
      requests.map((request) => request.url),
      [
        `https://api.pilo.dev/api/workspaces/${workspaceId}/github/repositories`,
        `https://api.pilo.dev/api/repositories/${repositoryId}/pull-requests`,
        `https://api.pilo.dev/api/pull-requests/${pullRequest.id}/review-room`,
        `https://api.pilo.dev/api/pull-requests/${pullRequest.id}/analysis`,
        `https://api.pilo.dev/api/pull-request-analyses/${analysisId}/canvas`,
        `https://api.pilo.dev/api/pull-request-analyses/${analysisId}/changed-files`,
        `https://api.pilo.dev/api/pull-request-analyses/${analysisId}/checklist-items`,
        `https://api.pilo.dev/api/code-review-rooms/${room.id}/comments`,
        `https://api.pilo.dev/api/pull-request-analyses/${analysisId}/checklist-items`,
        `https://api.pilo.dev/api/review-checklist-items/${checklistItem.id}`,
        `https://api.pilo.dev/api/code-review-rooms/${room.id}/comments`,
      ],
    );
    assert.deepEqual(
      requests.map((request) => request.init.method ?? "GET"),
      [
        "GET",
        "GET",
        "POST",
        "POST",
        "GET",
        "GET",
        "GET",
        "GET",
        "POST",
        "PATCH",
        "POST",
      ],
    );
    assert.deepEqual(
      JSON.parse(requests[2].init.body).pullRequest,
      pullRequest,
    );
    assertLocalActorHeaders(requests[0]);
    assertLocalActorHeaders(requests[1]);
    assert.equal(requests[2].init.headers["x-user-id"], LOCAL_MVP_USER_ID);
    assert.equal(requests[2].init.headers["x-workspace-id"], workspaceId);
    assert.equal(requests[2].init.headers["x-member-id"], "member-1");
    assertLocalActorHeaders(requests[3]);
    assertLocalActorHeaders(requests[4]);
    assertLocalActorHeaders(requests[5]);
    assertLocalActorHeaders(requests[6]);
    assertLocalActorHeaders(requests[7]);
    assertLocalActorHeaders(requests[8]);
    assertLocalActorHeaders(requests[9]);
    assertLocalActorHeaders(requests[10]);
  });

  it("keeps Review API partial responses from inheriting fixture content", async () => {
    const workspaceId = mockWorkspaces[0].id;
    const repositoryId = "repo-review-partial";
    const pullRequestId = "pull-request-partial";
    const analysisId = "analysis-partial";
    const roomId = "room-partial";
    const requests = [];
    const fetcher = async (url, init = {}) => {
      requests.push({ url, init });

      if (url.endsWith(`/workspaces/${workspaceId}/github/repositories`)) {
        return Response.json([{ id: repositoryId, workspaceId }]);
      }

      if (url.endsWith(`/repositories/${repositoryId}/pull-requests`)) {
        return Response.json([
          {
            id: pullRequestId,
            repositoryId,
            number: 21,
            state: "open",
            url: "https://github.com/example/pilo/pull/21",
          },
        ]);
      }

      if (url.endsWith(`/pull-requests/${pullRequestId}/review-room`)) {
        return Response.json({
          id: roomId,
          workspaceId,
          pullRequestId,
          status: "open",
          createdByMemberId: null,
          createdAt: "2026-06-30T00:00:00.000Z",
          updatedAt: "2026-06-30T00:00:00.000Z",
        });
      }

      if (url.endsWith(`/pull-requests/${pullRequestId}/analysis`)) {
        return Response.json({
          id: analysisId,
          pullRequestId,
        });
      }

      if (url.endsWith(`/pull-request-analyses/${analysisId}/canvas`)) {
        return Response.json({
          id: "canvas-partial",
          analysisId,
          nodes: [{ id: "node-partial" }],
        });
      }

      if (url.endsWith(`/pull-request-analyses/${analysisId}/changed-files`)) {
        return Response.json({});
      }

      return Response.json([]);
    };

    const apiClient = createReviewApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher,
    });
    const pullRequests = await apiClient.listPullRequests(workspaceId);
    const room = await apiClient.openReviewRoom(pullRequests[0].id, {
      workspaceId,
      memberId: "member-1",
      pullRequest: pullRequests[0],
    });
    const analysis = await apiClient.requestAnalysis(pullRequests[0].id);
    const canvas = await apiClient.getCanvas(analysis.id);
    const changedFiles = await apiClient.listChangedFiles(analysis.id);

    assert.equal(pullRequests[0].title, "Untitled pull request");
    assert.notEqual(pullRequests[0].title, reviewFixture.pullRequests[0].title);
    assert.equal(room.pullRequest.title, "Untitled pull request");
    assert.equal(analysis.purposeSummary, null);
    assert.notEqual(
      analysis.purposeSummary,
      reviewFixture.analysis.purposeSummary,
    );
    assert.equal(canvas.intentSummary, "Analysis is pending.");
    assert.equal(canvas.nodes[0].label, "Review node");
    assert.notEqual(canvas.nodes[0].label, reviewFixture.canvas.nodes[0].label);
    assert.deepEqual(changedFiles, []);
    assert.deepEqual(
      requests.map((request) => request.init.method ?? "GET"),
      ["GET", "GET", "POST", "POST", "GET", "GET"],
    );
  });

  it("calls Notification API client with MVP route contracts", async () => {
    const workspaceId = mockWorkspaces[0].id;
    const notificationId = "notification-1";
    const notifications = createNotificationFixture(workspaceId);
    const requests = [];
    const fetcher = async (url, init = {}) => {
      requests.push({ url, init });

      if (url.endsWith(`/workspaces/${workspaceId}/notifications`)) {
        return Response.json(notifications);
      }

      if (url.endsWith(`/notifications/${notificationId}/read`)) {
        return Response.json({
          ...notifications[0],
          id: notificationId,
          readAt: "2026-06-30T01:00:00.000Z",
        });
      }

      if (url.endsWith(`/workspaces/${workspaceId}/notifications/read-all`)) {
        return Response.json({
          workspaceId,
          recipientUserId: notifications[0].recipientUserId,
          updatedCount: notifications.length,
          notifications: notifications.map((notification) => ({
            ...notification,
            readAt: "2026-06-30T01:00:00.000Z",
          })),
        });
      }

      return Response.json({});
    };

    assert.equal(
      buildNotificationApiUrl("/api/notifications/notification-1/read", ""),
      "/api/notifications/notification-1/read",
    );
    assert.equal(resolveNotificationClientMode("api"), "api");
    assert.equal(resolveNotificationClientMode("fixture"), "mock");

    const mockClient = createMockNotificationClient();
    const mockNotifications = await mockClient.listNotifications(workspaceId);
    assert.equal(mockNotifications.length, 3);
    assert.equal(
      mockNotifications.every((notification) => notification.readAt === null),
      true,
    );

    const mockRead = await mockClient.markNotificationRead(
      mockNotifications[0].id,
      { workspaceId },
    );
    assert.notEqual(mockRead.readAt, null);

    const mockReadAll = await createNotificationClient({
      mode: "mock",
    }).markWorkspaceNotificationsRead(workspaceId);
    assert.equal(
      mockReadAll.notifications.every(
        (notification) => notification.readAt !== null,
      ),
      true,
    );

    const apiClient = createNotificationApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher,
    });

    await apiClient.listNotifications(workspaceId);
    await apiClient.markNotificationRead(notificationId);
    await apiClient.markWorkspaceNotificationsRead(workspaceId);

    assert.deepEqual(
      requests.map((request) => request.url),
      [
        `https://api.pilo.dev/api/workspaces/${workspaceId}/notifications`,
        `https://api.pilo.dev/api/notifications/${notificationId}/read`,
        `https://api.pilo.dev/api/workspaces/${workspaceId}/notifications/read-all`,
      ],
    );
    assert.deepEqual(
      requests.map((request) => request.init.method ?? "GET"),
      ["GET", "PATCH", "PATCH"],
    );
    assert.equal(
      requests.every((request) => request.init.credentials === "include"),
      true,
    );
    assertEveryRequestUsesLocalActor(requests);
  });

  it("calls Meeting, Voice, and Agent API clients with MVP route contracts", async () => {
    const workspaceId = mockWorkspaces[0].id;
    const meetingId = "meeting-1";
    const reportId = "report-1";
    const actionItemId = "action-item-1";
    const voiceRoomId = "voice-room-1";
    const voiceSessionId = "voice-session-1";
    const runId = "agent-run-1";
    const actionId = "agent-action-1";
    const requests = [];
    const fetcher = async (url, init = {}) => {
      requests.push({ url, init });

      if (url.endsWith(`/workspaces/${workspaceId}/meetings`) && !init.method) {
        return Response.json([]);
      }

      if (url.endsWith(`/meetings/${meetingId}/agendas`) && !init.method) {
        return Response.json([]);
      }

      if (url.endsWith(`/meetings/${meetingId}/memos`) && !init.method) {
        return Response.json([]);
      }

      if (
        url.endsWith(`/meetings/${meetingId}/transcript-segments`) &&
        !init.method
      ) {
        return Response.json([]);
      }

      if (url.endsWith(`/workspaces/${workspaceId}/meeting-reports/recent`)) {
        return Response.json([]);
      }

      if (url.endsWith(`/meeting-reports/${reportId}/action-items`)) {
        return Response.json([]);
      }

      if (
        url.endsWith(`/voice-rooms/${voiceRoomId}/sessions`) &&
        !init.method
      ) {
        return Response.json([]);
      }

      if (url.endsWith(`/workspaces/${workspaceId}/agent-actions`)) {
        return Response.json([]);
      }

      if (url.endsWith(`/agent-runs/${runId}`)) {
        return Response.json({ id: runId, actions: [] });
      }

      if (url.endsWith("/agent-runs") && init.method === "POST") {
        return Response.json({ id: runId, actions: [] });
      }

      return Response.json({
        id: "ok",
        meetingId,
        reportId,
        actionItemId,
        voiceRoomId,
        voiceSessionId,
        actionId,
      });
    };

    assert.equal(
      buildMeetingApiUrl("/api/meetings/meeting-1", ""),
      "/api/meetings/meeting-1",
    );
    assert.equal(
      buildVoiceApiUrl("/api/voice-rooms/voice-room-1", ""),
      "/api/voice-rooms/voice-room-1",
    );
    assert.equal(
      buildAgentApiUrl("/api/agent-runs/agent-run-1", ""),
      "/api/agent-runs/agent-run-1",
    );
    assert.equal(resolveMeetingClientMode("api"), "api");
    assert.equal(resolveVoiceClientMode("api"), "api");
    assert.equal(resolveAgentPlanningClientMode("api"), "api");

    assert.equal(
      (await createMockMeetingClient().listMeetings(workspaceId)).length > 0,
      true,
    );
    assert.equal(
      (
        await createVoiceClient({ mode: "mock" }).createVoiceRoom(
          workspaceId,
          meetingId,
        )
      ).workspaceId,
      workspaceId,
    );
    const mockAgentClient = createMockAgentPlanningClient();
    const mockRun = await mockAgentClient.startPlanningRun(workspaceId);
    const mockPlanAction = mockRun.actions.find(
      (action) => action.type === "planning.approve",
    );
    const failedMockPlanApproval = await mockAgentClient.approveAction(
      mockPlanAction.id,
    );
    const nextMockRun = await mockAgentClient.getRun(mockRun.id);

    assert.equal(mockRun.workspaceId, workspaceId);
    assert.equal(failedMockPlanApproval.status, "failed");
    assert.equal(failedMockPlanApproval.executedAt, null);
    assert.equal(nextMockRun.status, "requires_confirmation");
    assert.equal(
      (
        await createAgentPlanningClient({ mode: "mock" }).startPlanningRun(
          workspaceId,
        )
      ).workflowType,
      "planning.generate",
    );

    const meetingClient = createMeetingApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher,
    });
    const voiceClient = createVoiceApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher,
    });
    const agentClient = createAgentPlanningApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher,
    });

    await meetingClient.listMeetings(workspaceId);
    await meetingClient.createMeeting(workspaceId, { title: "Meeting" });
    await meetingClient.getMeeting(meetingId);
    await meetingClient.updateMeetingStatus(meetingId, "ended");
    await meetingClient.listAgendas(meetingId);
    await meetingClient.createAgenda(meetingId, { title: "Agenda" });
    await meetingClient.updateAgendaStatus(meetingId, "agenda-1", "done");
    await meetingClient.listMemos(meetingId);
    await meetingClient.createMemo(meetingId, { body: "Memo" });
    await meetingClient.listTranscriptSegments(meetingId);
    await meetingClient.createTranscriptSegment(meetingId, { body: "Text" });
    await meetingClient.requestReportGeneration(meetingId);
    await meetingClient.getReport(reportId);
    await meetingClient.listRecentReports(workspaceId);
    await meetingClient.listActionItems(reportId);
    await meetingClient.approveActionItem(actionItemId);
    await meetingClient.rejectActionItem(actionItemId);
    await meetingClient.requestActionItemTaskDraft(actionItemId);

    await voiceClient.createVoiceRoom(workspaceId, meetingId);
    await voiceClient.getVoiceRoomForMeeting(workspaceId, meetingId);
    await voiceClient.updateVoiceRoomStatus(voiceRoomId, "active");
    await voiceClient.joinVoiceSession(voiceRoomId);
    await voiceClient.listVoiceSessions(voiceRoomId);
    await voiceClient.updateRecordingStatus(voiceSessionId, "recording");
    await voiceClient.submitAudioChunk(voiceSessionId, {
      sequence: 1,
      mimeType: "audio/webm",
      audioBase64: "cGlsbw==",
      capturedStartedAt: "2026-06-30T00:00:00.000Z",
      capturedEndedAt: "2026-06-30T00:00:02.000Z",
    });
    await voiceClient.leaveVoiceSession(voiceSessionId);

    await agentClient.startPlanningRun(workspaceId, defaultProjectStartInput);
    await agentClient.getRun(runId);
    await agentClient.listWorkspaceActions(workspaceId);
    await agentClient.approveAction(actionId);
    await agentClient.rejectAction(actionId);

    assert.deepEqual(
      requests.map((request) => request.init.method ?? "GET"),
      [
        "GET",
        "POST",
        "GET",
        "PATCH",
        "GET",
        "POST",
        "PATCH",
        "GET",
        "POST",
        "GET",
        "POST",
        "POST",
        "GET",
        "GET",
        "GET",
        "PATCH",
        "PATCH",
        "POST",
        "POST",
        "GET",
        "PATCH",
        "POST",
        "GET",
        "PATCH",
        "POST",
        "PATCH",
        "POST",
        "GET",
        "GET",
        "POST",
        "POST",
      ],
    );
    assert.deepEqual(
      requests.map((request) => request.url),
      [
        `https://api.pilo.dev/api/workspaces/${workspaceId}/meetings`,
        `https://api.pilo.dev/api/workspaces/${workspaceId}/meetings`,
        `https://api.pilo.dev/api/meetings/${meetingId}`,
        `https://api.pilo.dev/api/meetings/${meetingId}/status`,
        `https://api.pilo.dev/api/meetings/${meetingId}/agendas`,
        `https://api.pilo.dev/api/meetings/${meetingId}/agendas`,
        `https://api.pilo.dev/api/meetings/${meetingId}/agendas/agenda-1/status`,
        `https://api.pilo.dev/api/meetings/${meetingId}/memos`,
        `https://api.pilo.dev/api/meetings/${meetingId}/memos`,
        `https://api.pilo.dev/api/meetings/${meetingId}/transcript-segments`,
        `https://api.pilo.dev/api/meetings/${meetingId}/transcript-segments`,
        `https://api.pilo.dev/api/meetings/${meetingId}/report-generation`,
        `https://api.pilo.dev/api/meeting-reports/${reportId}`,
        `https://api.pilo.dev/api/workspaces/${workspaceId}/meeting-reports/recent`,
        `https://api.pilo.dev/api/meeting-reports/${reportId}/action-items`,
        `https://api.pilo.dev/api/meeting-action-items/${actionItemId}/approve`,
        `https://api.pilo.dev/api/meeting-action-items/${actionItemId}/reject`,
        `https://api.pilo.dev/api/meeting-action-items/${actionItemId}/task-draft`,
        `https://api.pilo.dev/api/workspaces/${workspaceId}/meetings/${meetingId}/voice-room`,
        `https://api.pilo.dev/api/workspaces/${workspaceId}/meetings/${meetingId}/voice-room`,
        `https://api.pilo.dev/api/voice-rooms/${voiceRoomId}/status`,
        `https://api.pilo.dev/api/voice-rooms/${voiceRoomId}/sessions`,
        `https://api.pilo.dev/api/voice-rooms/${voiceRoomId}/sessions`,
        `https://api.pilo.dev/api/voice-sessions/${voiceSessionId}/recording-status`,
        `https://api.pilo.dev/api/voice-sessions/${voiceSessionId}/audio-chunks`,
        `https://api.pilo.dev/api/voice-sessions/${voiceSessionId}/leave`,
        `https://api.pilo.dev/api/workspaces/${workspaceId}/agent-runs`,
        `https://api.pilo.dev/api/agent-runs/${runId}`,
        `https://api.pilo.dev/api/workspaces/${workspaceId}/agent-actions`,
        `https://api.pilo.dev/api/agent-actions/${actionId}/approve`,
        `https://api.pilo.dev/api/agent-actions/${actionId}/reject`,
      ],
    );
    assert.deepEqual(
      JSON.parse(
        requests.find((request) =>
          request.url.endsWith(
            `/voice-sessions/${voiceSessionId}/audio-chunks`,
          ),
        ).init.body,
      ),
      {
        sequence: 1,
        mimeType: "audio/webm",
        audioBase64: "cGlsbw==",
        capturedStartedAt: "2026-06-30T00:00:00.000Z",
        capturedEndedAt: "2026-06-30T00:00:02.000Z",
      },
    );
    assertEveryRequestUsesLocalActor(requests);
  });

  it("loads Canvas board data and mutations in mock and api modes", async () => {
    const workspaceId = mockWorkspaces[0].id;
    const boardDetail = createMockCanvasBoardDetail(workspaceId);
    const boardSummary = {
      id: boardDetail.id,
      workspaceId,
      title: boardDetail.title,
      boardType: boardDetail.boardType,
      shapeCount: boardDetail.shapeCount,
      connectionCount: boardDetail.connectionCount,
      updatedAt: boardDetail.updatedAt,
    };
    const requests = [];
    const fetcher = async (url, init = {}) => {
      requests.push({ url, init });

      if (url.endsWith(`/workspaces/${workspaceId}/canvas-boards`)) {
        return Response.json([boardSummary]);
      }

      if (url.endsWith(`/canvas-boards/${boardDetail.id}`)) {
        return Response.json(boardDetail);
      }

      if (url.endsWith(`/canvas-boards/${boardDetail.id}/shapes`)) {
        return Response.json({
          id: "shape-created",
          ...JSON.parse(init.body),
        });
      }

      if (url.endsWith("/canvas-shapes/shape-1/position")) {
        return Response.json({
          id: "shape-1",
          position: JSON.parse(init.body),
        });
      }

      if (url.endsWith(`/canvas-boards/${boardDetail.id}/connections`)) {
        return Response.json({
          id: "connection-created",
          ...JSON.parse(init.body),
        });
      }

      if (url.endsWith(`/canvas-boards/${boardDetail.id}/view-settings`)) {
        return Response.json(JSON.parse(init.body));
      }

      if (url.endsWith(`/canvas-boards/${boardDetail.id}/filter-settings`)) {
        return Response.json(JSON.parse(init.body));
      }

      return new Response(null, { status: 204 });
    };

    assert.equal(
      buildCanvasApiUrl("/api/canvas-boards/board-1", ""),
      "/api/canvas-boards/board-1",
    );
    assert.equal(resolveCanvasClientMode("api"), "api");
    assert.equal(resolveCanvasClientMode("fixture"), "mock");

    const mockClient = createMockCanvasClient();
    assert.equal(
      (await mockClient.listBoards(workspaceId))[0].workspaceId,
      workspaceId,
    );
    assert.equal(
      (
        await createCanvasClient({ mode: "mock" }).getBoardDetail(
          boardDetail.id,
          { workspaceId },
        )
      ).workspaceId,
      workspaceId,
    );

    const apiClient = createCanvasApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher,
    });
    const boards = await apiClient.listBoards(workspaceId);
    const detail = await apiClient.getBoardDetail(boards[0].id, {
      workspaceId,
    });
    await apiClient.createShape(boardDetail.id, {
      shapeType: "task",
      entityType: "task",
      entityId: "task-1",
      displayTitle: "Task",
      width: 280,
      height: 160,
      color: "#6d5bd6",
    });
    await apiClient.updateShape("shape-1", {
      displayTitle: "Updated Task",
    });
    await apiClient.updateShapePosition("shape-1", {
      x: 20,
      y: 40,
    });
    await apiClient.deleteShape("shape-1");
    await apiClient.createConnection(boardDetail.id, {
      sourceShapeId: "shape-1",
      targetShapeId: "shape-2",
      connectionType: "related_to",
      label: null,
    });
    await apiClient.deleteConnection("connection-1");
    await apiClient.updateViewSetting(boardDetail.id, {
      zoom: 1.2,
      viewportX: 10,
      viewportY: 30,
    });
    await apiClient.updateFilterSetting(boardDetail.id, {
      enabledEntityTypes: ["task"],
      assigneeMemberId: null,
      showDelayedOnly: false,
      showRiskOnly: true,
      filters: {},
    });

    assert.equal(boards[0].id, boardDetail.id);
    assert.equal(detail.workspaceId, workspaceId);
    assert.equal(
      requests[0].url,
      `https://api.pilo.dev/api/workspaces/${workspaceId}/canvas-boards`,
    );
    assert.equal(requests[0].init.credentials, "include");
    assertEveryRequestUsesLocalActor(requests);
    assert.deepEqual(
      requests.map((request) => request.init.method ?? "GET"),
      [
        "GET",
        "GET",
        "POST",
        "PATCH",
        "PUT",
        "DELETE",
        "POST",
        "DELETE",
        "PUT",
        "PUT",
      ],
    );
  });

  it("keeps Canvas local MVP storage, filtering, and connection visibility deterministic", () => {
    const workspaceId = mockWorkspaces[0].id;
    const board = createMockCanvasBoardDetail(workspaceId);
    const shapeState = normalizeCanvasShapeState({
      [board.shapes[0].id]: {
        x: 320,
        y: 180,
        width: 340,
        height: 190,
      },
      ignored: {
        x: "bad",
        y: 0,
      },
    });
    const persistedBoard = {
      ...board,
      shapes: applyCanvasShapeState(board.shapes, shapeState),
    };
    const taskOnlyFilter = normalizeCanvasFilterSetting(
      {
        enabledEntityTypes: ["task"],
        showDelayedOnly: false,
        showRiskOnly: false,
      },
      board.filterSetting,
    );
    const filteredBoard = filterCanvasBoard(
      persistedBoard,
      taskOnlyFilter,
      createWorkspaceDashboardFixture(workspaceId),
    );

    assert.equal(
      canvasStorageKey(board.id, "shape-state"),
      `pilo:canvas:${board.id}:shape-state`,
    );
    assert.deepEqual(shapeState[board.shapes[0].id], {
      x: 320,
      y: 180,
      width: 340,
      height: 190,
    });
    assert.equal(persistedBoard.shapes[0].position.x, 320);
    assert.equal(persistedBoard.shapes[0].width, 340);
    assert.deepEqual(
      buildCanvasShapeStateMutations(
        board.shapes,
        {},
        {
          [board.shapes[0].id]: {
            x: board.shapes[0].position.x,
            y: board.shapes[0].position.y,
            width: board.shapes[0].width,
            height: board.shapes[0].height,
          },
        },
      ),
      [],
    );
    assert.deepEqual(
      buildCanvasShapeStateMutations(
        board.shapes,
        {
          [board.shapes[0].id]: {
            x: board.shapes[0].position.x,
            y: board.shapes[0].position.y,
            width: board.shapes[0].width,
            height: board.shapes[0].height,
          },
        },
        {
          [board.shapes[0].id]: {
            x: 320,
            y: 180,
            width: 340,
            height: 190,
          },
          "local-note-1": {
            x: 20,
            y: 30,
            width: 100,
            height: 80,
          },
        },
      ),
      [
        {
          shapeId: board.shapes[0].id,
          position: {
            x: 320,
            y: 180,
          },
          shape: {
            width: 340,
            height: 190,
          },
        },
      ],
    );
    assert.deepEqual(
      filteredBoard.shapes.map((shape) => shape.entityType),
      ["task"],
    );
    assert.equal(filteredBoard.connections.length, 0);
  });
});
