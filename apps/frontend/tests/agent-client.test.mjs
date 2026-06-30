import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAgentApiClient,
  createMockAgentClient,
  resolveAgentClientMode,
} from "../lib/agent/agentClient.mjs";
import {
  buildWorkspaceCreationPayload,
  createAgentOnboardingApiClient,
  createMockAgentOnboardingClient,
} from "../lib/agent/agentOnboardingClient.mjs";
import {
  buildAgentMessageFromPlanningSeed,
  buildPlanningFormValuesFromSeed,
  normalizePlanningOnboardingSeed,
  planningOnboardingSeedStorageKey,
  readPlanningOnboardingSeed,
} from "../lib/agent/onboardingPlanningSeed.mjs";

describe("agent frontend client", () => {
  it("builds Current Runtime API calls for planning and action approval", async () => {
    const requests = [];
    const fetcher = async (url, init = {}) => {
      requests.push({ url, init });

      if (url.endsWith("/workspaces/workspace-agent/project-plan-drafts")) {
        return Response.json({
          id: "plan-1",
          workspaceId: "workspace-agent",
          status: "reviewing",
        });
      }

      if (url.endsWith("/agent-actions/action-1/approve")) {
        return Response.json({
          id: "run-1",
          actions: [{ id: "action-1", status: "confirmed" }],
        });
      }

      return new Response(null, { status: 404 });
    };
    const client = createAgentApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher,
    });

    assert.equal(resolveAgentClientMode("api"), "api");
    assert.equal(resolveAgentClientMode("fixture"), "mock");

    await client.createProjectPlanDraft("workspace-agent", {
      goal: "Build a plan",
    });
    await client.approveAction("action-1");

    assert.deepEqual(
      requests.map((request) => request.init.method),
      ["POST", "POST"],
    );
    assert.equal(
      requests[0].url,
      "https://api.pilo.dev/api/workspaces/workspace-agent/project-plan-drafts",
    );
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.headers["Content-Type"], "application/json");
    assert.equal(
      JSON.parse(requests[0].init.body).goal,
      "Build a plan",
    );
  });

  it("marks mock planning owner API results as created after approval", async () => {
    const client = createMockAgentClient();
    const workspaceId = "mock-agent-client-workspace";
    const plan = await client.createProjectPlanDraft(workspaceId, {
      goal: "Ship Agent MVP",
      teamMembers: ["Saein", "Planner"],
    });
    const recommendationsBeforeApprove =
      await client.listRecommendations(workspaceId);

    assert.equal(plan.workspaceId, workspaceId);
    assert.equal(plan.status, "reviewing");
    assert.ok(plan.featureDrafts.length >= 3);
    assert.ok(
      recommendationsBeforeApprove.some(
        (recommendation) => recommendation.status === "waiting_confirmation",
      ),
    );

    const approved = await client.approveProjectPlanDraft(plan.id);
    const recommendationsAfterApprove =
      await client.listRecommendations(workspaceId);

    assert.equal(approved.status, "approved");
    assert.equal(approved.approval.status, "confirmed");
    assert.ok(approved.approval.executedAt);
    assert.ok(
      approved.approval.ownerApiResults.every(
        (result) =>
          result.status === "succeeded" &&
          typeof result.targetEntityId === "string",
      ),
    );
    assert.ok(
      recommendationsAfterApprove.some(
        (recommendation) => recommendation.status === "confirmed",
      ),
    );
  });

  it("supports chat action confirmation in mock mode", async () => {
    const client = createMockAgentClient();
    const workspaceId = "mock-agent-chat-workspace";
    const result = await client.sendChatMessage(workspaceId, {
      message: "Create task drafts for the MVP.",
      workflowType: "task.draft.generate",
    });
    const action = result.run.actions[0];

    assert.equal(result.run.status, "requires_confirmation");
    assert.equal(action.status, "waiting_confirmation");

    const confirmedRun = await client.approveAction(action.id);
    const confirmedAction = confirmedRun.actions.find(
      (candidate) => candidate.id === action.id,
    );

    assert.equal(confirmedAction.status, "confirmed");
    assert.equal(confirmedAction.executedAt, null);
    assert.equal(confirmedRun.actionRequired, false);
  });

  it("executes public Task and Milestone APIs after planning approval", async () => {
    const requests = [];
    const approvedPlan = {
      id: "plan-approval",
      workspaceId: "workspace-agent",
      status: "approved",
      featureDrafts: [
        {
          id: "feature-1",
          title: "온보딩 맥락으로 첫 Task 만들기",
          description: "계획 seed에서 넘어온 목표를 작업으로 나눈다.",
          sortOrder: 0,
        },
      ],
      milestoneDrafts: [
        {
          id: "milestone-1",
          title: "첫 주 실행",
          startDate: null,
          endDate: null,
        },
      ],
      approval: {
        status: "confirmed",
        executedAt: null,
        ownerApiResults: [
          {
            owner: "task",
            operation: "task.create",
            sourceDraftType: "feature",
            sourceDraftId: "feature-1",
            status: "pending",
            targetEntityId: null,
            errorMessage: null,
          },
          {
            owner: "task",
            operation: "milestone.create",
            sourceDraftType: "milestone",
            sourceDraftId: "milestone-1",
            status: "pending",
            targetEntityId: null,
            errorMessage: null,
          },
        ],
      },
    };
    const fetcher = async (url, init = {}) => {
      requests.push({ url, init });

      if (url.endsWith("/project-plan-drafts/plan-approval/approve")) {
        return Response.json(approvedPlan);
      }

      if (url.endsWith("/workspaces/workspace-agent/task-drafts")) {
        return Response.json({ id: "task-draft-1" });
      }

      if (url.endsWith("/workspaces/workspace-agent/milestones")) {
        return Response.json({ id: "milestone-created-1" });
      }

      return new Response(null, { status: 404 });
    };
    const client = createAgentApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher,
    });

    const result = await client.approveProjectPlanDraft("plan-approval");

    assert.deepEqual(
      requests.map((request) => request.init.method),
      ["POST", "POST", "POST"],
    );
    assert.equal(
      requests[1].url,
      "https://api.pilo.dev/api/workspaces/workspace-agent/task-drafts",
    );
    assert.equal(
      JSON.parse(requests[1].init.body).sourceType,
      "planning_feature",
    );
    assert.equal(
      requests[2].url,
      "https://api.pilo.dev/api/workspaces/workspace-agent/milestones",
    );
    assert.deepEqual(
      result.approval.ownerApiResults.map((item) => item.status),
      ["succeeded", "succeeded"],
    );
    assert.deepEqual(
      result.approval.ownerApiResults.map((item) => item.targetEntityId),
      ["task-draft-1", "milestone-created-1"],
    );
  });

  it("reads onboarding values as Planning and Agent seed context", () => {
    const workspaceId = "workspace-seed";
    const storage = new Map();
    const storageLike = {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    };
    storageLike.setItem(
      planningOnboardingSeedStorageKey(workspaceId),
      JSON.stringify({
        workspaceTitle: "팀 운영 도우미",
        goal: "첫 주 실행 계획 만들기",
        problem: "작업 분해가 느리다",
        targetUser: "부트캠프 팀",
        duration: "3 weeks",
        teamSize: 4,
        experienceLevel: "beginner",
        outputGoal: "데모 가능한 MVP",
      }),
    );

    const seed = readPlanningOnboardingSeed({ workspaceId, storage: storageLike });
    const formValues = buildPlanningFormValuesFromSeed(
      { goal: "", problem: "", targetUser: "", duration: "", teamSize: 1 },
      seed,
    );
    const message = buildAgentMessageFromPlanningSeed(seed);
    const querySeed = normalizePlanningOnboardingSeed({
      goal: "쿼리 목표",
      teamSize: "5",
    });

    assert.equal(seed.goal, "첫 주 실행 계획 만들기");
    assert.equal(formValues.problem, "작업 분해가 느리다");
    assert.equal(message.includes("부트캠프 팀"), true);
    assert.equal(querySeed.teamSize, 5);
  });

  it("fills AI onboarding draft and emits planning_feature candidates", async () => {
    const client = createMockAgentOnboardingClient();
    const answers = [
      ["workspaceTitle", "PILO Sprint"],
      ["goal", "Build a usable MVP plan"],
      ["problem", "The team starts with scattered ideas"],
      ["targetUser", "student builders"],
      ["duration", "4 weeks"],
      ["teamSize", "4"],
      ["experienceLevel", "beginner"],
      ["outputGoal", "demo-ready workspace"],
    ];
    let draft = {};
    let result = null;
    const messages = [
      {
        role: "assistant",
        body: "What is the workspace name?",
        fieldKey: "workspaceTitle",
      },
    ];

    for (const [, answer] of answers) {
      messages.push({ role: "user", body: answer });
      result = await client.runTurn({ messages, draft });
      draft = result.draft;
      messages.push({
        role: "assistant",
        body: result.reply,
        fieldKey: result.fieldInFocus,
      });
    }

    const payload = buildWorkspaceCreationPayload(result);

    assert.equal(result.ready, true);
    assert.equal(result.draft.workspaceTitle, "PILO Sprint");
    assert.equal(result.draft.teamSize, 4);
    assert.ok(result.planningSeed);
    assert.ok(
      result.taskCandidates.every(
        (candidate) => candidate.sourceType === "planning_feature",
      ),
    );
    assert.ok(
      result.milestoneCandidates.every(
        (candidate) => candidate.status === "planned",
      ),
    );
    assert.equal(payload.name, "PILO Sprint");
    assert.equal(payload.description, "Build a usable MVP plan");
    assert.equal(payload.onboarding.outputGoal, "demo-ready workspace");
  });

  it("calls the server-only onboarding runtime endpoint in API mode", async () => {
    const requests = [];
    const client = createAgentOnboardingApiClient({
      baseUrl: "https://api.pilo.dev",
      fetcher: async (url, init = {}) => {
        requests.push({ url, init });
        return Response.json({
          reply: "다음 정보를 알려 주세요.",
          draft: {
            workspaceTitle: "PILO Sprint",
            goal: null,
            problem: null,
            targetUser: null,
            duration: null,
            teamSize: null,
            experienceLevel: null,
            outputGoal: null,
          },
          missingFields: ["goal"],
          ready: false,
          fieldInFocus: "goal",
          summary: null,
          planningSeed: null,
          taskCandidates: [],
          milestoneCandidates: [],
          usedModel: null,
          fallback: false,
        });
      },
    });

    await client.runTurn({
      messages: [{ role: "user", body: "PILO Sprint" }],
      draft: {},
    });

    assert.equal(
      requests[0].url,
      "https://api.pilo.dev/api/agent-onboarding/turn",
    );
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(JSON.parse(requests[0].init.body).messages[0].body, "PILO Sprint");
  });
});
