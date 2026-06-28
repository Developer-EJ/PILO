import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import "ts-node/register";
import packageJson from "../package.json" with { type: "json" };

const require = createRequire(import.meta.url);
const {
  createAuthConfig,
  normalizeAuthNextPath,
  normalizeOAuthRedirectUri,
} = require("../src/modules/auth/auth.config");
const { AuthRepository } = require("../src/modules/auth/auth.repository");
const { AuthService } = require("../src/modules/auth/auth.service");
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

  it("exposes Auth provider readiness without leaking secrets", () => {
    const service = new AuthService(new AuthRepository());
    const response = service.getProviders();

    assert.equal(response.providers.length, 2);
    assert.equal(response.providers[0].startPath.startsWith("/auth/"), true);
    assert.equal(response.providers[0].callbackUrl.includes("/auth/"), true);
    assert.equal(JSON.stringify(response).includes("clientSecret"), false);
    assert.equal(JSON.stringify(response).includes("secret"), false);
  });

  it("boots the Nest app module with AuthModule registered", async () => {
    const app = await NestFactory.create(AppModule, new FastifyAdapter(), {
      logger: false,
    });

    await app.init();
    await app.close();
  });
});
