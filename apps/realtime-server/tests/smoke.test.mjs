import assert from "node:assert/strict";
import { describe, it } from "node:test";
import packageJson from "../package.json" with { type: "json" };

describe("realtime-server package", () => {
  it("keeps the PILO realtime-server package name", () => {
    assert.equal(packageJson.name, "@pilo/realtime-server");
  });
});
