import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import { URL } from "node:url";
import "ts-node/register";
import packageJson from "../package.json" with { type: "json" };
import contractSchema from "../../../docs/contracts/schemas/pilo-public-contracts.schema.json" with { type: "json" };
import canvasBoardDetailFixture from "../../../docs/contracts/fixtures/canvas-board-detail.fixture.json" with { type: "json" };
import workspaceDashboardFixture from "../../../docs/contracts/fixtures/workspace-dashboard.fixture.json" with { type: "json" };

const require = createRequire(import.meta.url);
const {
  createAuthConfig,
  normalizeAuthNextPath,
  normalizeOAuthRedirectUri,
} = require("../src/modules/auth/auth.config");
const { AuthRepository } = require("../src/modules/auth/auth.repository");
const { AuthService } = require("../src/modules/auth/auth.service");
const {
  WORKSPACE_INVITE_ROLES,
  WORKSPACE_MEMBER_ROLES,
  WORKSPACE_STATUSES,
  WORKSPACE_TYPES,
} = require("../src/modules/workspace/workspace.types");
const {
  createWorkspaceMemberPermissions,
  hasWorkspaceRole,
} = require("../src/modules/workspace/workspace.permissions");
const {
  WorkspaceAccessError,
  WorkspaceInviteError,
  WorkspaceService,
  WorkspaceValidationError,
} = require("../src/modules/workspace/workspace.service");
const {
  WorkspaceCurrentMemberAdapter,
} = require("../src/modules/workspace/workspace-current-member.adapter");
const {
  WorkspaceRepository,
} = require("../src/modules/workspace/workspace.repository");
const { CanvasRepository } = require("../src/modules/canvas/canvas.repository");
const {
  CanvasAccessError,
  CanvasConflictError,
  CanvasService,
  CanvasValidationError,
} = require("../src/modules/canvas/canvas.service");
const { NestFactory } = require("@nestjs/core");
const { FastifyAdapter } = require("@nestjs/platform-fastify");
const { AppModule } = require("../src/app.module");

function assertRequiredFields(value, schema, label) {
  for (const field of schema.required ?? []) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(value, field),
      true,
      `${label} is missing ${field}`,
    );
  }
}

