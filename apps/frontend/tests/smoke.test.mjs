import assert from "node:assert/strict";
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
import packageJson from "../package.json" with { type: "json" };
import contractSchema from "../../../docs/contracts/schemas/pilo-public-contracts.schema.json" with { type: "json" };
import contractCanvasBoardDetailFixture from "../../../docs/contracts/fixtures/canvas-board-detail.fixture.json" with { type: "json" };

const sortContractKeys = (values) =>
  [...values].sort((left, right) => left.localeCompare(right));

describe("frontend package", () => {
  it("keeps the PILO frontend package name", () => {
    assert.equal(packageJson.name, "@pilo/frontend");
  });

  it("keeps auth provider hrefs relative when no app server URL is configured", () => {
    assert.equal(
      authProviderHref("/auth/google/start", undefined),
      "/auth/google/start",
    );
    assert.equal(
      authProviderHref("/auth/github/start", undefined),
      "/auth/github/start",
    );
  });

  it("uses the configured app server URL for auth provider hrefs", () => {
    assert.equal(
      authProviderHref("/auth/google/start", "https://api.pilo.dev/"),
      "https://api.pilo.dev/auth/google/start",
    );
    assert.equal(
      authProviderHref("/auth/github/start", "https://api.pilo.dev"),
      "https://api.pilo.dev/auth/github/start",
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
        authProviderHref("/auth/google/start", {
          next: "/canvas?filter=task",
        }),
        "https://api.pilo.dev/auth/google/start?next=%2Fcanvas%3Ffilter%3Dtask",
      );
      assert.equal(
        authProviderHref("/auth/github/start", {
          baseUrl: "",
          next: "https://evil.example",
        }),
        "/auth/github/start?next=%2F",
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
      () => buildAuthApiUrl("/auth/me", ""),
      /Auth API base URL is required/,
    );
    assert.equal(
      buildAuthApiUrl("/auth/logout", "https://api.pilo.dev/"),
      "https://api.pilo.dev/auth/logout",
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

      if (url.endsWith("/auth/me")) {
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
    assert.equal(requests[0].url, "https://api.pilo.dev/auth/me");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[1].url, "https://api.pilo.dev/auth/logout");
    assert.equal(requests[1].init.method, "POST");
    assert.equal(requests[1].init.credentials, "include");
  });

  it("keeps mock and api auth client modes explicitly testable", async () => {
    const previousMode = process.env.NEXT_PUBLIC_PILO_AUTH_MODE;
    const requests = [];
    const fetcher = async (url, init) => {
      requests.push({ url, init });

      if (url.endsWith("/auth/me")) {
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
      assert.equal(requests[0].url, "https://api.pilo.dev/auth/me");
      assert.equal(requests[0].init.credentials, "include");
      assert.equal(requests[1].url, "https://api.pilo.dev/auth/logout");
      assert.equal(requests[1].init.method, "POST");
    } finally {
      if (previousMode === undefined) {
        delete process.env.NEXT_PUBLIC_PILO_AUTH_MODE;
      } else {
        process.env.NEXT_PUBLIC_PILO_AUTH_MODE = previousMode;
      }
    }
  });
});
