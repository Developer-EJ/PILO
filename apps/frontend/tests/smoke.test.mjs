import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import packageJson from "../package.json" with { type: "json" };

describe("frontend package", () => {
  it("keeps the PILO frontend package name", () => {
    assert.equal(packageJson.name, "@pilo/frontend");
  });

  it("keeps auth provider entry routes on the login page", async () => {
    const loginPage = await readFile(
      new URL("../app/login/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(loginPage, /\/auth\/google\/start/);
    assert.match(loginPage, /\/auth\/github\/start/);
  });
});
