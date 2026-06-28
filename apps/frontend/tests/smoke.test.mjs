import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authProviderHref } from "../app/login/authProviderHref.mjs";
import packageJson from "../package.json" with { type: "json" };
import contractSchema from "../../../docs/contracts/schemas/pilo-public-contracts.schema.json" with { type: "json" };

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
    assert.deepEqual(defs.CurrentUser.required, [
      "id",
      "email",
      "name",
      "avatarUrl",
      "providers",
      "lastLoginAt",
    ]);
    assert.equal(
      defs.CurrentUser.properties.providers.items.$ref,
      "#/$defs/AuthProvider",
    );
    assert.equal(defs.AuthSessionState.oneOf.length, 2);
    assert.equal(
      defs.AuthSessionState.oneOf[0].properties.user.$ref,
      "#/$defs/CurrentUser",
    );
    assert.deepEqual(defs.AuthSessionState.oneOf[1].properties.user, {
      type: "null",
    });
    assert.equal(
      defs.AuthProvidersResponse.properties.providers.items.$ref,
      "#/$defs/AuthProviderSummary",
    );
    assert.equal(defs.AuthErrorResponse.properties.statusCode.enum[0], 401);
  });
});
