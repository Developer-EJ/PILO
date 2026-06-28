import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import { URL } from "node:url";
import "ts-node/register";
import packageJson from "../package.json" with { type: "json" };
import contractSchema from "../../../docs/contracts/schemas/pilo-public-contracts.schema.json" with { type: "json" };

const require = createRequire(import.meta.url);
const {
  createAuthConfig,
  normalizeAuthNextPath,
  normalizeOAuthRedirectUri,
} = require("../src/modules/auth/auth.config");
const { AuthRepository } = require("../src/modules/auth/auth.repository");
const { AuthService } = require("../src/modules/auth/auth.service");
const {
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
  WorkspaceService,
  WorkspaceValidationError,
} = require("../src/modules/workspace/workspace.service");
const {
  WorkspaceCurrentMemberAdapter,
} = require("../src/modules/workspace/workspace-current-member.adapter");
const {
  WorkspaceRepository,
} = require("../src/modules/workspace/workspace.repository");
const { NestFactory } = require("@nestjs/core");
const { FastifyAdapter } = require("@nestjs/platform-fastify");
const { AppModule } = require("../src/app.module");

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

  it("boots the Nest app module with AuthModule and WorkspaceModule registered", async () => {
    const app = await NestFactory.create(AppModule, new FastifyAdapter(), {
      logger: false,
    });

    await app.init();
    assert.deepEqual(app.get(WorkspaceService).getRepositoryStatus(), {
      storageMode: "memory",
    });
    await app.close();
  });
});
