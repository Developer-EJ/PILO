import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import process from "node:process";
import { URL } from "node:url";
import "ts-node/register";

const require = createRequire(import.meta.url);
const { NestFactory } = require("@nestjs/core");
const { FastifyAdapter } = require("@nestjs/platform-fastify");
const { AppModule } = require("../src/app.module");

const AUTH_TEST_ENV = {
  APP_ENV: "local",
  NODE_ENV: "test",
  FRONTEND_URL: "https://app.pilo.test",
  APP_SERVER_URL: "https://api.pilo.test",
  SESSION_SECRET: "auth-integration-session-secret",
  AUTH_SESSION_SECRET_VERSION: "integration",
  GOOGLE_OAUTH_CLIENT_ID: "google-client",
  GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
  GITHUB_LOGIN_CLIENT_ID: "github-client",
  GITHUB_LOGIN_CLIENT_SECRET: "github-secret",
};

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

function createOAuthFetchStub(requests = []) {
  return async (url, init) => {
    const request = { url: String(url), init };
    requests.push(request);

    if (request.url === "https://oauth2.googleapis.com/token") {
      return globalThis.Response.json({
        access_token: "google-access-token",
        expires_in: 3600,
        scope: "openid email profile",
        token_type: "Bearer",
      });
    }

    if (request.url === "https://openidconnect.googleapis.com/v1/userinfo") {
      return globalThis.Response.json({
        sub: "google-user-123",
        email: "integration@example.com",
        name: "Integration User",
        picture: "https://example.com/integration.png",
        email_verified: true,
      });
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
    await app.init();

    const server = app.getHttpAdapter().getInstance();
    await server.ready();

    return {
      app,
      server,
      async close() {
        await app.close();
        globalThis.fetch = previousFetch;
        restoreEnv();
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

function getCookieHeader(response) {
  const setCookie = response.headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.equal(typeof cookie, "string");

  return cookie;
}

describe("auth HTTP integration", () => {
  it("completes Google start, callback, current user, and logout flow", async () => {
    const oauthRequests = [];
    const fetcher = createOAuthFetchStub(oauthRequests);
    const { server, close } = await createAuthIntegrationApp(fetcher);

    try {
      const startResponse = await server.inject({
        method: "GET",
        url: "/auth/google/start?next=%2Fcanvas",
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
        "https://api.pilo.test/auth/google/callback",
      );
      assert.equal(
        authorizationUrl.searchParams.get("client_id"),
        "google-client",
      );
      assert.equal(state?.length > 20, true);

      const callbackResponse = await server.inject({
        method: "GET",
        url: `/auth/google/callback?code=google-code&state=${encodeURIComponent(
          state,
        )}`,
        headers: {
          "user-agent": "PILO integration test",
        },
      });
      const callbackRedirectUrl = getRedirectUrl(callbackResponse);
      const cookieHeader = getCookieHeader(callbackResponse);

      assert.equal(callbackResponse.statusCode, 302);
      assert.equal(
        callbackRedirectUrl.toString(),
        "https://app.pilo.test/login?auth=success&provider=google&next=%2Fcanvas",
      );
      assert.equal(cookieHeader.includes("pilo_session="), true);
      assert.equal(cookieHeader.includes("HttpOnly"), true);

      const meResponse = await server.inject({
        method: "GET",
        url: "/auth/me",
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
        url: "/auth/logout",
        headers: {
          cookie: cookieHeader,
        },
      });
      const expiredCookieHeader = getCookieHeader(logoutResponse);

      assert.equal(logoutResponse.statusCode, 204);
      assert.equal(expiredCookieHeader.includes("Max-Age=0"), true);

      const revokedMeResponse = await server.inject({
        method: "GET",
        url: "/auth/me",
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
    const fetcher = createOAuthFetchStub(oauthRequests);
    const { server, close } = await createAuthIntegrationApp(fetcher);

    try {
      const startResponse = await server.inject({
        method: "GET",
        url: "/auth/google/start?next=%2Fworkspaces",
      });
      const authorizationUrl = getRedirectUrl(startResponse);
      const state = authorizationUrl.searchParams.get("state");
      const callbackResponse = await server.inject({
        method: "GET",
        url: `/auth/google/callback?code=google-code&state=${encodeURIComponent(
          state,
        )}`,
      });
      const cookieHeader = getCookieHeader(callbackResponse);

      const createResponse = await server.inject({
        method: "POST",
        url: "/workspaces",
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
        url: "/workspaces",
        headers: {
          cookie: cookieHeader,
        },
      });

      assert.equal(listResponse.statusCode, 200);
      assert.deepEqual(listResponse.json(), [created]);

      const detailResponse = await server.inject({
        method: "GET",
        url: `/workspaces/${created.id}`,
        headers: {
          cookie: cookieHeader,
        },
      });

      assert.equal(detailResponse.statusCode, 200);
      assert.deepEqual(detailResponse.json(), created);

      const updateResponse = await server.inject({
        method: "PATCH",
        url: `/workspaces/${created.id}`,
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
        url: "/workspaces",
      });

      assert.equal(anonymousResponse.statusCode, 401);
      assert.equal(oauthRequests.length, 2);
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
        url: "/auth/google/callback?error=access_denied",
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
        url: "/auth/google/start",
      });

      assert.equal(startResponse.statusCode, 302);

      const response = await server.inject({
        method: "GET",
        url: "/auth/google/callback?code=google-code&state=wrong-state",
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

  it("returns 401 for /auth/me without a session cookie", async () => {
    const { server, close } = await createAuthIntegrationApp();

    try {
      const response = await server.inject({
        method: "GET",
        url: "/auth/me",
      });
      const body = response.json();

      assert.equal(response.statusCode, 401);
      assert.equal(body.statusCode, 401);
    } finally {
      await close();
    }
  });
});
