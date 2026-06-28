import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import packageJson from "../package.json" with { type: "json" };

describe("frontend package", () => {
  it("keeps the PILO frontend package name", () => {
    assert.equal(packageJson.name, "@pilo/frontend");
  });

  it("exposes the PR review queue route", () => {
    const page = readFileSync("app/(workspace)/reviews/page.tsx", "utf8");

    assert.match(page, /pullRequests/);
    assert.match(page, /PR review queue/);
    assert.match(page, /analysisStatus/);
    assert.match(page, /linkedTaskIds/);
  });
});
