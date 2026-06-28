import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import "ts-node/register";
import packageJson from "../package.json" with { type: "json" };

const require = createRequire(import.meta.url);
const { createAuthConfig } = require("../src/modules/auth/auth.config");
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

  it("exposes Auth provider readiness without leaking secrets", () => {
    const service = new AuthService(new AuthRepository());
    const response = service.getProviders();

    assert.equal(response.providers.length, 2);
    assert.equal(response.providers[0].startPath.startsWith("/auth/"), true);
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
