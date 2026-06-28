import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import packageJson from "../package.json" with { type: "json" };

describe("frontend package", () => {
  it("keeps the PILO frontend package name", () => {
    assert.equal(packageJson.name, "@pilo/frontend");
  });

  it("exposes the PR selector, canvas workspace, and node detail workflow", () => {
    const page = readFileSync("app/(workspace)/reviews/page.tsx", "utf8");
    const workspace = readFileSync(
      "app/(workspace)/reviews/review-node-workspace.tsx",
      "utf8",
    );

    assert.match(page, /reviewSessions/);
    assert.match(workspace, /ReviewNodeWorkspace/);
    assert.match(workspace, /리뷰할 PR을 선택/);
    assert.match(workspace, /canvasWorkspace/);
    assert.match(workspace, /detailWorkspace/);
    assert.match(workspace, /문제 없음/);
    assert.match(workspace, /논의 필요/);
    assert.match(workspace, /판단 불가/);
  });
});
