import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
});
