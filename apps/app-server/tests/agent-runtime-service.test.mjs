import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  AgentRuntimeRepository,
} = require("../src/modules/agent/agent-runtime.repository");
const {
  AgentRuntimeService,
} = require("../src/modules/agent/agent-runtime.service");

function createService() {
  const repository = new AgentRuntimeRepository();
  const workspaceAccess = {
    calls: [],
    async requireWorkspaceMember(workspaceId, actor = {}) {
      this.calls.push({ workspaceId, actor });
      return {
        id: actor.memberId ?? "member-agent-test",
        workspaceId,
        userId: actor.userId ?? "user-agent-test",
        role: "owner",
      };
    },
  };

  return {
    repository,
    service: new AgentRuntimeService(repository, workspaceAccess),
    workspaceAccess,
  };
}

const completeOnboardingDraft = {
  workspaceTitle: "PILO Sprint",
  goal: "Build a usable MVP plan",
  problem: "The team starts with scattered ideas",
  targetUser: "student builders",
  duration: "4 weeks",
  teamSize: 4,
  experienceLevel: "beginner",
  outputGoal: "demo-ready workspace",
};

function collectStrings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

function createOnboardingOpenAiPayload(overrides = {}) {
  return {
    reply: "요약을 확인하고 워크스페이스 생성을 확정해 주세요.",
    draft: completeOnboardingDraft,
    missingFields: [],
    ready: true,
    fieldInFocus: null,
    summary: "PILO Sprint 온보딩 요약",
    planningSeed: completeOnboardingDraft,
    taskCandidates: [
      {
        workspaceId: null,
        sourceType: "planning_feature",
        sourceId: "onboarding-feature-brief",
        title: "MVP 요구사항 정리",
        description: "사용자 시나리오와 성공 기준을 정리합니다.",
        assigneeMemberId: null,
        priority: "high",
        dueDate: null,
      },
    ],
    milestoneCandidates: [
      {
        title: "MVP 방향 확정",
        status: "planned",
        startDate: null,
        endDate: null,
      },
    ],
    ...overrides,
  };
}

