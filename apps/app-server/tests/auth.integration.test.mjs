import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import process from "node:process";
import { URL } from "node:url";
import "ts-node/register";

const require = createRequire(import.meta.url);
const { NestFactory } = require("@nestjs/core");
const { FastifyAdapter } = require("@nestjs/platform-fastify");
const { configureApp } = require("../src/app.config");
const { AppModule } = require("../src/app.module");

const AUTH_TEST_ENV = {
  APP_ENV: "local",
  NODE_ENV: "test",
  FRONTEND_URL: "https://app.pilo.test",
  APP_SERVER_URL: "https://api.pilo.test",
  PILO_SKIP_DATABASE_CONNECT: "true",
  SESSION_SECRET: "auth-integration-session-secret",
  AUTH_SESSION_SECRET_VERSION: "integration",
  GOOGLE_OAUTH_CLIENT_ID: "google-client",
  GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
  GITHUB_LOGIN_CLIENT_ID: "github-client",
  GITHUB_LOGIN_CLIENT_SECRET: "github-secret",
};

const LOCAL_MVP_USER_ID = "11111111-1111-4111-8111-111111111111";

function applyTestEnv(env = AUTH_TEST_ENV) {
  const previous = new Map();

  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

function createOAuthFetchStub(requests = [], profilesByCode = {}) {
  let lastCode = "google-code";

  return async (url, init) => {
    const request = { url: String(url), init };
    requests.push(request);

    if (request.url === "https://oauth2.googleapis.com/token") {
      lastCode = init?.body?.get("code") ?? "google-code";

      return globalThis.Response.json({
        access_token: "google-access-token",
        expires_in: 3600,
        scope: "openid email profile",
        token_type: "Bearer",
      });
    }

    if (request.url === "https://openidconnect.googleapis.com/v1/userinfo") {
      return globalThis.Response.json(
        profilesByCode[lastCode] ?? {
          sub: "google-user-123",
          email: "integration@example.com",
          name: "Integration User",
          picture: "https://example.com/integration.png",
          email_verified: true,
        },
      );
    }

    throw new Error(`Unexpected OAuth fetch: ${request.url}`);
  };
}

async function createAuthIntegrationApp(fetcher = createOAuthFetchStub()) {
  const restoreEnv = applyTestEnv();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fetcher;

  try {
    const app = await NestFactory.create(AppModule, new FastifyAdapter(), {
      logger: false,
    });
    configureApp(app);
    await app.init();

    const server = app.getHttpAdapter().getInstance();
    await server.ready();

    return {
      app,
      server,
      async close() {
        try {
          await app.close();
        } finally {
          globalThis.fetch = previousFetch;
          restoreEnv();
        }
      },
    };
  } catch (error) {
    globalThis.fetch = previousFetch;
    restoreEnv();
    throw error;
  }
}

function getRedirectUrl(response) {
  const location = response.headers.location;
  assert.equal(typeof location, "string");

  return new URL(location);
}

function getSetCookieHeader(response) {
  const setCookie = response.headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.equal(typeof cookie, "string");

  return cookie;
}

function getCookieHeader(response) {
  return getSetCookieHeader(response).split(";")[0];
}

describe("auth HTTP integration", () => {
  it("completes Google start, callback, current user, and logout flow", async () => {
    const oauthRequests = [];
    const fetcher = createOAuthFetchStub(oauthRequests);
    const { server, close } = await createAuthIntegrationApp(fetcher);

    try {
      const startResponse = await server.inject({
        method: "GET",
        url: "/api/auth/google/start?next=%2Fcanvas",
      });
      const authorizationUrl = getRedirectUrl(startResponse);
      const state = authorizationUrl.searchParams.get("state");

      assert.equal(startResponse.statusCode, 302);
      assert.equal(
        `${authorizationUrl.origin}${authorizationUrl.pathname}`,
        "https://accounts.google.com/o/oauth2/v2/auth",
      );
      assert.equal(
        authorizationUrl.searchParams.get("redirect_uri"),
        "https://api.pilo.test/api/auth/google/callback",
      );
      assert.equal(
        authorizationUrl.searchParams.get("client_id"),
        "google-client",
      );
      assert.equal(state?.length > 20, true);

      const callbackResponse = await server.inject({
        method: "GET",
        url: `/api/auth/google/callback?code=google-code&state=${encodeURIComponent(
          state,
        )}`,
        headers: {
          "user-agent": "PILO integration test",
        },
      });
      const callbackRedirectUrl = getRedirectUrl(callbackResponse);
      const setCookieHeader = getSetCookieHeader(callbackResponse);
      const cookieHeader = getCookieHeader(callbackResponse);

      assert.equal(callbackResponse.statusCode, 302);
      assert.equal(
        callbackRedirectUrl.toString(),
        "https://app.pilo.test/login?auth=success&provider=google&next=%2Fcanvas",
      );
      assert.equal(cookieHeader.includes("pilo_session="), true);
      assert.equal(setCookieHeader.includes("HttpOnly"), true);

      const meResponse = await server.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          cookie: cookieHeader,
        },
      });
      const currentUser = meResponse.json();

      assert.equal(meResponse.statusCode, 200);
      assert.equal(currentUser.email, "integration@example.com");
      assert.equal(currentUser.name, "Integration User");
      assert.deepEqual(currentUser.providers, ["google"]);

      const logoutResponse = await server.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: {
          cookie: cookieHeader,
        },
      });
      const expiredCookieHeader = getSetCookieHeader(logoutResponse);

      assert.equal(logoutResponse.statusCode, 204);
      assert.equal(expiredCookieHeader.includes("Max-Age=0"), true);

      const revokedMeResponse = await server.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          cookie: cookieHeader,
        },
      });

      assert.equal(revokedMeResponse.statusCode, 401);
      assert.equal(oauthRequests.length, 2);
      assert.equal(oauthRequests[0].url, "https://oauth2.googleapis.com/token");
      assert.equal(
        oauthRequests[1].url,
        "https://openidconnect.googleapis.com/v1/userinfo",
      );
    } finally {
      await close();
    }
  });

  it("serves workspace create, list, detail, and update APIs for the current session", async () => {
    const oauthRequests = [];
    const fetcher = createOAuthFetchStub(oauthRequests, {
      "invitee-code": {
        sub: "google-user-456",
        email: "invitee@example.com",
        name: "Invited User",
        picture: "https://example.com/invitee.png",
        email_verified: true,
      },
    });
    const { server, close } = await createAuthIntegrationApp(fetcher);

    try {
      const startResponse = await server.inject({
        method: "GET",
        url: "/api/auth/google/start?next=%2Fworkspaces",
      });
      const authorizationUrl = getRedirectUrl(startResponse);
      const state = authorizationUrl.searchParams.get("state");
      const callbackResponse = await server.inject({
        method: "GET",
        url: `/api/auth/google/callback?code=google-code&state=${encodeURIComponent(
          state,
        )}`,
      });
      const cookieHeader = getCookieHeader(callbackResponse);
      const meResponse = await server.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          cookie: cookieHeader,
        },
      });
      const currentUser = meResponse.json();

      assert.equal(meResponse.statusCode, 200);

      const createResponse = await server.inject({
        method: "POST",
        url: "/api/workspaces",
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        payload: JSON.stringify({
          name: "PILO",
          description: "AI Project OS",
          type: "side_project",
        }),
      });
      const created = createResponse.json();

      assert.equal(createResponse.statusCode, 201);
      assert.equal(created.name, "PILO");
      assert.equal(created.description, "AI Project OS");
      assert.equal(created.type, "side_project");
      assert.equal(created.status, "active");
      assert.equal(created.myRole, "owner");
      assert.equal(created.memberCount, 1);

      const listResponse = await server.inject({
        method: "GET",
        url: "/api/workspaces",
        headers: {
          cookie: cookieHeader,
        },
      });

      assert.equal(listResponse.statusCode, 200);
      assert.deepEqual(listResponse.json(), [created]);

      const detailResponse = await server.inject({
        method: "GET",
        url: `/api/workspaces/${created.id}`,
        headers: {
          cookie: cookieHeader,
        },
      });

      assert.equal(detailResponse.statusCode, 200);
      assert.deepEqual(detailResponse.json(), created);

      const membersResponse = await server.inject({
        method: "GET",
        url: `/api/workspaces/${created.id}/members`,
        headers: {
          cookie: cookieHeader,
        },
      });
      const members = membersResponse.json();

      assert.equal(membersResponse.statusCode, 200);
      assert.equal(members.length, 1);
      assert.equal(members[0].userId, currentUser.id);
      assert.equal(members[0].name, "Integration User");
      assert.equal(members[0].email, "integration@example.com");
      assert.equal(members[0].avatarUrl, "https://example.com/integration.png");
      assert.equal(members[0].role, "owner");

      const defaultPreferencesResponse = await server.inject({
        method: "GET",
        url: `/api/workspaces/${created.id}/dashboard-preferences`,
        headers: {
          cookie: cookieHeader,
        },
      });
      const defaultPreferences = defaultPreferencesResponse.json();

      assert.equal(defaultPreferencesResponse.statusCode, 200);
      assert.deepEqual(defaultPreferences.layout, {});
      assert.deepEqual(defaultPreferences.hiddenSections, []);
      assert.equal(defaultPreferences.updatedAt, null);

      const ownerPreferencesResponse = await server.inject({
        method: "PUT",
        url: `/api/workspaces/${created.id}/dashboard-preferences`,
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        payload: JSON.stringify({
          layout: {
            density: "compact",
            columns: ["tasks", "prs"],
          },
          hiddenSections: ["agent"],
        }),
      });
      const ownerPreferences = ownerPreferencesResponse.json();

      assert.equal(ownerPreferencesResponse.statusCode, 200);
      assert.deepEqual(ownerPreferences.layout, {
        density: "compact",
        columns: ["tasks", "prs"],
      });
      assert.deepEqual(ownerPreferences.hiddenSections, ["agent"]);

      const dashboardResponse = await server.inject({
        method: "GET",
        url: `/api/workspaces/${created.id}/dashboard`,
        headers: {
          cookie: cookieHeader,
        },
      });
      const dashboard = dashboardResponse.json();

      assert.equal(dashboardResponse.statusCode, 200);
      assert.equal(dashboard.workspace.id, created.id);
      assert.equal(dashboard.currentMember.userId, currentUser.id);
      assert.deepEqual(dashboard.preferences, ownerPreferences);
      assert.equal(dashboard.members.length, 1);
      assert.equal(dashboard.source, "fixture");
      assert.equal(dashboard.tasks.length > 0, true);
      assert.equal(dashboard.progress.workspaceId, created.id);

      const inviteResponse = await server.inject({
        method: "POST",
        url: `/api/workspaces/${created.id}/invites`,
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        payload: JSON.stringify({
          email: "invitee@example.com",
          role: "member",
        }),
      });
      const invite = inviteResponse.json();

      assert.equal(inviteResponse.statusCode, 201);
      assert.equal(invite.workspaceId, created.id);
      assert.equal(invite.email, "invitee@example.com");
      assert.equal(invite.role, "member");
      assert.equal(typeof invite.token, "string");

      const inviteeStartResponse = await server.inject({
        method: "GET",
        url: "/api/auth/google/start?next=%2Fworkspaces",
      });
      const inviteeAuthorizationUrl = getRedirectUrl(inviteeStartResponse);
      const inviteeState = inviteeAuthorizationUrl.searchParams.get("state");
      const inviteeCallbackResponse = await server.inject({
        method: "GET",
        url: `/api/auth/google/callback?code=invitee-code&state=${encodeURIComponent(
          inviteeState,
        )}`,
      });
      const inviteeCookieHeader = getCookieHeader(inviteeCallbackResponse);

      const acceptResponse = await server.inject({
        method: "POST",
        url: `/api/workspace-invites/${invite.id}/accept`,
        headers: {
          "content-type": "application/json",
          cookie: inviteeCookieHeader,
        },
        payload: JSON.stringify({
          token: invite.token,
        }),
      });
      const accepted = acceptResponse.json();

      assert.equal(acceptResponse.statusCode, 201);
      assert.equal(accepted.workspaceId, created.id);
      assert.equal(accepted.member.email, "invitee@example.com");
      assert.equal(accepted.member.role, "member");

      const updatedMembersResponse = await server.inject({
        method: "GET",
        url: `/api/workspaces/${created.id}/members`,
        headers: {
          cookie: cookieHeader,
        },
      });

      assert.equal(updatedMembersResponse.statusCode, 200);
      assert.equal(updatedMembersResponse.json().length, 2);

      const inviteePreferencesResponse = await server.inject({
        method: "PUT",
        url: `/api/workspaces/${created.id}/dashboard-preferences`,
        headers: {
          "content-type": "application/json",
          cookie: inviteeCookieHeader,
        },
        payload: JSON.stringify({
          layout: {
            density: "comfortable",
            columns: ["meetings"],
          },
          hiddenSections: ["recentDecisions"],
        }),
      });
      const inviteePreferences = inviteePreferencesResponse.json();

      assert.equal(inviteePreferencesResponse.statusCode, 200);
      assert.notEqual(inviteePreferences.memberId, ownerPreferences.memberId);
      assert.deepEqual(inviteePreferences.layout, {
        density: "comfortable",
        columns: ["meetings"],
      });

      const reloadedOwnerPreferencesResponse = await server.inject({
        method: "GET",
        url: `/api/workspaces/${created.id}/dashboard-preferences`,
        headers: {
          cookie: cookieHeader,
        },
      });

      assert.equal(reloadedOwnerPreferencesResponse.statusCode, 200);
      assert.deepEqual(
        reloadedOwnerPreferencesResponse.json(),
        ownerPreferences,
      );

      const updateResponse = await server.inject({
        method: "PATCH",
        url: `/api/workspaces/${created.id}`,
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        payload: JSON.stringify({
          name: "PILO Lab",
          status: "archived",
        }),
      });
      const updated = updateResponse.json();

      assert.equal(updateResponse.statusCode, 200);
      assert.equal(updated.name, "PILO Lab");
      assert.equal(updated.status, "archived");

      const anonymousResponse = await server.inject({
        method: "GET",
        url: "/api/workspaces",
      });

      assert.equal(anonymousResponse.statusCode, 401);

      const anonymousMembersResponse = await server.inject({
        method: "GET",
        url: `/api/workspaces/${created.id}/members`,
      });

      assert.equal(anonymousMembersResponse.statusCode, 401);

      const missingMembersResponse = await server.inject({
        method: "GET",
        url: "/api/workspaces/00000000-0000-4000-8000-000000000000/members",
        headers: {
          cookie: cookieHeader,
        },
      });

      assert.equal(missingMembersResponse.statusCode, 404);
      assert.equal(oauthRequests.length, 4);
    } finally {
      await close();
    }
  });

  it("serves Canvas board, shape, position, connection, and settings APIs", async () => {
    const { server, close } = await createAuthIntegrationApp();

    try {
      const startResponse = await server.inject({
        method: "GET",
        url: "/api/auth/google/start?next=%2Fcanvas",
      });
      const authorizationUrl = getRedirectUrl(startResponse);
      const state = authorizationUrl.searchParams.get("state");
      const callbackResponse = await server.inject({
        method: "GET",
        url: `/api/auth/google/callback?code=google-code&state=${encodeURIComponent(
          state,
        )}`,
      });
      const cookieHeader = getCookieHeader(callbackResponse);

      const createWorkspaceResponse = await server.inject({
        method: "POST",
        url: "/api/workspaces",
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        payload: JSON.stringify({
          name: "Canvas Workspace",
          type: "side_project",
        }),
      });
      const workspace = createWorkspaceResponse.json();

      assert.equal(createWorkspaceResponse.statusCode, 201);

      const emptyBoardsResponse = await server.inject({
        method: "GET",
        url: `/api/workspaces/${workspace.id}/canvas-boards`,
        headers: {
          cookie: cookieHeader,
        },
      });

      assert.equal(emptyBoardsResponse.statusCode, 200);
      assert.deepEqual(emptyBoardsResponse.json(), []);

      const createBoardResponse = await server.inject({
        method: "POST",
        url: `/api/workspaces/${workspace.id}/canvas-boards`,
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        payload: JSON.stringify({
          title: "Project Map",
          boardType: "project_map",
        }),
      });
      const board = createBoardResponse.json();

      assert.equal(createBoardResponse.statusCode, 201);
      assert.equal(board.workspaceId, workspace.id);
      assert.equal(board.title, "Project Map");
      assert.equal(board.boardType, "project_map");
      assert.equal(board.shapeCount, 0);

      const listBoardsResponse = await server.inject({
        method: "GET",
        url: `/api/workspaces/${workspace.id}/canvas-boards`,
        headers: {
          cookie: cookieHeader,
        },
      });

      assert.equal(listBoardsResponse.statusCode, 200);
      assert.equal(listBoardsResponse.json()[0].id, board.id);

      const detailResponse = await server.inject({
        method: "GET",
        url: `/api/canvas-boards/${board.id}`,
        headers: {
          cookie: cookieHeader,
        },
      });
      const initialDetail = detailResponse.json();

      assert.equal(detailResponse.statusCode, 200);
      assert.equal(initialDetail.id, board.id);
      assert.deepEqual(initialDetail.shapes, []);
      assert.deepEqual(initialDetail.connections, []);
      assert.deepEqual(initialDetail.viewSetting, {
        zoom: 1,
        viewportX: 0,
        viewportY: 0,
      });

      const invalidShapeResponse = await server.inject({
        method: "POST",
        url: `/api/canvas-boards/${board.id}/shapes`,
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        payload: JSON.stringify({
          shapeType: "unknown",
          entityType: "task",
          entityId: "task-1",
          displayTitle: "Invalid",
          width: 280,
          height: 160,
          color: "#6d5bd6",
        }),
      });

      assert.equal(invalidShapeResponse.statusCode, 400);

      const createTaskShapeResponse = await server.inject({
        method: "POST",
        url: `/api/canvas-boards/${board.id}/shapes`,
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        payload: JSON.stringify({
          shapeType: "task",
          entityType: "task",
          entityId: "task-1",
          displayTitle: "Login API",
          width: 280,
          height: 160,
          color: "#6d5bd6",
        }),
      });
      const taskShape = createTaskShapeResponse.json();

      assert.equal(createTaskShapeResponse.statusCode, 201);
      assert.equal(taskShape.displayTitle, "Login API");
      assert.deepEqual(taskShape.position, {
        x: 0,
        y: 0,
      });

      const createPrShapeResponse = await server.inject({
        method: "POST",
        url: `/api/canvas-boards/${board.id}/shapes`,
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        payload: JSON.stringify({
          shapeType: "pull_request",
          entityType: "pull_request",
          entityId: "pr-42",
          displayTitle: "PR #42",
          width: 300,
          height: 172,
          color: "#2e9e5b",
        }),
      });
      const prShape = createPrShapeResponse.json();

      assert.equal(createPrShapeResponse.statusCode, 201);

      const updateShapeResponse = await server.inject({
        method: "PATCH",
        url: `/api/canvas-shapes/${taskShape.id}`,
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        payload: JSON.stringify({
          displayTitle: "Login API updated",
          isCollapsed: true,
        }),
      });
      const updatedShape = updateShapeResponse.json();

      assert.equal(updateShapeResponse.statusCode, 200);
      assert.equal(updatedShape.displayTitle, "Login API updated");
      assert.equal(updatedShape.isCollapsed, true);

      const positionResponse = await server.inject({
        method: "PUT",
        url: `/api/canvas-shapes/${taskShape.id}/position`,
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        payload: JSON.stringify({
          x: 120,
          y: 140,
        }),
      });

      assert.equal(positionResponse.statusCode, 200);
      assert.deepEqual(positionResponse.json().position, {
        x: 120,
        y: 140,
      });

      const connectionResponse = await server.inject({
        method: "POST",
        url: `/api/canvas-boards/${board.id}/connections`,
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        payload: JSON.stringify({
          sourceShapeId: taskShape.id,
          targetShapeId: prShape.id,
          connectionType: "implemented_by",
          label: "Task to PR",
        }),
      });
      const connection = connectionResponse.json();

      assert.equal(connectionResponse.statusCode, 201);
      assert.equal(connection.sourceShapeId, taskShape.id);

      const duplicateConnectionResponse = await server.inject({
        method: "POST",
        url: `/api/canvas-boards/${board.id}/connections`,
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        payload: JSON.stringify({
          sourceShapeId: taskShape.id,
          targetShapeId: prShape.id,
          connectionType: "implemented_by",
          label: "Duplicate",
        }),
      });

      assert.equal(duplicateConnectionResponse.statusCode, 409);

      const viewSettingResponse = await server.inject({
        method: "PUT",
        url: `/api/canvas-boards/${board.id}/view-settings`,
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        payload: JSON.stringify({
          zoom: 1.2,
          viewportX: 10,
          viewportY: 20,
        }),
      });

      assert.equal(viewSettingResponse.statusCode, 200);
      assert.deepEqual(viewSettingResponse.json(), {
        zoom: 1.2,
        viewportX: 10,
        viewportY: 20,
      });

      const filterSettingResponse = await server.inject({
        method: "PUT",
        url: `/api/canvas-boards/${board.id}/filter-settings`,
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        payload: JSON.stringify({
          enabledEntityTypes: ["task", "pull_request"],
          assigneeMemberId: null,
          showDelayedOnly: false,
          showRiskOnly: true,
          filters: {
            priority: "high",
          },
        }),
      });

      assert.equal(filterSettingResponse.statusCode, 200);
      assert.equal(filterSettingResponse.json().showRiskOnly, true);

      const updatedDetailResponse = await server.inject({
        method: "GET",
        url: `/api/canvas-boards/${board.id}`,
        headers: {
          cookie: cookieHeader,
        },
      });
      const updatedDetail = updatedDetailResponse.json();

      assert.equal(updatedDetailResponse.statusCode, 200);
      assert.equal(updatedDetail.shapeCount, 2);
      assert.equal(updatedDetail.connectionCount, 1);
      assert.deepEqual(updatedDetail.viewSetting, viewSettingResponse.json());
      assert.deepEqual(
        updatedDetail.filterSetting,
        filterSettingResponse.json(),
      );

      const anonymousListResponse = await server.inject({
        method: "GET",
        url: `/api/workspaces/${workspace.id}/canvas-boards`,
      });

      assert.equal(anonymousListResponse.statusCode, 401);

      const deleteConnectionResponse = await server.inject({
        method: "DELETE",
        url: `/api/canvas-connections/${connection.id}`,
        headers: {
          cookie: cookieHeader,
        },
      });

      assert.equal(deleteConnectionResponse.statusCode, 200);
      assert.deepEqual(deleteConnectionResponse.json(), {
        id: connection.id,
        deleted: true,
      });

      const deleteShapeResponse = await server.inject({
        method: "DELETE",
        url: `/api/canvas-shapes/${taskShape.id}`,
        headers: {
          cookie: cookieHeader,
        },
      });

      assert.equal(deleteShapeResponse.statusCode, 200);
      assert.deepEqual(deleteShapeResponse.json(), {
        id: taskShape.id,
        deleted: true,
      });
    } finally {
      await close();
    }
  });

  it("accepts the local MVP actor header for workspace dashboard and Canvas APIs", async () => {
    const { server, close } = await createAuthIntegrationApp();
    const localActorHeaders = {
      "x-user-id": LOCAL_MVP_USER_ID,
      "content-type": "application/json",
    };

    try {
      const createWorkspaceResponse = await server.inject({
        method: "POST",
        url: "/api/workspaces",
        headers: localActorHeaders,
        payload: JSON.stringify({
          name: "Header Workspace",
          type: "side_project",
        }),
      });
      const workspace = createWorkspaceResponse.json();

      assert.equal(createWorkspaceResponse.statusCode, 201);
      assert.equal(workspace.myRole, "owner");

      const dashboardResponse = await server.inject({
        method: "GET",
        url: `/api/workspaces/${workspace.id}/dashboard`,
        headers: {
          "x-user-id": LOCAL_MVP_USER_ID,
        },
      });
      const dashboard = dashboardResponse.json();

      assert.equal(dashboardResponse.statusCode, 200);
      assert.equal(dashboard.workspace.id, workspace.id);
      assert.equal(dashboard.currentMember.userId, LOCAL_MVP_USER_ID);

      const createBoardResponse = await server.inject({
        method: "POST",
        url: `/api/workspaces/${workspace.id}/canvas-boards`,
        headers: localActorHeaders,
        payload: JSON.stringify({
          title: "Header Canvas",
          boardType: "project_map",
        }),
      });
      const board = createBoardResponse.json();

      assert.equal(createBoardResponse.statusCode, 201);
      assert.equal(board.workspaceId, workspace.id);

      const boardDetailResponse = await server.inject({
        method: "GET",
        url: `/api/canvas-boards/${board.id}`,
        headers: {
          "x-user-id": LOCAL_MVP_USER_ID,
        },
      });

      assert.equal(boardDetailResponse.statusCode, 200);
      assert.equal(boardDetailResponse.json().id, board.id);
    } finally {
      await close();
    }
  });

  it("redirects callback provider errors without calling OAuth endpoints", async () => {
    const oauthRequests = [];
    const fetcher = createOAuthFetchStub(oauthRequests);
    const { server, close } = await createAuthIntegrationApp(fetcher);

    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/auth/google/callback?error=access_denied",
      });
      const redirectUrl = getRedirectUrl(response);

      assert.equal(response.statusCode, 302);
      assert.equal(
        redirectUrl.toString(),
        "https://app.pilo.test/login?auth=error&provider=google&error=access_denied",
      );
      assert.equal(response.headers["set-cookie"], undefined);
      assert.equal(oauthRequests.length, 0);
    } finally {
      await close();
    }
  });

  it("rejects callback state mismatches before token exchange", async () => {
    const oauthRequests = [];
    const fetcher = createOAuthFetchStub(oauthRequests);
    const { server, close } = await createAuthIntegrationApp(fetcher);

    try {
      const startResponse = await server.inject({
        method: "GET",
        url: "/api/auth/google/start",
      });

      assert.equal(startResponse.statusCode, 302);

      const response = await server.inject({
        method: "GET",
        url: "/api/auth/google/callback?code=google-code&state=wrong-state",
      });
      const redirectUrl = getRedirectUrl(response);

      assert.equal(response.statusCode, 302);
      assert.equal(
        redirectUrl.toString(),
        "https://app.pilo.test/login?auth=error&provider=google&error=oauth_state_missing",
      );
      assert.equal(oauthRequests.length, 0);
    } finally {
      await close();
    }
  });

  it("returns 401 for /api/auth/me without a session cookie", async () => {
    const { server, close } = await createAuthIntegrationApp();

    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/auth/me",
      });
      const body = response.json();

      assert.equal(response.statusCode, 401);
      assert.equal(body.statusCode, 401);
    } finally {
      await close();
    }
  });
});
