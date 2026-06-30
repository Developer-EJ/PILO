import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  JuhyungGithubSyncController,
} = require("../src/modules/juhyung/juhyung-github-sync.controller");

describe("JuhyungGithubSyncController", () => {
  it("exposes workspace-scoped repository sync with authenticated request context", async () => {
    const calls = [];
    const service = {
      syncRepositories: async (workspaceId, actor) => {
        calls.push(["syncRepositories", workspaceId, actor]);
        return {
          syncedAt: "2026-06-30T00:00:00.000Z",
          repositories: [],
          pullRequests: [],
        };
      },
    };
    const controller = new JuhyungGithubSyncController(service);

    await controller.syncRepositories("workspace-1", undefined, undefined, {
      auth: {
        actor: {
          userId: "user-1",
          memberId: "member-1",
        },
      },
    });

    assert.deepEqual(calls, [
      [
        "syncRepositories",
        "workspace-1",
        { userId: "user-1", memberId: "member-1" },
      ],
    ]);
  });

  it("uses local MVP actor headers when no authenticated request actor exists", async () => {
    const calls = [];
    const service = {
      syncRepositories: async (workspaceId, actor) => {
        calls.push(["syncRepositories", workspaceId, actor]);
        return {
          syncedAt: "2026-06-30T00:00:00.000Z",
          repositories: [],
          pullRequests: [],
        };
      },
    };
    const controller = new JuhyungGithubSyncController(service);

    await controller.syncRepositories(
      "workspace-1",
      ["user-header"],
      ["member-header"],
    );

    assert.deepEqual(calls, [
      [
        "syncRepositories",
        "workspace-1",
        { userId: "user-header", memberId: "member-header" },
      ],
    ]);
  });
});
