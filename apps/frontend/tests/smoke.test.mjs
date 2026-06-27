import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeCallbackRedirect,
  resolveOAuthCallbackState,
} from "../app/login/callback/oauthCallbackState.mjs";
import { authProviderHref } from "../app/login/authProviderHref.mjs";
import packageJson from "../package.json" with { type: "json" };

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
});
