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
  applyCanvasShapeState,
  canvasStorageKey,
  filterCanvasBoard,
  normalizeCanvasFilterSetting,
  normalizeCanvasShapeState,
} from "../lib/workspace/canvasStorage.mjs";
import {
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

    assert.match(page, /reviewSessions/);
    assert.match(workspace, /ReviewNodeWorkspace/);
    assert.match(workspace, /canvasWorkspace/);
    assert.match(workspace, /panelResizeHandle/);
    assert.match(workspace, /detailWorkspace/);
    assert.match(workspace, /decisionLabels/);
    assert.match(workspace, /setDecisions/);
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
    assert.equal(buildWorkspaceApiUrl("/api/workspaces", ""), "/api/workspaces");
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
    assert.deepEqual(dashboard.properties.source.enum, ["fixture", "empty"]);
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

    const mockRepositories =
      await createMockGithubClient().listRepositories(workspaceId);
    assert.equal(mockRepositories[0].workspaceId, workspaceId);
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

    assert.deepEqual(
      requests.map((request) => request.url),
      [
        `https://api.pilo.dev/api/workspaces/${workspaceId}/github/connections`,
        `https://api.pilo.dev/api/workspaces/${workspaceId}/github/connections`,
        `https://api.pilo.dev/api/workspaces/${workspaceId}/github/repositories`,
        `https://api.pilo.dev/api/repositories/${repositoryId}/issues`,
        `https://api.pilo.dev/api/repositories/${repositoryId}/pull-requests`,
      ],
    );
    assert.deepEqual(
      requests.map((request) => request.init.method ?? "GET"),
      ["GET", "POST", "GET", "GET", "GET"],
    );
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

      if (url.endsWith(`/voice-rooms/${voiceRoomId}/sessions`) && !init.method) {
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
      (await createVoiceClient({ mode: "mock" }).createVoiceRoom(
        workspaceId,
        meetingId,
      )).workspaceId,
      workspaceId,
    );
    const mockRun =
      await createMockAgentPlanningClient().startPlanningRun(workspaceId);
    assert.equal(mockRun.workspaceId, workspaceId);
    assert.equal(
      (await createAgentPlanningClient({ mode: "mock" }).startPlanningRun(
        workspaceId,
      )).workflowType,
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
    await voiceClient.leaveVoiceSession(voiceSessionId);
    await voiceClient.updateRecordingStatus(voiceSessionId, "recording");

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
        `https://api.pilo.dev/api/voice-sessions/${voiceSessionId}/leave`,
        `https://api.pilo.dev/api/voice-sessions/${voiceSessionId}/recording-status`,
        `https://api.pilo.dev/api/workspaces/${workspaceId}/agent-runs`,
        `https://api.pilo.dev/api/agent-runs/${runId}`,
        `https://api.pilo.dev/api/workspaces/${workspaceId}/agent-actions`,
        `https://api.pilo.dev/api/agent-actions/${actionId}/approve`,
        `https://api.pilo.dev/api/agent-actions/${actionId}/reject`,
      ],
    );
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
      filteredBoard.shapes.map((shape) => shape.entityType),
      ["task"],
    );
    assert.equal(filteredBoard.connections.length, 0);
  });
});
