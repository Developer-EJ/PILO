import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");
require("reflect-metadata");

const {
  AgentRuntimeController,
} = require("../src/modules/agent/agent-runtime.controller");

function createController() {
  const calls = [];
  const service = {
    sendChatMessage: async (workspaceId, body, actor) => {
      calls.push({ method: "sendChatMessage", workspaceId, body, actor });
      return { ok: true, actor };
    },
    approveAction: async (actionId, actor) => {
      calls.push({ method: "approveAction", actionId, actor });
      return { ok: true, actor };
    },
  };
  const authService = {
    getCurrentUserFromCookieHeader: (cookieHeader) =>
      cookieHeader?.includes("pilo_session=")
        ? {
            id: "user-from-cookie",
            email: "cookie@example.test",
            name: "Cookie User",
            avatarUrl: null,
          }
        : null,
  };

  return {
    calls,
    controller: new AgentRuntimeController(service, authService),
  };
}

describe("AgentRuntimeController", () => {
  it("uses the browser session cookie as workspace actor for agent chat", async () => {
    const { calls, controller } = createController();

    await controller.sendAgentChatMessage(
      "workspace-cookie",
      { message: "오늘 내가 먼저 봐야 할 작업 알려줘" },
      undefined,
      undefined,
      "pilo_session=session-token",
    );

    assert.equal(calls[0].method, "sendChatMessage");
    assert.deepEqual(calls[0].actor, { userId: "user-from-cookie" });
  });

  it("keeps explicit actor headers ahead of session cookies", async () => {
    const { calls, controller } = createController();

    await controller.sendAgentChatMessage(
      "workspace-cookie",
      { message: "작업을 만들어줘" },
      "user-from-header",
      "member-from-header",
      "pilo_session=session-token",
    );

    assert.deepEqual(calls[0].actor, {
      userId: "user-from-header",
      memberId: "member-from-header",
    });
  });

  it("uses the browser session cookie for action approval", async () => {
    const { calls, controller } = createController();

    await controller.approveAgentAction(
      "action-cookie",
      undefined,
      undefined,
      "pilo_session=session-token",
    );

    assert.equal(calls[0].method, "approveAction");
    assert.deepEqual(calls[0].actor, { userId: "user-from-cookie" });
  });
});
