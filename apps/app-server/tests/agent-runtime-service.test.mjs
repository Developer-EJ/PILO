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
        draft: {
          workspaceTitle: "PILO Sprint",
          goal: "Build a usable MVP plan",
          problem: "The team starts with scattered ideas",
          targetUser: "student builders",
          duration: "4 weeks",
          teamSize: 4,
          experienceLevel: "beginner",
          outputGoal: "demo-ready workspace",
        },
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
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });
});