describe("AgentRuntimeService", () => {
  it("creates a planning draft with user-confirmable owner action proposals", async () => {
    const { repository, service, workspaceAccess } = createService();

    const plan = await service.createProjectPlanDraft(
      "workspace-agent-runtime",
      {
        goal: "Ship the planning MVP",
        targetUser: "student builders",
        problem: "The team needs a concrete first plan and task drafts.",
        duration: "4 weeks",
        outputGoal: "usable demo",
        teamSize: 4,
        experienceLevel: "beginner",
        teamMembers: ["Saein", "Frontend", "Backend"],
      },
      { memberId: "member-saein" },
    );

    assert.equal(plan.status, "reviewing");
    assert.equal(plan.workspaceId, "workspace-agent-runtime");
    assert.equal(plan.createdByMemberId, "member-saein");
    assert.ok(plan.techStack);
    assert.ok(plan.featureDrafts.some((feature) => feature.scope === "mvp"));
    assert.equal(plan.approval.status, "waiting_confirmation");
    assert.ok(plan.approval.actionId);
    assert.ok(
      plan.approval.ownerApiResults.every(
        (result) => result.status === "pending" && result.targetEntityId === null,
      ),
    );

    const approvalAction = repository.findAction(plan.approval.actionId).action;
    assert.equal(approvalAction.type, "planning.approve");
    assert.equal(approvalAction.status, "waiting_confirmation");
    assert.equal(approvalAction.executedAt, null);
    assert.deepEqual(workspaceAccess.calls[0], {
      workspaceId: "workspace-agent-runtime",
      actor: { memberId: "member-saein" },
    });
  });

  it("confirms actions without executing owner-domain APIs", async () => {
    const { repository, service } = createService();
    const plan = await service.createProjectPlanDraft(
      "workspace-agent-runtime",
      {
        goal: "Ship the planning MVP",
        targetUser: "student builders",
        problem: "The team needs a concrete first plan and task drafts.",
        duration: "4 weeks",
        outputGoal: "usable demo",
        teamSize: 4,
        experienceLevel: "beginner",
        teamMembers: [],
      },
      { memberId: "member-saein" },
    );

    const approvedPlan = await service.approveProjectPlanDraft(plan.id, {
      memberId: "member-saein",
    });

    assert.equal(approvedPlan.status, "approved");
    assert.equal(approvedPlan.approval.status, "confirmed");
    assert.equal(approvedPlan.approval.executedAt, null);
    assert.ok(
      approvedPlan.approval.ownerApiResults.every(
        (result) => result.status === "pending" && result.targetEntityId === null,
      ),
    );

    const { run, action } = repository.findAction(plan.approval.actionId);
    assert.equal(action.status, "confirmed");
    assert.equal(action.executedAt, null);
    assert.ok(
      run.trace.some((entry) =>
        entry.message.includes("Task/Milestone owner execution is pending"),
      ),
    );
  });

  it("supports chat-driven agent runs and action rejection", async () => {
    const { service } = createService();

    const result = await service.sendChatMessage(
      "workspace-agent-runtime",
      {
        message: "Break the next slice into task drafts.",
        workflowType: "task.draft.generate",
        contextRefs: [],
      },
      { memberId: "member-saein" },
    );
    const firstAction = result.run.actions[0];

    assert.equal(result.run.status, "requires_confirmation");
    assert.equal(firstAction.type, "task.create.draft");
    assert.equal(firstAction.executedAt, null);

    const rejectedRun = await service.rejectAction(firstAction.id, {
      memberId: "member-saein",
    });
    const rejectedAction = rejectedRun.actions.find(
      (action) => action.id === firstAction.id,
    );

    assert.equal(rejectedAction.status, "rejected");
    assert.equal(rejectedAction.executedAt, null);
    assert.ok(rejectedRun.pendingActionCount < result.run.pendingActionCount);
  });

  it("builds onboarding context and candidate payloads without owner execution", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const { service } = createService();
      const firstTurn = await service.runOnboardingTurn({
        messages: [
          {
            role: "assistant",
            body: "What is the workspace name?",
            fieldKey: "workspaceTitle",
          },
          { role: "user", body: "PILO Sprint" },
        ],
        draft: {},
      });

      assert.equal(firstTurn.fallback, true);
      assert.equal(firstTurn.ready, false);
      assert.equal(firstTurn.draft.workspaceTitle, "PILO Sprint");
      assert.equal(firstTurn.fieldInFocus, "goal");

      const completed = await service.runOnboardingTurn({
        messages: [],
        draft: completeOnboardingDraft,
      });

      assert.equal(completed.ready, true);
      assert.ok(completed.planningSeed);
      assert.ok(completed.summary.includes("PILO Sprint"));
      assert.ok(
        completed.taskCandidates.every(
          (candidate) => candidate.sourceType === "planning_feature",
        ),
      );
      assert.ok(
        completed.milestoneCandidates.every(
          (candidate) => candidate.status === "planned",
        ),
      );
      assert.equal(completed.taskCandidates[0].workspaceId, null);

      const fallbackText = collectStrings(completed).join("\n");
      for (const fragment of [
        "?뚰",
        "?꾩",
        "紐",
        "寃",
        "臾몄",
        "湲",
        "�",
      ]) {
        assert.equal(
          fallbackText.includes(fragment),
          false,
          `onboarding fallback text contains mojibake fragment: ${fragment}`,
        );
      }
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("uses raw JSON OpenAI onboarding responses without falling back", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalModel = process.env.PILO_AGENT_ONBOARDING_MODEL;
    const originalFetch = globalThis.fetch;
    const requests = [];

    process.env.OPENAI_API_KEY = "test-key";
    process.env.PILO_AGENT_ONBOARDING_MODEL = "gpt-test";
    globalThis.fetch = async (url, init = {}) => {
      requests.push({ url: String(url), init });
      return Response.json({
        output_text: JSON.stringify(createOnboardingOpenAiPayload()),
      });
    };

    try {
      const { service } = createService();
      const result = await service.runOnboardingTurn({
        messages: [{ role: "user", body: "PILO Sprint" }],
        draft: {},
      });

      assert.equal(result.fallback, false);
      assert.equal(result.usedModel, "gpt-test");
      assert.equal(result.ready, true);
      assert.equal(result.draft.workspaceTitle, "PILO Sprint");
      assert.equal(result.taskCandidates[0].sourceType, "planning_feature");
      const requestBody = JSON.parse(requests[0].init.body);
      assert.equal(
        requestBody.input[0].content.includes("raw compact JSON object only"),
        true,
      );
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
      if (originalModel === undefined) {
        delete process.env.PILO_AGENT_ONBOARDING_MODEL;
      } else {
        process.env.PILO_AGENT_ONBOARDING_MODEL = originalModel;
      }
      globalThis.fetch = originalFetch;
    }
  });

  it("parses fenced JSON OpenAI onboarding responses without falling back", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalModel = process.env.PILO_AGENT_ONBOARDING_MODEL;
    const originalFetch = globalThis.fetch;

    process.env.OPENAI_API_KEY = "test-key";
    process.env.PILO_AGENT_ONBOARDING_MODEL = "gpt-test";
    globalThis.fetch = async () =>
      Response.json({
        output_text:
          "```json\n" +
          JSON.stringify(
            createOnboardingOpenAiPayload({
              reply: "코드펜스 응답도 정상 처리했습니다.",
              summary: "코드펜스 온보딩 요약",
            }),
          ) +
          "\n```",
      });

    try {
      const { service } = createService();
      const result = await service.runOnboardingTurn({
        messages: [{ role: "user", body: "PILO Sprint" }],
        draft: {},
      });

      assert.equal(result.fallback, false);
      assert.equal(result.usedModel, "gpt-test");
      assert.equal(result.reply, "코드펜스 응답도 정상 처리했습니다.");
      assert.equal(result.summary, "코드펜스 온보딩 요약");
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
      if (originalModel === undefined) {
        delete process.env.PILO_AGENT_ONBOARDING_MODEL;
      } else {
        process.env.PILO_AGENT_ONBOARDING_MODEL = originalModel;
      }
      globalThis.fetch = originalFetch;
    }
  });
});