describe("app-server package", () => {
  it("keeps the PILO app-server package name", () => {
    assert.equal(packageJson.name, "@pilo/app-server");
  });

  it("uses local Auth fallback when OAuth secrets are not configured", () => {
    const config = createAuthConfig({
      APP_ENV: "local",
      NODE_ENV: "development",
      FRONTEND_URL: "http://localhost:3000",
      APP_SERVER_URL: "http://localhost:4000",
    });

    assert.equal(config.frontendUrl, "http://localhost:3000");
    assert.equal(config.apiBaseUrl, "http://localhost:4000");
    assert.equal(config.session.source, "local-fallback");
    assert.equal(config.session.secretVersion, "v1");
    assert.equal(config.session.hashAlgorithm, "hmac-sha256");
    assert.equal(config.session.ttlMs, 604800000);
    assert.equal(config.session.secure, false);
    assert.equal(config.providers.google.configured, false);
    assert.equal(
      config.providers.google.callbackUrl,
      "http://localhost:4000/auth/google/callback",
    );
    assert.deepEqual(config.providers.google.missingEnv, [
      "GOOGLE_OAUTH_CLIENT_ID",
      "GOOGLE_OAUTH_CLIENT_SECRET",
    ]);
  });

  it("fails fast when required Auth production secrets are missing", () => {
    assert.throws(
      () =>
        createAuthConfig({
          APP_ENV: "production",
          NODE_ENV: "production",
        }),
      /Missing required Auth env: SESSION_SECRET/,
    );
  });

  it("keeps GitHub login OAuth scope separate from repository access", () => {
    const config = createAuthConfig({
      APP_ENV: "local",
      NODE_ENV: "development",
      SESSION_SECRET: "test-session-secret",
      GITHUB_LOGIN_CLIENT_ID: "github-login-client",
      GITHUB_LOGIN_CLIENT_SECRET: "github-login-secret",
    });

    assert.equal(config.providers.github.configured, true);
    assert.deepEqual(config.providers.github.scopes, [
      "read:user",
      "user:email",
    ]);
    assert.equal(config.providers.github.scopes.includes("repo"), false);
  });

  it("normalizes unsafe Auth next paths to the default route", () => {
    assert.equal(normalizeAuthNextPath("/workspaces/demo"), "/workspaces/demo");
    assert.equal(
      normalizeAuthNextPath("/canvas?filter=task"),
      "/canvas?filter=task",
    );
    assert.equal(normalizeAuthNextPath("https://evil.example"), "/");
    assert.equal(normalizeAuthNextPath("//evil.example"), "/");
    assert.equal(normalizeAuthNextPath(""), "/");
  });

  it("normalizes OAuth redirect_uri to the configured provider callback", () => {
    const config = createAuthConfig({
      APP_ENV: "local",
      NODE_ENV: "development",
      API_BASE_URL: "https://api.pilo.dev",
    });
    const provider = config.providers.google;

    assert.equal(
      normalizeOAuthRedirectUri(provider.callbackUrl, provider),
      "https://api.pilo.dev/auth/google/callback",
    );
    assert.equal(
      normalizeOAuthRedirectUri("https://evil.example/callback", provider),
      "https://api.pilo.dev/auth/google/callback",
    );
    assert.equal(
      normalizeOAuthRedirectUri(undefined, provider),
      "https://api.pilo.dev/auth/google/callback",
    );
  });

  it("creates and consumes OAuth state with a safe next path", () => {
    const service = new AuthService(new AuthRepository());
    const loginState = service.beginOAuthLogin(
      "google",
      "https://evil.example",
    );

    assert.equal(loginState.nextPath, "/");
    assert.equal(loginState.provider.id, "google");
    assert.equal(loginState.state.length > 20, true);
    assert.equal(loginState.nonce.length > 20, true);

    const result = service.verifyOAuthState({
      provider: "google",
      state: loginState.state,
      nonce: loginState.nonce,
    });

    assert.equal(result.valid, true);
    assert.equal(result.record.nextPath, "/");

    const replayResult = service.verifyOAuthState({
      provider: "google",
      state: loginState.state,
      nonce: loginState.nonce,
    });

    assert.deepEqual(replayResult, {
      valid: false,
      reason: "missing",
    });
  });

  it("rejects OAuth state provider and nonce mismatches", () => {
    const repository = new AuthRepository();
    const service = new AuthService(repository);
    const providerState = service.beginOAuthLogin("google", "/");
    const providerMismatch = service.verifyOAuthState({
      provider: "github",
      state: providerState.state,
      nonce: providerState.nonce,
    });
    const nonceState = service.beginOAuthLogin("github", "/canvas");
    const nonceMismatch = service.verifyOAuthState({
      provider: "github",
      state: nonceState.state,
      nonce: "wrong-nonce",
    });

    assert.deepEqual(providerMismatch, {
      valid: false,
      reason: "provider_mismatch",
    });
    assert.deepEqual(nonceMismatch, {
      valid: false,
      reason: "nonce_mismatch",
    });
  });

  it("rejects expired OAuth state records", () => {
    const repository = new AuthRepository();
    const record = repository.createOAuthState({
      provider: "google",
      nextPath: "/",
      ttlMs: 1000,
      now: new Date("2026-06-28T00:00:00.000Z"),
    });
    const result = repository.consumeOAuthState({
      provider: "google",
      state: record.state,
      nonce: record.nonce,
      now: new Date("2026-06-28T00:00:01.000Z"),
    });

    assert.deepEqual(result, {
      valid: false,
      reason: "expired",
    });
  });

  it("builds a Google authorization URL with state and nonce", () => {
    const config = createAuthConfig({
      APP_ENV: "local",
      NODE_ENV: "development",
      API_BASE_URL: "https://api.pilo.dev",
      SESSION_SECRET: "test-session-secret",
      GOOGLE_OAUTH_CLIENT_ID: "google-client",
      GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
    });
    const service = new AuthService(new AuthRepository(), { config });
    const authorization = service.createOAuthAuthorizationRedirect(
      "google",
      "/canvas",
    );
    const redirectUrl = new URL(authorization.redirectUrl);

    assert.equal(
      `${redirectUrl.origin}${redirectUrl.pathname}`,
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    assert.equal(redirectUrl.searchParams.get("client_id"), "google-client");
    assert.equal(
      redirectUrl.searchParams.get("redirect_uri"),
      "https://api.pilo.dev/auth/google/callback",
    );
    assert.equal(redirectUrl.searchParams.get("response_type"), "code");
    assert.equal(redirectUrl.searchParams.get("scope"), "openid email profile");
    assert.equal(redirectUrl.searchParams.get("state"), authorization.state);
    assert.equal(redirectUrl.searchParams.get("nonce"), authorization.nonce);
    assert.equal(authorization.nextPath, "/canvas");
  });

  it("handles a Google OAuth callback by fetching token and profile", async () => {
    const config = createAuthConfig({
      APP_ENV: "local",
      NODE_ENV: "development",
      API_BASE_URL: "https://api.pilo.dev",
      SESSION_SECRET: "test-session-secret",
      GOOGLE_OAUTH_CLIENT_ID: "google-client",
      GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
    });
    const requests = [];
    const fetcher = async (url, init) => {
      requests.push({ url: String(url), init });

      if (String(url).includes("oauth2.googleapis.com/token")) {
        return globalThis.Response.json({
          access_token: "google-access-token",
          expires_in: 3600,
          scope: "openid email profile",
          token_type: "Bearer",
        });
      }

      return globalThis.Response.json({
        sub: "google-user-123",
        email: "user@example.com",
        name: "Google User",
        picture: "https://example.com/avatar.png",
        email_verified: true,
      });
    };
    const repository = new AuthRepository();
    const service = new AuthService(repository, { config, fetcher });
    const authorization = service.createOAuthAuthorizationRedirect(
      "google",
      "/workspaces/demo",
    );
    const result = await service.handleOAuthCallback(
      "google",
      {
        code: "google-code",
        state: authorization.state,
      },
      {
        userAgent: "Mozilla/5.0",
        ipAddress: "127.0.0.1",
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.nextPath, "/workspaces/demo");
    assert.deepEqual(result.profile, {
      provider: "google",
      providerAccountId: "google-user-123",
      email: "user@example.com",
      name: "Google User",
      avatarUrl: "https://example.com/avatar.png",
      emailVerified: true,
    });
    assert.equal(result.identity.user.email, "user@example.com");
    assert.equal(result.identity.user.name, "Google User");
    assert.equal(result.identity.oauthAccount.provider, "google");
    assert.equal(
      result.identity.oauthAccount.providerUserId,
      "google-user-123",
    );
    assert.deepEqual(result.identity.oauthAccount.scopes, [
      "openid",
      "email",
      "profile",
    ]);
    assert.equal(result.identity.oauthAccount.tokenType, "Bearer");
    assert.equal(typeof result.identity.oauthAccount.tokenExpiresAt, "string");
    assert.equal(repository.listAuthSessions().length, 1);
    assert.equal(result.session.cookieName, "pilo_session");
    assert.equal(result.session.cookieHeader.includes("HttpOnly"), true);
    assert.equal(result.session.cookieHeader.includes("SameSite=Lax"), true);
    assert.equal(result.session.cookieHeader.includes("Max-Age=604800"), true);
    assert.equal(result.session.cookieHeader.includes("Secure"), false);
    assert.equal(result.session.record.userId, result.identity.user.id);
    assert.equal(result.session.record.userAgent, "Mozilla/5.0");
    assert.equal(result.session.record.ipAddress, "127.0.0.1");
    assert.equal(result.session.record.tokenHashAlgorithm, "hmac-sha256");
    assert.equal(result.session.record.secretVersion, "v1");
    assert.equal(result.session.record.refreshTokenHash.length, 64);
    assert.notEqual(
      decodeURIComponent(
        result.session.cookieHeader.match(/^pilo_session=([^;]+)/)?.[1] ?? "",
      ),
      result.session.record.refreshTokenHash,
    );
    assert.deepEqual(
      service.getCurrentUserFromCookieHeader(result.session.cookieHeader),
      {
        id: result.identity.user.id,
        name: "Google User",
        email: "user@example.com",
        avatarUrl: "https://example.com/avatar.png",
        providers: ["google"],
        lastLoginAt: result.identity.user.lastLoginAt,
      },
    );
    assert.equal(
      service.getCurrentUserFromCookieHeader(
        result.session.cookieHeader,
        new Date(result.session.expiresAt),
      ),
      null,
    );
    assert.equal(requests[0].url, "https://oauth2.googleapis.com/token");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.body.get("code"), "google-code");
    assert.equal(
      requests[0].init.body.get("redirect_uri"),
      "https://api.pilo.dev/auth/google/callback",
    );
    assert.equal(
      requests[1].init.headers.Authorization,
      "Bearer google-access-token",
    );
  });

  it("rejects a Google callback state mismatch before token exchange", async () => {
    const config = createAuthConfig({
      APP_ENV: "local",
      NODE_ENV: "development",
      SESSION_SECRET: "test-session-secret",
      GOOGLE_OAUTH_CLIENT_ID: "google-client",
      GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
    });
    let fetchCalled = false;
    const fetcher = async () => {
      fetchCalled = true;
      return globalThis.Response.json({});
    };
    const service = new AuthService(new AuthRepository(), { config, fetcher });
    const result = await service.handleOAuthCallback("google", {
      code: "google-code",
      state: "wrong-state",
    });

    assert.deepEqual(result, {
      ok: false,
      provider: "google",
      errorCode: "oauth_state_missing",
    });
    assert.equal(fetchCalled, false);
  });

  it("upserts the same OAuth provider account idempotently", async () => {
    const config = createAuthConfig({
      APP_ENV: "local",
      NODE_ENV: "development",
      API_BASE_URL: "https://api.pilo.dev",
      SESSION_SECRET: "test-session-secret",
      GOOGLE_OAUTH_CLIENT_ID: "google-client",
      GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
    });
    let profileFetchCount = 0;
    const fetcher = async (url) => {
      if (String(url).includes("oauth2.googleapis.com/token")) {
        return globalThis.Response.json({
          access_token: "google-access-token",
          scope: "openid email profile",
        });
      }

      profileFetchCount += 1;

      return globalThis.Response.json({
        sub: "google-user-123",
        email: "user@example.com",
        name: profileFetchCount === 1 ? "Google User" : "Updated User",
        picture: "https://example.com/avatar.png",
        email_verified: true,
      });
    };
    const repository = new AuthRepository();
    const service = new AuthService(repository, { config, fetcher });
    const firstAuthorization = service.createOAuthAuthorizationRedirect(
      "google",
      "/",
    );
    const firstResult = await service.handleOAuthCallback("google", {
      code: "first-code",
      state: firstAuthorization.state,
    });
    const secondAuthorization = service.createOAuthAuthorizationRedirect(
      "google",
      "/",
    );
    const secondResult = await service.handleOAuthCallback("google", {
      code: "second-code",
      state: secondAuthorization.state,
    });

    assert.equal(firstResult.ok, true);
    assert.equal(secondResult.ok, true);
    assert.equal(repository.listUsers().length, 1);
    assert.equal(repository.listOAuthAccounts().length, 1);
    assert.equal(secondResult.identity.user.id, firstResult.identity.user.id);
    assert.equal(
      secondResult.identity.oauthAccount.id,
      firstResult.identity.oauthAccount.id,
    );
    assert.equal(repository.listUsers()[0].name, "Updated User");
  });

  it("builds a GitHub authorization URL without repository scope", () => {
    const config = createAuthConfig({
      APP_ENV: "local",
      NODE_ENV: "development",
      API_BASE_URL: "https://api.pilo.dev",
      SESSION_SECRET: "test-session-secret",
      GITHUB_LOGIN_CLIENT_ID: "github-login-client",
      GITHUB_LOGIN_CLIENT_SECRET: "github-login-secret",
    });
    const service = new AuthService(new AuthRepository(), { config });
    const authorization = service.createOAuthAuthorizationRedirect(
      "github",
      "/",
    );
    const redirectUrl = new URL(authorization.redirectUrl);

    assert.equal(
      `${redirectUrl.origin}${redirectUrl.pathname}`,
      "https://github.com/login/oauth/authorize",
    );
    assert.equal(
      redirectUrl.searchParams.get("client_id"),
      "github-login-client",
    );
    assert.equal(
      redirectUrl.searchParams.get("redirect_uri"),
      "https://api.pilo.dev/auth/github/callback",
    );
    assert.equal(redirectUrl.searchParams.get("scope"), "read:user user:email");
    assert.equal(redirectUrl.searchParams.get("scope").includes("repo"), false);
    assert.equal(redirectUrl.searchParams.get("state"), authorization.state);
  });

  it("handles a GitHub OAuth callback by fetching token and profile", async () => {
    const config = createAuthConfig({
      APP_ENV: "local",
      NODE_ENV: "development",
      API_BASE_URL: "https://api.pilo.dev",
      SESSION_SECRET: "test-session-secret",
      GITHUB_LOGIN_CLIENT_ID: "github-login-client",
      GITHUB_LOGIN_CLIENT_SECRET: "github-login-secret",
    });
    const requests = [];
    const fetcher = async (url, init) => {
      requests.push({ url: String(url), init });

      if (String(url).includes("github.com/login/oauth/access_token")) {
        return globalThis.Response.json({ access_token: "github-token" });
      }

      return globalThis.Response.json({
        id: 123456,
        login: "octo-user",
        email: "octo@example.com",
        avatar_url: "https://avatars.githubusercontent.com/u/123456",
      });
    };
    const service = new AuthService(new AuthRepository(), { config, fetcher });
    const authorization = service.createOAuthAuthorizationRedirect(
      "github",
      "/canvas",
    );
    const result = await service.handleOAuthCallback("github", {
      code: "github-code",
      state: authorization.state,
    });

    assert.equal(result.ok, true);
    assert.equal(result.nextPath, "/canvas");
    assert.deepEqual(result.profile, {
      provider: "github",
      providerAccountId: "123456",
      email: "octo@example.com",
      name: "octo-user",
      avatarUrl: "https://avatars.githubusercontent.com/u/123456",
      emailVerified: null,
    });
    assert.equal(
      requests[0].url,
      "https://github.com/login/oauth/access_token",
    );
    assert.equal(requests[0].init.body.get("code"), "github-code");
    assert.equal(
      requests[0].init.body.get("redirect_uri"),
      "https://api.pilo.dev/auth/github/callback",
    );
    assert.equal(requests[1].url, "https://api.github.com/user");
    assert.equal(requests[1].init.headers.Authorization, "Bearer github-token");
  });

  it("creates frontend-compatible GitHub login result redirects", () => {
    const config = createAuthConfig({
      APP_ENV: "local",
      NODE_ENV: "development",
      FRONTEND_URL: "https://app.pilo.dev",
    });
    const service = new AuthService(new AuthRepository(), { config });

    assert.equal(
      service.createLoginResultRedirect({
        provider: "github",
        status: "success",
        nextPath: "/canvas",
      }),
      "https://app.pilo.dev/login?auth=success&provider=github&next=%2Fcanvas",
    );
    assert.equal(
      service.createLoginResultRedirect({
        provider: "github",
        status: "error",
        errorCode: "access_denied",
      }),
      "https://app.pilo.dev/login?auth=error&provider=github&error=access_denied",
    );
  });

  it("uses Secure session cookies by default in production", () => {
    const config = createAuthConfig({
      APP_ENV: "production",
      NODE_ENV: "production",
      SESSION_SECRET: "test-session-secret",
      GOOGLE_OAUTH_CLIENT_ID: "google-client",
      GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
      GITHUB_LOGIN_CLIENT_ID: "github-login-client",
      GITHUB_LOGIN_CLIENT_SECRET: "github-login-secret",
    });

    assert.equal(config.session.secure, true);
  });

  it("returns null CurrentUser when session cookie is missing or user is deleted", async () => {
    const config = createAuthConfig({
      APP_ENV: "local",
      NODE_ENV: "development",
      SESSION_SECRET: "test-session-secret",
      GOOGLE_OAUTH_CLIENT_ID: "google-client",
      GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
    });
    const fetcher = async (url) => {
      if (String(url).includes("oauth2.googleapis.com/token")) {
        return globalThis.Response.json({
          access_token: "google-access-token",
        });
      }

      return globalThis.Response.json({
        sub: "google-user-123",
        email: "user@example.com",
        name: "Google User",
      });
    };
    const repository = new AuthRepository();
    const service = new AuthService(repository, { config, fetcher });
    const authorization = service.createOAuthAuthorizationRedirect(
      "google",
      "/",
    );
    const result = await service.handleOAuthCallback("google", {
      code: "google-code",
      state: authorization.state,
    });

    assert.equal(service.getCurrentUserFromCookieHeader(undefined), null);
    assert.equal(result.ok, true);

    repository.markUserDeleted(result.identity.user.id);

    assert.equal(
      service.getCurrentUserFromCookieHeader(result.session.cookieHeader),
      null,
    );
  });

  it("revokes the current session and expires the cookie on logout", async () => {
    const config = createAuthConfig({
      APP_ENV: "local",
      NODE_ENV: "development",
      SESSION_SECRET: "test-session-secret",
      GOOGLE_OAUTH_CLIENT_ID: "google-client",
      GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
    });
    const fetcher = async (url) => {
      if (String(url).includes("oauth2.googleapis.com/token")) {
        return globalThis.Response.json({
          access_token: "google-access-token",
        });
      }

      return globalThis.Response.json({
        sub: "google-user-123",
        email: "user@example.com",
        name: "Google User",
      });
    };
    const repository = new AuthRepository();
    const service = new AuthService(repository, { config, fetcher });
    const authorization = service.createOAuthAuthorizationRedirect(
      "google",
      "/",
    );
    const result = await service.handleOAuthCallback("google", {
      code: "google-code",
      state: authorization.state,
    });

    assert.notEqual(
      service.getCurrentUserFromCookieHeader(result.session.cookieHeader),
      null,
    );

    const logoutResult = service.logoutFromCookieHeader(
      result.session.cookieHeader,
    );

    assert.equal(logoutResult.revoked, true);
    assert.equal(logoutResult.cookieHeader.includes("Max-Age=0"), true);
    assert.equal(
      logoutResult.cookieHeader.includes(
        "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      ),
      true,
    );
    assert.equal(repository.listAuthSessions()[0].revokedAt !== null, true);
    assert.equal(
      service.getCurrentUserFromCookieHeader(result.session.cookieHeader),
      null,
    );

    const secondLogoutResult = service.logoutFromCookieHeader(
      result.session.cookieHeader,
    );

    assert.equal(secondLogoutResult.revoked, true);
    assert.equal(secondLogoutResult.cookieHeader.includes("Max-Age=0"), true);

    const anonymousLogoutResult = service.logoutFromCookieHeader(undefined);

    assert.equal(anonymousLogoutResult.revoked, false);
    assert.equal(
      anonymousLogoutResult.cookieHeader.includes("Max-Age=0"),
      true,
    );
  });

  it("rejects a session cookie when the session secret no longer matches", async () => {
    const baseEnv = {
      APP_ENV: "local",
      NODE_ENV: "development",
      GOOGLE_OAUTH_CLIENT_ID: "google-client",
      GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
    };
    const fetcher = async (url) => {
      if (String(url).includes("oauth2.googleapis.com/token")) {
        return globalThis.Response.json({
          access_token: "google-access-token",
        });
      }

      return globalThis.Response.json({
        sub: "google-user-123",
        email: "user@example.com",
        name: "Google User",
      });
    };
    const repository = new AuthRepository();
    const issuingService = new AuthService(repository, {
      config: createAuthConfig({
        ...baseEnv,
        SESSION_SECRET: "old-session-secret",
        AUTH_SESSION_SECRET_VERSION: "old",
      }),
      fetcher,
    });
    const authorization = issuingService.createOAuthAuthorizationRedirect(
      "google",
      "/",
    );
    const result = await issuingService.handleOAuthCallback("google", {
      code: "google-code",
      state: authorization.state,
    });
    const rotatedService = new AuthService(repository, {
      config: createAuthConfig({
        ...baseEnv,
        SESSION_SECRET: "new-session-secret",
        AUTH_SESSION_SECRET_VERSION: "new",
      }),
      fetcher,
    });

    assert.equal(result.session.record.secretVersion, "old");
    assert.equal(
      rotatedService.getCurrentUserFromCookieHeader(
        result.session.cookieHeader,
      ),
      null,
    );
  });

  it("exposes Auth provider readiness without leaking secrets", () => {
    const service = new AuthService(new AuthRepository());
    const response = service.getProviders();

    assert.equal(response.providers.length, 2);
    assert.equal(response.providers[0].startPath.startsWith("/auth/"), true);
    assert.equal(response.providers[0].callbackUrl.includes("/auth/"), true);
    assert.equal(JSON.stringify(response).includes("clientSecret"), false);
    assert.equal(JSON.stringify(response).includes("secret"), false);
  });

  it("keeps Workspace scaffold enums aligned with the public contract schema", () => {
    assert.deepEqual(
      WORKSPACE_TYPES,
      contractSchema.$defs.WorkspaceSummary.properties.type.enum,
    );
    assert.deepEqual(
      WORKSPACE_STATUSES,
      contractSchema.$defs.WorkspaceSummary.properties.status.enum,
    );
    assert.deepEqual(
      WORKSPACE_MEMBER_ROLES,
      contractSchema.$defs.WorkspaceMemberSummary.properties.role.enum,
    );
    assert.deepEqual(
      WORKSPACE_MEMBER_ROLES,
      contractSchema.$defs.WorkspaceSummary.properties.myRole.enum,
    );
    assert.deepEqual(WORKSPACE_INVITE_ROLES, ["member", "viewer"]);
  });

  it("keeps Workspace dashboard read model schema aligned with fixture fields", () => {
    const defs = contractSchema.$defs;

    assert.deepEqual(defs.WorkspaceSummary.required, [
      "id",
      "name",
      "description",
      "type",
      "status",
      "myRole",
      "memberCount",
      "createdAt",
    ]);
    assert.deepEqual(defs.WorkspaceMemberSummary.required, [
      "memberId",
      "userId",
      "name",
      "email",
      "avatarUrl",
      "role",
      "displayName",
      "joinedAt",
    ]);
    assert.deepEqual(defs.DashboardPreferences.required, [
      "workspaceId",
      "memberId",
      "layout",
      "hiddenSections",
      "updatedAt",
    ]);
    assert.deepEqual(defs.CurrentWorkspaceMember.required, [
      "workspaceId",
      "memberId",
      "userId",
      "role",
      "displayName",
    ]);
    assert.deepEqual(defs.WorkspaceDashboardReadModel.required, [
      "workspace",
      "currentMember",
      "preferences",
      "members",
      "tasks",
      "progress",
      "githubIssues",
      "pullRequests",
      "meetingReports",
      "prAnalyses",
      "agentActions",
      "canvasEntities",
      "source",
      "generatedAt",
    ]);

    assert.equal(
      defs.WorkspaceDashboardReadModel.properties.tasks.items.$ref,
      "#/$defs/TaskSummary",
    );
    assert.equal(
      defs.WorkspaceDashboardReadModel.properties.githubIssues.items.$ref,
      "#/$defs/GithubIssueSummary",
    );
    assert.equal(
      defs.WorkspaceDashboardReadModel.properties.pullRequests.items.$ref,
      "#/$defs/PullRequestSummary",
    );
    assert.equal(
      defs.WorkspaceDashboardReadModel.properties.meetingReports.items.$ref,
      "#/$defs/MeetingReportSummary",
    );
    assert.equal(
      defs.WorkspaceDashboardReadModel.properties.prAnalyses.items.$ref,
      "#/$defs/PRAnalysisSummary",
    );
    assert.equal(
      defs.WorkspaceDashboardReadModel.properties.agentActions.items.$ref,
      "#/$defs/AgentAction",
    );
    assert.equal(
      defs.WorkspaceDashboardReadModel.properties.canvasEntities.items.$ref,
      "#/$defs/CanvasEntityRef",
    );
    assert.deepEqual(defs.WorkspaceDashboardReadModel.properties.source.enum, [
      "fixture",
      "empty",
    ]);

    const currentMember = {
      workspaceId: workspaceDashboardFixture.workspace.id,
      memberId: workspaceDashboardFixture.members[0].memberId,
      userId: workspaceDashboardFixture.currentUser.id,
      role: workspaceDashboardFixture.members[0].role,
      displayName: workspaceDashboardFixture.members[0].displayName,
    };
    const preferences = {
      workspaceId: workspaceDashboardFixture.workspace.id,
      memberId: workspaceDashboardFixture.members[0].memberId,
      layout: {},
      hiddenSections: [],
      updatedAt: null,
    };
    const aggregate = {
      workspace: workspaceDashboardFixture.workspace,
      currentMember,
      preferences,
      members: workspaceDashboardFixture.members,
      tasks: workspaceDashboardFixture.tasks,
      progress: workspaceDashboardFixture.progress,
      githubIssues: workspaceDashboardFixture.githubIssues,
      pullRequests: workspaceDashboardFixture.pullRequests,
      meetingReports: workspaceDashboardFixture.meetingReports,
      prAnalyses: workspaceDashboardFixture.prAnalyses,
      agentActions: workspaceDashboardFixture.agentActions,
      canvasEntities: workspaceDashboardFixture.canvasEntities,
      source: "fixture",
      generatedAt: "2026-06-28T00:00:00.000Z",
    };

    assertRequiredFields(
      aggregate,
      defs.WorkspaceDashboardReadModel,
      "WorkspaceDashboardReadModel",
    );
    assertRequiredFields(
      workspaceDashboardFixture.workspace,
      defs.WorkspaceSummary,
      "fixture.workspace",
    );
    assertRequiredFields(
      workspaceDashboardFixture.members[0],
      defs.WorkspaceMemberSummary,
      "fixture.members[0]",
    );
    assertRequiredFields(
      currentMember,
      defs.CurrentWorkspaceMember,
      "aggregate.currentMember",
    );
    assertRequiredFields(
      preferences,
      defs.DashboardPreferences,
      "aggregate.preferences",
    );
    assertRequiredFields(
      workspaceDashboardFixture.tasks[0],
      defs.TaskSummary,
      "fixture.tasks[0]",
    );
    assertRequiredFields(
      workspaceDashboardFixture.progress,
      defs.ProgressSummary,
      "fixture.progress",
    );
    assertRequiredFields(
      workspaceDashboardFixture.githubIssues[0],
      defs.GithubIssueSummary,
      "fixture.githubIssues[0]",
    );
    assertRequiredFields(
      workspaceDashboardFixture.pullRequests[0],
      defs.PullRequestSummary,
      "fixture.pullRequests[0]",
    );
    assertRequiredFields(
      workspaceDashboardFixture.meetingReports[0],
      defs.MeetingReportSummary,
      "fixture.meetingReports[0]",
    );
    assertRequiredFields(
      workspaceDashboardFixture.prAnalyses[0],
      defs.PRAnalysisSummary,
      "fixture.prAnalyses[0]",
    );
    assertRequiredFields(
      workspaceDashboardFixture.agentActions[0],
      defs.AgentAction,
      "fixture.agentActions[0]",
    );
    assertRequiredFields(
      workspaceDashboardFixture.canvasEntities[0],
      defs.CanvasEntityRef,
      "fixture.canvasEntities[0]",
    );
  });

  it("keeps Canvas board detail and write DTO schemas aligned with fixtures", () => {
    const defs = contractSchema.$defs;

    assert.deepEqual(defs.CanvasEntityType.enum, [
      "task",
      "meeting_report",
      "pull_request",
      "github_issue",
      "document",
      "file",
      "code",
      "decision",
      "risk",
    ]);
    assert.deepEqual(defs.CanvasBoardType.enum, [
      "project_map",
      "meeting",
      "review",
      "custom",
    ]);
    assert.deepEqual(defs.CanvasBoardDetail.required, [
      "id",
      "workspaceId",
      "title",
      "boardType",
      "shapeCount",
      "connectionCount",
      "updatedAt",
      "shapes",
      "connections",
      "viewSetting",
      "filterSetting",
    ]);
    assert.deepEqual(defs.CanvasShapeRequest.required, [
      "shapeType",
      "entityType",
      "entityId",
      "displayTitle",
      "width",
      "height",
      "color",
    ]);
    assert.deepEqual(defs.CanvasConnectionRequest.required, [
      "sourceShapeId",
      "targetShapeId",
      "connectionType",
      "label",
    ]);
    assert.equal(defs.CanvasPositionRequest.$ref, "#/$defs/CanvasPosition");
    assert.deepEqual(defs.CanvasViewSetting.required, [
      "zoom",
      "viewportX",
      "viewportY",
    ]);
    assert.deepEqual(defs.CanvasFilterSetting.required, [
      "enabledEntityTypes",
      "assigneeMemberId",
      "showDelayedOnly",
      "showRiskOnly",
      "filters",
    ]);
    assert.equal(
      defs.CanvasEntityRef.properties.entityType.$ref,
      "#/$defs/CanvasEntityType",
    );
    assert.equal(
      defs.CanvasEntityRef.properties.shapeType.$ref,
      "#/$defs/CanvasEntityType",
    );

    assert.deepEqual(
      Object.keys(canvasBoardDetailFixture).sort(),
      Object.keys(defs.CanvasBoardDetail.properties).sort(),
    );
    assertRequiredFields(
      canvasBoardDetailFixture,
      defs.CanvasBoardDetail,
      "canvasBoardDetailFixture",
    );
    assertRequiredFields(
      canvasBoardDetailFixture.shapes[0],
      defs.CanvasShapeSummary,
      "canvasBoardDetailFixture.shapes[0]",
    );
    assertRequiredFields(
      canvasBoardDetailFixture.connections[0],
      defs.CanvasConnectionSummary,
      "canvasBoardDetailFixture.connections[0]",
    );
    assert.deepEqual(canvasBoardDetailFixture.viewSetting, {
      zoom: 1,
      viewportX: 0,
      viewportY: 0,
    });
    assert.deepEqual(canvasBoardDetailFixture.filterSetting, {
      enabledEntityTypes: ["task", "meeting_report", "pull_request"],
      assigneeMemberId: null,
      showDelayedOnly: false,
      showRiskOnly: false,
      filters: {},
    });
  });

  it("resolves currentMember from currentUser without leaking Auth session details", async () => {
    const repositoryCalls = [];
    const service = new WorkspaceService({
      storageMode: "test",
      async findCurrentMember(input) {
        repositoryCalls.push(input);

        return {
          id: "member-1",
          workspaceId: input.workspaceId,
          userId: input.userId,
          name: "Workspace User",
          email: "workspace@example.com",
          avatarUrl: null,
          role: "owner",
          displayName: "Workspace / Canvas",
          joinedAt: "2026-06-28T00:00:00.000Z",
          createdAt: "2026-06-28T00:00:00.000Z",
          updatedAt: "2026-06-28T00:00:00.000Z",
        };
      },
    });

    const currentMember = await service.resolveCurrentMember({
      workspaceId: "workspace-1",
      currentUser: {
        id: "user-1",
        email: "user@example.com",
        providers: ["google"],
      },
    });

    assert.deepEqual(repositoryCalls, [
      {
        workspaceId: "workspace-1",
        userId: "user-1",
      },
    ]);
    assert.deepEqual(currentMember, {
      workspaceId: "workspace-1",
      memberId: "member-1",
      userId: "user-1",
      role: "owner",
      displayName: "Workspace / Canvas",
    });
    assert.equal("providers" in currentMember, false);
    assert.equal("email" in currentMember, false);
  });

  it("maps workspace role helpers to read, write, and manage permissions", () => {
    assert.equal(hasWorkspaceRole("owner", "viewer"), true);
    assert.equal(hasWorkspaceRole("owner", "member"), true);
    assert.equal(hasWorkspaceRole("member", "owner"), false);
    assert.deepEqual(createWorkspaceMemberPermissions("viewer"), {
      canRead: true,
      canWrite: false,
      canManage: false,
    });
    assert.deepEqual(createWorkspaceMemberPermissions("member"), {
      canRead: true,
      canWrite: true,
      canManage: false,
    });
    assert.deepEqual(createWorkspaceMemberPermissions("owner"), {
      canRead: true,
      canWrite: true,
      canManage: true,
    });
  });

  it("requires workspace membership before exposing member-scoped context", async () => {
    const service = new WorkspaceService({
      storageMode: "test",
      async findCurrentMember() {
        return null;
      },
    });

    await assert.rejects(
      () =>
        service.requireCurrentMember({
          workspaceId: "workspace-1",
          currentUser: { id: "user-1" },
        }),
      (error) =>
        error instanceof WorkspaceAccessError &&
        error.code === "workspace_member_not_found" &&
        error.workspaceId === "workspace-1",
    );
  });

  it("provides currentMember context through the public workspace adapter", async () => {
    const service = new WorkspaceService(new WorkspaceRepository());
    const adapter = new WorkspaceCurrentMemberAdapter(service);
    const currentUser = {
      id: "user-1",
      name: "Workspace Owner",
      email: "owner@example.com",
      avatarUrl: "https://example.com/owner.png",
    };
    const created = await service.createWorkspace({
      currentUser,
      body: {
        name: "PILO",
      },
    });
    const context = await adapter.requireCurrentMember(
      {
        workspaceId: created.id,
        currentUser,
      },
      { minimumRole: "owner" },
    );

    assert.deepEqual(context.currentMember, {
      workspaceId: created.id,
      memberId: context.currentMember.memberId,
      userId: currentUser.id,
      role: "owner",
      displayName: "Workspace Owner",
    });
    assert.deepEqual(context.permissions, {
      canRead: true,
      canWrite: true,
      canManage: true,
    });
    assert.equal("email" in context.currentMember, false);
    assert.equal("avatarUrl" in context.currentMember, false);
  });

  it("creates, lists, reads, and archives workspaces for the current member", async () => {
    const service = new WorkspaceService(new WorkspaceRepository());
    const currentUser = {
      id: "user-1",
      name: "Workspace Owner",
    };
    const created = await service.createWorkspace({
      currentUser,
      body: {
        name: " PILO ",
        description: "AI Project OS",
        type: "bootcamp",
      },
    });

    assert.equal(created.name, "PILO");
    assert.equal(created.description, "AI Project OS");
    assert.equal(created.type, "bootcamp");
    assert.equal(created.status, "active");
    assert.equal(created.myRole, "owner");
    assert.equal(created.memberCount, 1);
    assert.deepEqual(await service.listWorkspaces({ currentUser }), [created]);
    assert.deepEqual(
      await service.getWorkspace({
        workspaceId: created.id,
        currentUser,
      }),
      created,
    );

    const archived = await service.updateWorkspace({
      workspaceId: created.id,
      currentUser,
      body: {
        name: "PILO Lab",
        status: "archived",
      },
    });

    assert.equal(archived.name, "PILO Lab");
    assert.equal(archived.status, "archived");
    assert.equal(
      (
        await service.getWorkspace({
          workspaceId: created.id,
          currentUser,
        })
      ).status,
      "archived",
    );
  });

  it("lists workspace members using the WorkspaceMemberSummary contract", async () => {
    const service = new WorkspaceService(new WorkspaceRepository());
    const currentUser = {
      id: "user-1",
      name: "Workspace Owner",
      email: "owner@example.com",
      avatarUrl: "https://example.com/owner.png",
    };
    const created = await service.createWorkspace({
      currentUser,
      body: {
        name: "PILO",
      },
    });
    const members = await service.listWorkspaceMembers({
      workspaceId: created.id,
      currentUser,
    });

    assert.equal(members.length, 1);
    assert.deepEqual(Object.keys(members[0]).sort(), [
      "avatarUrl",
      "displayName",
      "email",
      "joinedAt",
      "memberId",
      "name",
      "role",
      "userId",
    ]);
    assert.equal(members[0].userId, currentUser.id);
    assert.equal(members[0].name, "Workspace Owner");
    assert.equal(members[0].email, "owner@example.com");
    assert.equal(members[0].avatarUrl, "https://example.com/owner.png");
    assert.equal(members[0].role, "owner");
  });

  it("creates and accepts workspace invites into membership", async () => {
    const service = new WorkspaceService(new WorkspaceRepository());
    const owner = {
      id: "owner-1",
      name: "Workspace Owner",
      email: "owner@example.com",
    };
    const invitee = {
      id: "user-2",
      name: "Invited Member",
      email: "member@example.com",
      avatarUrl: "https://example.com/member.png",
    };
    const workspace = await service.createWorkspace({
      currentUser: owner,
      body: {
        name: "PILO",
      },
    });
    const invite = await service.createWorkspaceInvite({
      workspaceId: workspace.id,
      currentUser: owner,
      body: {
        email: " MEMBER@example.com ",
        role: "member",
      },
    });
    const accepted = await service.acceptWorkspaceInvite({
      inviteId: invite.id,
      currentUser: invitee,
      body: {
        token: invite.token,
      },
    });
    const members = await service.listWorkspaceMembers({
      workspaceId: workspace.id,
      currentUser: owner,
    });

    assert.equal(invite.email, "member@example.com");
    assert.equal(invite.role, "member");
    assert.equal(typeof invite.token, "string");
    assert.equal(accepted.workspaceId, workspace.id);
    assert.deepEqual(accepted.member, {
      memberId: accepted.member.memberId,
      userId: invitee.id,
      name: "Invited Member",
      email: "member@example.com",
      avatarUrl: "https://example.com/member.png",
      role: "member",
      displayName: "Invited Member",
      joinedAt: accepted.member.joinedAt,
    });
    assert.equal(members.length, 2);
  });

  it("keeps dashboard preferences scoped to each workspace member", async () => {
    const service = new WorkspaceService(new WorkspaceRepository());
    const owner = {
      id: "owner-1",
      name: "Workspace Owner",
      email: "owner@example.com",
    };
    const invitee = {
      id: "user-2",
      name: "Invited Member",
      email: "member@example.com",
    };
    const workspace = await service.createWorkspace({
      currentUser: owner,
      body: {
        name: "PILO",
      },
    });
    const defaultPreferences = await service.getDashboardPreferences({
      workspaceId: workspace.id,
      currentUser: owner,
    });
    const ownerPreferences = await service.updateDashboardPreferences({
      workspaceId: workspace.id,
      currentUser: owner,
      body: {
        layout: {
          density: "compact",
          columns: ["tasks", "prs"],
        },
        hiddenSections: ["agent", "agent"],
      },
    });
    const invite = await service.createWorkspaceInvite({
      workspaceId: workspace.id,
      currentUser: owner,
      body: {
        email: invitee.email,
      },
    });

    await service.acceptWorkspaceInvite({
      inviteId: invite.id,
      currentUser: invitee,
      body: {
        token: invite.token,
      },
    });

    const memberPreferences = await service.updateDashboardPreferences({
      workspaceId: workspace.id,
      currentUser: invitee,
      body: {
        layout: {
          density: "comfortable",
          columns: ["meetings"],
        },
        hiddenSections: ["recentDecisions"],
      },
    });
    const reloadedOwnerPreferences = await service.getDashboardPreferences({
      workspaceId: workspace.id,
      currentUser: owner,
    });

    assert.deepEqual(defaultPreferences.layout, {});
    assert.deepEqual(defaultPreferences.hiddenSections, []);
    assert.equal(defaultPreferences.updatedAt, null);
    assert.deepEqual(ownerPreferences.layout, {
      density: "compact",
      columns: ["tasks", "prs"],
    });
    assert.deepEqual(ownerPreferences.hiddenSections, ["agent"]);
    assert.notEqual(ownerPreferences.memberId, memberPreferences.memberId);
    assert.deepEqual(memberPreferences.layout, {
      density: "comfortable",
      columns: ["meetings"],
    });
    assert.deepEqual(reloadedOwnerPreferences, ownerPreferences);
  });

  it("aggregates workspace dashboard read models without owning other domain data", async () => {
    const service = new WorkspaceService(new WorkspaceRepository());
    const owner = {
      id: "owner-1",
      name: "Workspace Owner",
      email: "owner@example.com",
    };
    const workspace = await service.createWorkspace({
      currentUser: owner,
      body: {
        name: "PILO",
      },
    });

    await service.updateDashboardPreferences({
      workspaceId: workspace.id,
      currentUser: owner,
      body: {
        layout: {
          density: "comfortable",
          sections: ["today", "pullRequests"],
        },
        hiddenSections: ["agentSuggestions"],
      },
    });

    const dashboard = await service.getWorkspaceDashboard({
      workspaceId: workspace.id,
      currentUser: owner,
    });

    assert.equal(dashboard.workspace.id, workspace.id);
    assert.equal(dashboard.currentMember.workspaceId, workspace.id);
    assert.equal(dashboard.currentMember.userId, owner.id);
    assert.deepEqual(dashboard.preferences.layout, {
      density: "comfortable",
      sections: ["today", "pullRequests"],
    });
    assert.deepEqual(dashboard.preferences.hiddenSections, [
      "agentSuggestions",
    ]);
    assert.equal(dashboard.members.length, 1);
    assert.equal(dashboard.source, "fixture");
    assert.equal(dashboard.tasks.length > 0, true);
    assert.equal(dashboard.progress.workspaceId, workspace.id);
    assert.equal(dashboard.meetingReports[0].workspaceId, workspace.id);
    assert.equal(dashboard.agentActions[0].payload.workspaceId, workspace.id);
    assert.equal("providers" in dashboard.currentMember, false);
  });

  it("scaffolds Canvas repository interfaces for boards and member settings", async () => {
    const repository = new CanvasRepository();

    assert.deepEqual(repository.storageMode, "memory");
    assert.deepEqual(
      await repository.listBoardsForWorkspace("workspace-1"),
      [],
    );
    assert.equal(await repository.findBoardWorkspaceId("missing-board"), null);
    assert.equal(
      await repository.findBoardDetail({
        boardId: "missing-board",
        memberId: "member-1",
      }),
      null,
    );
  });

  it("persists Canvas shape positions and reflects them in board detail", async () => {
    const repository = new CanvasRepository();
    repository.boardsById.set("board-1", {
      id: "board-1",
      workspaceId: "workspace-1",
      title: "Project Map",
      boardType: "project_map",
      createdByMemberId: "member-1",
      createdAt: "2026-06-28T00:00:00.000Z",
      updatedAt: "2026-06-28T00:00:00.000Z",
      deletedAt: null,
    });
    repository.shapesById.set("shape-1", {
      id: "shape-1",
      boardId: "board-1",
      shapeType: "task",
      entityType: "task",
      entityId: "44444444-4444-4444-8444-444444444441",
      displayTitle: "Login API",
      width: 280,
      height: 160,
      color: "#6d5bd6",
      isCollapsed: false,
      zIndex: 1,
      createdByMemberId: "member-1",
      createdAt: "2026-06-28T00:00:00.000Z",
      updatedAt: "2026-06-28T00:00:00.000Z",
      deletedAt: null,
    });

    const savedShape = await repository.upsertShapePosition({
      shapeId: "shape-1",
      x: 144,
      y: 288,
      now: new Date("2026-06-28T00:03:00.000Z"),
    });
    const board = await repository.findBoardDetail({
      boardId: "board-1",
      memberId: "member-1",
    });

    assert.deepEqual(savedShape.position, {
      x: 144,
      y: 288,
    });
    assert.deepEqual(board.shapes[0].position, {
      x: 144,
      y: 288,
    });
    assert.equal(board.updatedAt, "2026-06-28T00:03:00.000Z");
  });

  it("creates, deduplicates, and soft-deletes Canvas connections in one board", async () => {
    const repository = new CanvasRepository();
    repository.boardsById.set("board-1", {
      id: "board-1",
      workspaceId: "workspace-1",
      title: "Project Map",
      boardType: "project_map",
      createdByMemberId: "member-1",
      createdAt: "2026-06-28T00:00:00.000Z",
      updatedAt: "2026-06-28T00:00:00.000Z",
      deletedAt: null,
    });
    repository.boardsById.set("board-2", {
      id: "board-2",
      workspaceId: "workspace-1",
      title: "Review Map",
      boardType: "review",
      createdByMemberId: "member-1",
      createdAt: "2026-06-28T00:00:00.000Z",
      updatedAt: "2026-06-28T00:00:00.000Z",
      deletedAt: null,
    });

    for (const shape of [
      {
        id: "shape-1",
        boardId: "board-1",
        displayTitle: "Task",
        zIndex: 1,
      },
      {
        id: "shape-2",
        boardId: "board-1",
        displayTitle: "PR",
        zIndex: 2,
      },
      {
        id: "shape-3",
        boardId: "board-2",
        displayTitle: "Other board",
        zIndex: 1,
      },
    ]) {
      repository.shapesById.set(shape.id, {
        id: shape.id,
        boardId: shape.boardId,
        shapeType: "task",
        entityType: "task",
        entityId: "44444444-4444-4444-8444-444444444441",
        displayTitle: shape.displayTitle,
        width: 280,
        height: 160,
        color: "#6d5bd6",
        isCollapsed: false,
        zIndex: shape.zIndex,
        createdByMemberId: "member-1",
        createdAt: "2026-06-28T00:00:00.000Z",
        updatedAt: "2026-06-28T00:00:00.000Z",
        deletedAt: null,
      });
    }

    const created = await repository.createConnectionForBoard({
      boardId: "board-1",
      sourceShapeId: "shape-1",
      targetShapeId: "shape-2",
      connectionType: "implemented_by",
      label: "Task to PR",
      now: new Date("2026-06-28T00:04:00.000Z"),
    });
    const duplicate = await repository.createConnectionForBoard({
      boardId: "board-1",
      sourceShapeId: "shape-1",
      targetShapeId: "shape-2",
      connectionType: "implemented_by",
      label: "Duplicate label",
    });
    const crossBoard = await repository.createConnectionForBoard({
      boardId: "board-1",
      sourceShapeId: "shape-1",
      targetShapeId: "shape-3",
      connectionType: "related_to",
      label: null,
    });
    const boardWithConnection = await repository.findBoardDetail({
      boardId: "board-1",
      memberId: "member-1",
    });

    assert.equal(created.status, "created");
    assert.equal(duplicate.status, "duplicate");
    assert.equal(crossBoard.status, "invalid");
    assert.equal(boardWithConnection.connectionCount, 1);
    assert.deepEqual(boardWithConnection.connections, [created.connection]);
    assert.equal(
      await repository.findConnectionWorkspaceId(created.connection.id),
      "workspace-1",
    );

    const deleted = await repository.deleteConnection({
      connectionId: created.connection.id,
      now: new Date("2026-06-28T00:05:00.000Z"),
    });
    const secondDelete = await repository.deleteConnection({
      connectionId: created.connection.id,
    });
    const boardAfterDelete = await repository.findBoardDetail({
      boardId: "board-1",
      memberId: "member-1",
    });

    assert.deepEqual(deleted, {
      id: created.connection.id,
      deleted: true,
    });
    assert.equal(secondDelete, null);
    assert.equal(boardAfterDelete.connectionCount, 0);
    assert.deepEqual(boardAfterDelete.connections, []);
    assert.equal(boardAfterDelete.updatedAt, "2026-06-28T00:05:00.000Z");
  });

  it("stores Canvas view and filter settings per member", async () => {
    const repository = new CanvasRepository();
    repository.boardsById.set("board-1", {
      id: "board-1",
      workspaceId: "workspace-1",
      title: "Project Map",
      boardType: "project_map",
      createdByMemberId: "member-1",
      createdAt: "2026-06-28T00:00:00.000Z",
      updatedAt: "2026-06-28T00:00:00.000Z",
      deletedAt: null,
    });

    const memberOneView = await repository.upsertViewSettingForBoard({
      boardId: "board-1",
      memberId: "member-1",
      zoom: 1.25,
      viewportX: 120,
      viewportY: -80,
      now: new Date("2026-06-28T00:06:00.000Z"),
    });
    const memberTwoView = await repository.upsertViewSettingForBoard({
      boardId: "board-1",
      memberId: "member-2",
      zoom: 0.75,
      viewportX: -40,
      viewportY: 220,
    });
    const memberOneFilter = await repository.upsertFilterSettingForBoard({
      boardId: "board-1",
      memberId: "member-1",
      enabledEntityTypes: ["task", "risk"],
      assigneeMemberId: "member-3",
      showDelayedOnly: true,
      showRiskOnly: true,
      filters: {
        priority: "high",
      },
      now: new Date("2026-06-28T00:07:00.000Z"),
    });
    const memberOneBoard = await repository.findBoardDetail({
      boardId: "board-1",
      memberId: "member-1",
    });
    const memberTwoBoard = await repository.findBoardDetail({
      boardId: "board-1",
      memberId: "member-2",
    });

    assert.deepEqual(memberOneView, {
      zoom: 1.25,
      viewportX: 120,
      viewportY: -80,
    });
    assert.deepEqual(memberTwoView, {
      zoom: 0.75,
      viewportX: -40,
      viewportY: 220,
    });
    assert.deepEqual(memberOneFilter, {
      enabledEntityTypes: ["task", "risk"],
      assigneeMemberId: "member-3",
      showDelayedOnly: true,
      showRiskOnly: true,
      filters: {
        priority: "high",
      },
    });
    assert.deepEqual(memberOneBoard.viewSetting, memberOneView);
    assert.deepEqual(memberOneBoard.filterSetting, memberOneFilter);
    assert.deepEqual(memberTwoBoard.viewSetting, memberTwoView);
    assert.deepEqual(memberTwoBoard.filterSetting, {
      enabledEntityTypes: ["task", "meeting_report", "pull_request"],
      assigneeMemberId: null,
      showDelayedOnly: false,
      showRiskOnly: false,
      filters: {},
    });
    assert.equal(memberOneBoard.updatedAt, "2026-06-28T00:07:00.000Z");
  });

  it("connects Canvas board access to the workspace currentMember context", async () => {
    const repositoryCalls = [];
    const accessCalls = [];
    const repository = {
      storageMode: "test",
      async listBoardsForWorkspace(workspaceId) {
        repositoryCalls.push(["list", workspaceId]);
        return [];
      },
      async findBoardWorkspaceId(boardId) {
        repositoryCalls.push(["findWorkspace", boardId]);
        return "workspace-1";
      },
      async findBoardDetail(input) {
        repositoryCalls.push(["detail", input]);
        return {
          id: input.boardId,
          workspaceId: "workspace-1",
          title: "Project Map",
          boardType: "project_map",
          shapeCount: 0,
          connectionCount: 0,
          updatedAt: "2026-06-28T00:00:00.000Z",
          shapes: [],
          connections: [],
          viewSetting: {
            zoom: 1,
            viewportX: 0,
            viewportY: 0,
          },
          filterSetting: {
            enabledEntityTypes: ["task", "meeting_report", "pull_request"],
            assigneeMemberId: null,
            showDelayedOnly: false,
            showRiskOnly: false,
            filters: {},
          },
        };
      },
    };
    const currentMemberAdapter = {
      async requireCurrentMember(input) {
        accessCalls.push(input);
        return {
          currentMember: {
            workspaceId: input.workspaceId,
            memberId: "member-1",
            userId: input.currentUser.id,
            role: "owner",
            displayName: "Canvas Owner",
          },
          permissions: {
            canRead: true,
            canWrite: true,
            canManage: true,
          },
        };
      },
    };
    const service = new CanvasService(repository, currentMemberAdapter);
    const currentUser = {
      id: "user-1",
      email: "owner@example.com",
    };

    assert.deepEqual(
      await service.listCanvasBoards({
        workspaceId: "workspace-1",
        currentUser,
      }),
      [],
    );

    const board = await service.getCanvasBoardDetail({
      boardId: "board-1",
      currentUser,
    });

    assert.equal(board.id, "board-1");
    assert.deepEqual(accessCalls, [
      {
        workspaceId: "workspace-1",
        currentUser,
      },
      {
        workspaceId: "workspace-1",
        currentUser,
      },
    ]);
    assert.deepEqual(repositoryCalls, [
      ["list", "workspace-1"],
      ["findWorkspace", "board-1"],
      [
        "detail",
        {
          boardId: "board-1",
          memberId: "member-1",
        },
      ],
    ]);
  });

  it("updates Canvas shape position only with workspace write permission", async () => {
    const repositoryCalls = [];
    const accessCalls = [];
    const repository = {
      storageMode: "test",
      async listBoardsForWorkspace() {
        return [];
      },
      async findBoardWorkspaceId() {
        return null;
      },
      async findShapeWorkspaceId(shapeId) {
        repositoryCalls.push(["findShapeWorkspace", shapeId]);
        return "workspace-1";
      },
      async findBoardDetail() {
        return null;
      },
      async upsertShapePosition(input) {
        repositoryCalls.push(["upsertPosition", input]);
        return {
          id: input.shapeId,
          shapeType: "task",
          entityType: "task",
          entityId: "44444444-4444-4444-8444-444444444441",
          displayTitle: "Login API",
          width: 280,
          height: 160,
          color: "#6d5bd6",
          isCollapsed: false,
          zIndex: 1,
          position: {
            x: input.x,
            y: input.y,
          },
        };
      },
    };
    const currentMemberAdapter = {
      async requireCurrentMember(input) {
        accessCalls.push(input);
        return {
          currentMember: {
            workspaceId: input.workspaceId,
            memberId: "member-1",
            userId: input.currentUser.id,
            role: "member",
            displayName: null,
          },
          permissions: {
            canRead: true,
            canWrite: true,
            canManage: false,
          },
        };
      },
    };
    const service = new CanvasService(repository, currentMemberAdapter);
    const currentUser = { id: "user-1" };
    const updated = await service.updateCanvasShapePosition({
      shapeId: "shape-1",
      currentUser,
      body: {
        x: 320,
        y: -48,
      },
    });

    assert.deepEqual(updated.position, {
      x: 320,
      y: -48,
    });
    assert.deepEqual(accessCalls, [
      {
        workspaceId: "workspace-1",
        currentUser,
      },
    ]);
    assert.deepEqual(repositoryCalls, [
      ["findShapeWorkspace", "shape-1"],
      [
        "upsertPosition",
        {
          shapeId: "shape-1",
          x: 320,
          y: -48,
        },
      ],
    ]);
  });

  it("creates and deletes Canvas connections through workspace write access", async () => {
    const repositoryCalls = [];
    const accessCalls = [];
    const repository = {
      storageMode: "test",
      async listBoardsForWorkspace() {
        return [];
      },
      async findBoardWorkspaceId(boardId) {
        repositoryCalls.push(["findBoardWorkspace", boardId]);
        return "workspace-1";
      },
      async findShapeWorkspaceId() {
        return null;
      },
      async findConnectionWorkspaceId(connectionId) {
        repositoryCalls.push(["findConnectionWorkspace", connectionId]);
        return "workspace-1";
      },
      async findBoardDetail() {
        return null;
      },
      async createConnectionForBoard(input) {
        repositoryCalls.push(["createConnection", input]);
        return {
          status: "created",
          connection: {
            id: "connection-1",
            sourceShapeId: input.sourceShapeId,
            targetShapeId: input.targetShapeId,
            connectionType: input.connectionType,
            label: input.label,
          },
        };
      },
      async deleteConnection(input) {
        repositoryCalls.push(["deleteConnection", input]);
        return {
          id: input.connectionId,
          deleted: true,
        };
      },
      async upsertShapePosition() {
        return null;
      },
    };
    const currentMemberAdapter = {
      async requireCurrentMember(input) {
        accessCalls.push(input);
        return {
          currentMember: {
            workspaceId: input.workspaceId,
            memberId: "member-1",
            userId: input.currentUser.id,
            role: "member",
            displayName: null,
          },
          permissions: {
            canRead: true,
            canWrite: true,
            canManage: false,
          },
        };
      },
    };
    const service = new CanvasService(repository, currentMemberAdapter);
    const currentUser = { id: "user-1" };
    const connection = await service.createCanvasConnection({
      boardId: "board-1",
      currentUser,
      body: {
        sourceShapeId: "shape-1",
        targetShapeId: "shape-2",
        connectionType: "implemented_by",
        label: "Task to PR",
      },
    });
    const deleted = await service.deleteCanvasConnection({
      connectionId: "connection-1",
      currentUser,
    });

    assert.deepEqual(connection, {
      id: "connection-1",
      sourceShapeId: "shape-1",
      targetShapeId: "shape-2",
      connectionType: "implemented_by",
      label: "Task to PR",
    });
    assert.deepEqual(deleted, {
      id: "connection-1",
      deleted: true,
    });
    assert.deepEqual(accessCalls, [
      {
        workspaceId: "workspace-1",
        currentUser,
      },
      {
        workspaceId: "workspace-1",
        currentUser,
      },
    ]);
    assert.deepEqual(repositoryCalls, [
      ["findBoardWorkspace", "board-1"],
      [
        "createConnection",
        {
          boardId: "board-1",
          sourceShapeId: "shape-1",
          targetShapeId: "shape-2",
          connectionType: "implemented_by",
          label: "Task to PR",
        },
      ],
      ["findConnectionWorkspace", "connection-1"],
      [
        "deleteConnection",
        {
          connectionId: "connection-1",
        },
      ],
    ]);
  });

  it("updates Canvas view and filter settings through workspace write access", async () => {
    const repositoryCalls = [];
    const accessCalls = [];
    const repository = {
      storageMode: "test",
      async listBoardsForWorkspace() {
        return [];
      },
      async findBoardWorkspaceId(boardId) {
        repositoryCalls.push(["findBoardWorkspace", boardId]);
        return "workspace-1";
      },
      async findShapeWorkspaceId() {
        return null;
      },
      async findConnectionWorkspaceId() {
        return null;
      },
      async findBoardDetail() {
        return null;
      },
      async createConnectionForBoard() {
        return {
          status: "invalid",
        };
      },
      async deleteConnection() {
        return null;
      },
      async upsertViewSettingForBoard(input) {
        repositoryCalls.push(["upsertViewSetting", input]);
        return {
          zoom: input.zoom,
          viewportX: input.viewportX,
          viewportY: input.viewportY,
        };
      },
      async upsertFilterSettingForBoard(input) {
        repositoryCalls.push(["upsertFilterSetting", input]);
        return {
          enabledEntityTypes: input.enabledEntityTypes,
          assigneeMemberId: input.assigneeMemberId,
          showDelayedOnly: input.showDelayedOnly,
          showRiskOnly: input.showRiskOnly,
          filters: input.filters,
        };
      },
      async upsertShapePosition() {
        return null;
      },
    };
    const currentMemberAdapter = {
      async requireCurrentMember(input) {
        accessCalls.push(input);
        return {
          currentMember: {
            workspaceId: input.workspaceId,
            memberId: "member-1",
            userId: input.currentUser.id,
            role: "member",
            displayName: null,
          },
          permissions: {
            canRead: true,
            canWrite: true,
            canManage: false,
          },
        };
      },
    };
    const service = new CanvasService(repository, currentMemberAdapter);
    const currentUser = { id: "user-1" };
    const viewSetting = await service.updateCanvasViewSetting({
      boardId: "board-1",
      currentUser,
      body: {
        zoom: 1.5,
        viewportX: 300,
        viewportY: -120,
      },
    });
    const filterSetting = await service.updateCanvasFilterSetting({
      boardId: "board-1",
      currentUser,
      body: {
        enabledEntityTypes: ["task", "pull_request", "task"],
        assigneeMemberId: null,
        showDelayedOnly: false,
        showRiskOnly: true,
        filters: {
          label: "review",
        },
      },
    });

    assert.deepEqual(viewSetting, {
      zoom: 1.5,
      viewportX: 300,
      viewportY: -120,
    });
    assert.deepEqual(filterSetting, {
      enabledEntityTypes: ["task", "pull_request"],
      assigneeMemberId: null,
      showDelayedOnly: false,
      showRiskOnly: true,
      filters: {
        label: "review",
      },
    });
    assert.deepEqual(accessCalls, [
      {
        workspaceId: "workspace-1",
        currentUser,
      },
      {
        workspaceId: "workspace-1",
        currentUser,
      },
    ]);
    assert.deepEqual(repositoryCalls, [
      ["findBoardWorkspace", "board-1"],
      [
        "upsertViewSetting",
        {
          boardId: "board-1",
          memberId: "member-1",
          zoom: 1.5,
          viewportX: 300,
          viewportY: -120,
        },
      ],
      ["findBoardWorkspace", "board-1"],
      [
        "upsertFilterSetting",
        {
          boardId: "board-1",
          memberId: "member-1",
          enabledEntityTypes: ["task", "pull_request"],
          assigneeMemberId: null,
          showDelayedOnly: false,
          showRiskOnly: true,
          filters: {
            label: "review",
          },
        },
      ],
    ]);
  });

  it("rejects duplicate Canvas connection creation", async () => {
    const service = new CanvasService(
      {
        storageMode: "test",
        async listBoardsForWorkspace() {
          return [];
        },
        async findBoardWorkspaceId() {
          return "workspace-1";
        },
        async findShapeWorkspaceId() {
          return null;
        },
        async findConnectionWorkspaceId() {
          return null;
        },
        async findBoardDetail() {
          return null;
        },
        async createConnectionForBoard() {
          return {
            status: "duplicate",
          };
        },
        async deleteConnection() {
          return null;
        },
        async upsertShapePosition() {
          return null;
        },
      },
      {
        async requireCurrentMember(input) {
          return {
            currentMember: {
              workspaceId: input.workspaceId,
              memberId: "member-1",
              userId: input.currentUser.id,
              role: "member",
              displayName: null,
            },
            permissions: {
              canRead: true,
              canWrite: true,
              canManage: false,
            },
          };
        },
      },
    );

    await assert.rejects(
      () =>
        service.createCanvasConnection({
          boardId: "board-1",
          currentUser: { id: "user-1" },
          body: {
            sourceShapeId: "shape-1",
            targetShapeId: "shape-2",
            connectionType: "implemented_by",
            label: "Task to PR",
          },
        }),
      (error) =>
        error instanceof CanvasConflictError &&
        error.code === "canvas_connection_duplicate",
    );
  });

  it("rejects Canvas shape position updates without write permission", async () => {
    let upsertCalled = false;
    const service = new CanvasService(
      {
        storageMode: "test",
        async listBoardsForWorkspace() {
          return [];
        },
        async findBoardWorkspaceId() {
          return null;
        },
        async findShapeWorkspaceId() {
          return "workspace-1";
        },
        async findBoardDetail() {
          return null;
        },
        async upsertShapePosition() {
          upsertCalled = true;
          return null;
        },
      },
      {
        async requireCurrentMember(input) {
          return {
            currentMember: {
              workspaceId: input.workspaceId,
              memberId: "member-1",
              userId: input.currentUser.id,
              role: "viewer",
              displayName: null,
            },
            permissions: {
              canRead: true,
              canWrite: false,
              canManage: false,
            },
          };
        },
      },
    );

    await assert.rejects(
      () =>
        service.updateCanvasShapePosition({
          shapeId: "shape-1",
          currentUser: { id: "viewer-1" },
          body: {
            x: 1,
            y: 2,
          },
        }),
      (error) =>
        error instanceof CanvasAccessError &&
        error.code === "canvas_workspace_forbidden" &&
        error.resourceId === "workspace-1",
    );
    assert.equal(upsertCalled, false);
  });

  it("rejects invalid Canvas shape position payloads before storage", async () => {
    const service = new CanvasService(
      {
        storageMode: "test",
        async listBoardsForWorkspace() {
          return [];
        },
        async findBoardWorkspaceId() {
          return null;
        },
        async findShapeWorkspaceId() {
          return "workspace-1";
        },
        async findBoardDetail() {
          return null;
        },
        async upsertShapePosition() {
          return null;
        },
      },
      {
        async requireCurrentMember(input) {
          return {
            currentMember: {
              workspaceId: input.workspaceId,
              memberId: "member-1",
              userId: input.currentUser.id,
              role: "owner",
              displayName: null,
            },
            permissions: {
              canRead: true,
              canWrite: true,
              canManage: true,
            },
          };
        },
      },
    );

    await assert.rejects(
      () =>
        service.updateCanvasShapePosition({
          shapeId: "shape-1",
          currentUser: { id: "user-1" },
          body: {
            x: Number.POSITIVE_INFINITY,
            y: 2,
          },
        }),
      (error) =>
        error instanceof CanvasValidationError &&
        error.code === "canvas_validation_failed",
    );
  });

  it("rejects Canvas board detail before workspace access when board is missing", async () => {
    const accessCalls = [];
    const service = new CanvasService(
      {
        storageMode: "test",
        async listBoardsForWorkspace() {
          return [];
        },
        async findBoardWorkspaceId() {
          return null;
        },
        async findBoardDetail() {
          return null;
        },
      },
      {
        async requireCurrentMember(input) {
          accessCalls.push(input);
          return {
            currentMember: {
              workspaceId: input.workspaceId,
              memberId: "member-1",
              userId: input.currentUser.id,
              role: "owner",
              displayName: null,
            },
            permissions: {
              canRead: true,
              canWrite: true,
              canManage: true,
            },
          };
        },
      },
    );

    await assert.rejects(
      () =>
        service.getCanvasBoardDetail({
          boardId: "missing-board",
          currentUser: { id: "user-1" },
        }),
      (error) =>
        error instanceof CanvasAccessError &&
        error.code === "canvas_board_not_found" &&
        error.resourceId === "missing-board",
    );
    assert.deepEqual(accessCalls, []);
  });

  it("rejects invalid dashboard preferences payloads", async () => {
    const service = new WorkspaceService(new WorkspaceRepository());
    const owner = {
      id: "owner-1",
      name: "Workspace Owner",
      email: "owner@example.com",
    };
    const workspace = await service.createWorkspace({
      currentUser: owner,
      body: {
        name: "PILO",
      },
    });

    await assert.rejects(
      () =>
        service.updateDashboardPreferences({
          workspaceId: workspace.id,
          currentUser: owner,
          body: {
            layout: [],
          },
        }),
      (error) =>
        error instanceof WorkspaceValidationError &&
        error.code === "workspace_validation_failed",
    );
  });

  it("handles workspace invite duplicate, expired, accepted, and revoked states", async () => {
    const service = new WorkspaceService(new WorkspaceRepository());
    const owner = {
      id: "owner-1",
      name: "Workspace Owner",
      email: "owner@example.com",
    };
    const invitee = {
      id: "user-2",
      name: "Invited Member",
      email: "member@example.com",
    };
    const workspace = await service.createWorkspace({
      currentUser: owner,
      body: {
        name: "PILO",
      },
    });
    const invite = await service.createWorkspaceInvite({
      workspaceId: workspace.id,
      currentUser: owner,
      body: {
        email: "member@example.com",
      },
    });

    await assert.rejects(
      () =>
        service.createWorkspaceInvite({
          workspaceId: workspace.id,
          currentUser: owner,
          body: {
            email: "member@example.com",
          },
        }),
      (error) =>
        error instanceof WorkspaceInviteError &&
        error.code === "workspace_invite_duplicate_active_email",
    );

    await service.acceptWorkspaceInvite({
      inviteId: invite.id,
      currentUser: invitee,
      body: {
        token: invite.token,
      },
    });
    await assert.rejects(
      () =>
        service.acceptWorkspaceInvite({
          inviteId: invite.id,
          currentUser: invitee,
          body: {
            token: invite.token,
          },
        }),
      (error) =>
        error instanceof WorkspaceInviteError &&
        error.code === "workspace_invite_accepted",
    );

    const revokedInvite = await service.createWorkspaceInvite({
      workspaceId: workspace.id,
      currentUser: owner,
      body: {
        email: "viewer@example.com",
        role: "viewer",
      },
    });

    await service.revokeWorkspaceInvite({
      workspaceId: workspace.id,
      inviteId: revokedInvite.id,
      currentUser: owner,
    });
    await assert.rejects(
      () =>
        service.acceptWorkspaceInvite({
          inviteId: revokedInvite.id,
          currentUser: {
            id: "user-3",
            name: "Viewer",
            email: "viewer@example.com",
          },
          body: {
            token: revokedInvite.token,
          },
        }),
      (error) =>
        error instanceof WorkspaceInviteError &&
        error.code === "workspace_invite_revoked",
    );

    const expiredInvite = await service.createWorkspaceInvite({
      workspaceId: workspace.id,
      currentUser: owner,
      body: {
        email: "expired@example.com",
        ttlHours: 0,
      },
    });

    await assert.rejects(
      () =>
        service.acceptWorkspaceInvite({
          inviteId: expiredInvite.id,
          currentUser: {
            id: "user-4",
            name: "Expired",
            email: "expired@example.com",
          },
          body: {
            token: expiredInvite.token,
          },
        }),
      (error) =>
        error instanceof WorkspaceInviteError &&
        error.code === "workspace_invite_expired",
    );
  });

  it("rejects workspace invite creation without owner permission", async () => {
    const service = new WorkspaceService(new WorkspaceRepository());
    const owner = {
      id: "owner-1",
      name: "Workspace Owner",
      email: "owner@example.com",
    };
    const member = {
      id: "member-1",
      name: "Workspace Member",
      email: "member@example.com",
    };
    const workspace = await service.createWorkspace({
      currentUser: owner,
      body: {
        name: "PILO",
      },
    });
    const invite = await service.createWorkspaceInvite({
      workspaceId: workspace.id,
      currentUser: owner,
      body: {
        email: member.email,
      },
    });

    await service.acceptWorkspaceInvite({
      inviteId: invite.id,
      currentUser: member,
      body: {
        token: invite.token,
      },
    });

    await assert.rejects(
      () =>
        service.createWorkspaceInvite({
          workspaceId: workspace.id,
          currentUser: member,
          body: {
            email: "new@example.com",
          },
        }),
      (error) =>
        error instanceof WorkspaceAccessError &&
        error.code === "workspace_forbidden",
    );
  });

  it("hides soft-deleted workspaces from member-scoped reads", async () => {
    const repository = new WorkspaceRepository();
    const service = new WorkspaceService(repository);
    const currentUser = { id: "user-1" };
    const created = await service.createWorkspace({
      currentUser,
      body: {
        name: "PILO",
      },
    });
    const deleted = await repository.softDeleteWorkspaceForUser({
      workspaceId: created.id,
      userId: currentUser.id,
    });

    assert.equal(deleted, true);
    assert.deepEqual(await service.listWorkspaces({ currentUser }), []);
    await assert.rejects(
      () =>
        service.getWorkspace({
          workspaceId: created.id,
          currentUser,
        }),
      (error) =>
        error instanceof WorkspaceAccessError &&
        error.code === "workspace_not_found" &&
        error.workspaceId === created.id,
    );
  });

  it("rejects invalid workspace create payloads before storage", async () => {
    const service = new WorkspaceService(new WorkspaceRepository());

    await assert.rejects(
      () =>
        service.createWorkspace({
          currentUser: { id: "user-1" },
          body: {
            name: " ",
          },
        }),
      (error) =>
        error instanceof WorkspaceValidationError &&
        error.code === "workspace_validation_failed",
    );
  });

  it("boots the Nest app module with Auth, Workspace, and Canvas modules registered", async () => {
    const app = await NestFactory.create(AppModule, new FastifyAdapter(), {
      logger: false,
    });

    await app.init();
    assert.deepEqual(app.get(WorkspaceService).getRepositoryStatus(), {
      storageMode: "memory",
    });
    assert.deepEqual(app.get(CanvasService).getRepositoryStatus(), {
      storageMode: "memory",
    });
    await app.close();
  });
});
