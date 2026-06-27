import assert from "node:assert/strict";
import { describe, it } from "node:test";
import packageJson from "../package.json" with { type: "json" };

describe("app-server package", () => {
  it("keeps the PILO app-server package name", () => {
    assert.equal(packageJson.name, "@pilo/app-server");
  });
});
