import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import packageJson from "../package.json" with { type: "json" };

describe("frontend package", () => {
  it("keeps the PILO frontend package name", () => {
    assert.equal(packageJson.name, "@pilo/frontend");
  });

  it("exposes the PR review queue and node detail workflow", () => {
    const page = readFileSync("app/(workspace)/reviews/page.tsx", "utf8");
    const workspace = readFileSync(
      "app/(workspace)/reviews/review-node-workspace.tsx",
      "utf8",
    );

    assert.match(page, /pullRequests/);
    assert.match(page, /PR review queue/);
    assert.match(page, /reviewCanvas/);
    assert.match(workspace, /ReviewNodeWorkspace/);
    assert.match(workspace, /Review node detail/);
    assert.match(workspace, /문제 없음/);
    assert.match(workspace, /논의 필요/);
    assert.match(workspace, /판단 불가/);
  });
});
