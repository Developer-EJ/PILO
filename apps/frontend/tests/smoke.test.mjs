import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAuthApiUrl,
  createAuthApiClient,
} from "../lib/auth/authClient.mjs";
import {
  createMockAuthClient,
  mockCurrentUser,
} from "../lib/auth/mockAuthClient.mjs";
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
      provider: "google",
    });

    assert.equal(state.kind, "error");
    assert.equal(state.providerLabel, "Google");
    assert.equal(state.errorCode, "access_denied");
    assert.equal(
      state.loginHref,
      "/login?auth=error&provider=google&error=access_denied",
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

  it("builds auth API URLs from a configured app server base URL", () => {
    assert.equal(buildAuthApiUrl("/auth/me"), "/auth/me");
    assert.equal(
      buildAuthApiUrl("/auth/logout", "https://api.pilo.dev/"),
      "https://api.pilo.dev/auth/logout",
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
});
