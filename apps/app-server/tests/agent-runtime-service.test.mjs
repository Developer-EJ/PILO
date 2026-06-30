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

  it("answers lookup-style workspace chat questions without action proposals", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const { service } = createService();

    try {
      const scenarios = [
        {
          message: "어제 회의록 내용 기준으로 무엇을 먼저 처리하면 좋을까?",
          expectedLabel: "어제",
          expectedFrom: "2026-06-29",
          expectedTo: "2026-06-29",
          contextRefs: [{ type: "meeting_report", id: "meeting-2026-06-29" }],
        },
        {
          message: "오늘 내가 먼저 봐야 할 작업 알려줘",
          expectedLabel: "오늘",
          expectedFrom: "2026-06-30",
          expectedTo: "2026-06-30",
          contextRefs: [{ type: "task", id: "task-priority" }],
        },
        {
          message: "회의 결정사항 기준으로 막힌 일 정리해줘",
          expectedLabel: "최근 7일",
          expectedFrom: "2026-06-24",
          expectedTo: "2026-06-30",
          contextRefs: [{ type: "meeting_report", id: "meeting-blockers" }],
        },
      ];

      for (const scenario of scenarios) {
        const result = await service.sendChatMessage(
          "workspace-agent-runtime",
          {
            message: scenario.message,
            workflowType: "task.draft.generate",
            contextRefs: scenario.contextRefs,
            currentDateKst: "2026-06-30",
          },
          { memberId: "member-saein" },
        );

        assert.equal(result.response.fallback, true);
        assert.equal(result.response.dateRange.label, scenario.expectedLabel);
        assert.equal(result.response.dateRange.from, scenario.expectedFrom);
        assert.equal(result.response.dateRange.to, scenario.expectedTo);
        assert.equal(result.response.priorityTasks.length > 0, true);
        assert.equal(result.response.priorityTasks.length <= 3, true);
        assert.equal(result.response.evidence.length > 0, true);
        assert.equal(result.response.recommendedNextActions.length > 0, true);
        assert.deepEqual(result.response.actionProposals, []);
        assert.equal(result.run.actions.length, 0);
        assert.equal(result.run.pendingActionCount, 0);
        assert.equal(result.run.status, "succeeded");
        assert.ok(result.assistantMessage.body.includes("우선 처리할 일"));
      }
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("supports chat-driven agent runs and action rejection", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const { service } = createService();

    try {
      const result = await service.sendChatMessage(
        "workspace-agent-runtime",
        {
          message:
            "프로젝트 맵 캔버스에 메모 컴포넌트로 '동현: 오늘 회의 늦을 것 같습니다'라고 남겨줘",
          workflowType: "task.draft.generate",
          contextRefs: [{ type: "canvas", id: "project-map" }],
          currentDateKst: "2026-06-30",
        },
        { memberId: "member-saein" },
      );
      const firstAction = result.run.actions[0];

      assert.equal(result.run.status, "requires_confirmation");
      assert.equal(result.response.fallback, true);
      assert.equal(result.response.dateRange.label, "오늘");
      assert.equal(result.response.dateRange.from, "2026-06-30");
      assert.equal(result.response.dateRange.to, "2026-06-30");
      assert.equal(firstAction.type, "canvas.memo.create");
      assert.equal(firstAction.summary, "프로젝트 맵 캔버스에 메모를 추가합니다.");
      assert.equal(firstAction.payload.boardHint, "project-map");
      assert.equal(firstAction.payload.text, "동현: 오늘 회의 늦을 것 같습니다");
      assert.equal(firstAction.payload.shapeType, "memo");
      assert.equal(firstAction.status, "waiting_confirmation");
      assert.equal(firstAction.executedAt, null);
      assert.ok(result.assistantMessage.body.includes("우선 처리할 일"));

      const rejectedRun = await service.rejectAction(firstAction.id, {
        memberId: "member-saein",
      });
      const rejectedAction = rejectedRun.actions.find(
        (action) => action.id === firstAction.id,
      );

      assert.equal(rejectedAction.status, "rejected");
      assert.equal(rejectedAction.executedAt, null);
      assert.ok(rejectedRun.pendingActionCount < result.run.pendingActionCount);
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("creates Task owner proposals for task creation and status changes", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const { service } = createService();

    try {
      const createResult = await service.sendChatMessage(
        "workspace-agent-runtime",
        {
          message: "로그인 QA 확인 작업을 만들어줘",
          workflowType: "orchestrator.run",
          contextRefs: [{ type: "workspace", id: "workspace-agent-runtime" }],
          currentDateKst: "2026-07-01",
        },
        { memberId: "member-saein" },
      );
      const createAction = createResult.run.actions[0];

      assert.equal(createAction.type, "task.create.draft");
      assert.equal(createAction.source, "task");
      assert.equal(createAction.requiresConfirmation, true);
      assert.equal(createAction.status, "waiting_confirmation");
      assert.equal(createAction.executedAt, null);
      assert.equal(createAction.payload.workspaceId, "workspace-agent-runtime");
      assert.equal(createAction.payload.sourceType, "planning_feature");
      assert.equal(typeof createAction.payload.sourceId, "string");
      assert.equal(createAction.payload.priority, "medium");
      assert.equal(createAction.payload.status, "todo");

      const reproducedResult = await service.sendChatMessage(
        "workspace-agent-runtime",
        {
          message:
            "AI 검수 작업 1782842175757 작업 하나 만들어줘. 설명은 AI 액션 검수용이고 담당자는 Juhyung으로 해줘.",
          workflowType: "orchestrator.run",
          contextRefs: [{ type: "workspace", id: "workspace-agent-runtime" }],
          currentDateKst: "2026-07-01",
        },
        { memberId: "member-saein" },
      );
      const reproducedAction = reproducedResult.run.actions[0];

      assert.equal(reproducedAction.type, "task.create.draft");
      assert.equal(reproducedAction.requiresConfirmation, true);
      assert.equal(reproducedAction.status, "waiting_confirmation");
      assert.equal(reproducedAction.payload.title, "AI 검수 작업 1782842175757");
      assert.equal(reproducedAction.payload.description, "AI 액션 검수용");
      assert.equal(reproducedAction.payload.assigneeName, "Juhyung");
      assert.equal(reproducedAction.payload.status, "todo");
      assert.equal(reproducedResult.run.pendingActionCount, 1);

      const statusResult = await service.sendChatMessage(
        "workspace-agent-runtime",
        {
          message: "로그인 QA 확인 작업을 완료 처리해줘",
          workflowType: "orchestrator.run",
          contextRefs: [{ type: "task", id: "task-login-qa" }],
          currentDateKst: "2026-07-01",
        },
        { memberId: "member-saein" },
      );
      const statusAction = statusResult.run.actions[0];

      assert.equal(statusAction.type, "task.update.status");
      assert.equal(statusAction.source, "task");
      assert.equal(statusAction.requiresConfirmation, true);
      assert.equal(statusAction.status, "waiting_confirmation");
      assert.equal(statusAction.executedAt, null);
      assert.equal(statusAction.payload.workspaceId, "workspace-agent-runtime");
      assert.equal(statusAction.payload.taskId, "task-login-qa");
      assert.equal(statusAction.payload.status, "done");
      assert.equal(statusResult.run.actions.length, 1);
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("uses raw JSON OpenAI workspace chat responses without executing actions", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalModel = process.env.PILO_AGENT_CHAT_MODEL;
    const originalFetch = globalThis.fetch;
    const requests = [];

    process.env.OPENAI_API_KEY = "test-key";
    process.env.PILO_AGENT_CHAT_MODEL = "gpt-chat-test";
    globalThis.fetch = async (url, init = {}) => {
      requests.push({ url: String(url), init });
      return Response.json({
        output_text: JSON.stringify({
          shortConclusion: "어제 회의 결정은 캔버스 메모로 남기면 됩니다.",
          priorityTasks: ["회의 결정 3개를 요약", "프로젝트 맵 위치 확인"],
          evidence: [
            {
              source: "meeting",
              title: "어제 회의록",
              detail: "회의록 contextRef를 근거로 사용했습니다.",
              referenceId: "meeting-2026-06-29",
            },
          ],
          recommendedNextActions: ["메모 action을 승인하거나 거절하세요."],
          actionProposals: [
            {
              type: "canvas.memo.create",
              summary: "프로젝트 맵 캔버스에 메모를 추가합니다.",
              payload: {
                workspaceId: "workspace-agent-runtime",
                boardHint: "project-map",
                text: "어제 회의 결정 요약",
                shapeType: "memo",
                position: { x: 240, y: 180 },
              },
            },
            {
              type: "task.update.status",
              summary: "회의 후속 작업을 완료 처리합니다.",
              payload: {
                workspaceId: "workspace-agent-runtime",
                taskId: "task-follow-up",
                status: "done",
              },
            },
          ],
        }),
      });
    };

    try {
      const { service } = createService();
      const result = await service.sendChatMessage(
        "workspace-agent-runtime",
        {
          message: "어제 회의 결정 프로젝트 맵에 메모로 남겨줘",
          workflowType: "task.draft.generate",
          contextRefs: [{ type: "meeting_report", id: "meeting-2026-06-29" }],
          currentDateKst: "2026-06-30",
        },
        { memberId: "member-saein" },
      );

      assert.equal(result.response.fallback, false);
      assert.equal(result.response.usedModel, "gpt-chat-test");
      assert.equal(result.response.dateRange.from, "2026-06-29");
      assert.equal(result.run.actions[0].type, "canvas.memo.create");
      assert.equal(result.run.actions[0].status, "waiting_confirmation");
      assert.equal(result.run.actions[0].executedAt, null);
      assert.equal(result.run.actions[1].type, "task.update.status");
      assert.equal(result.run.actions[1].payload.taskId, "task-follow-up");
      assert.equal(result.run.actions[1].payload.status, "done");
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
        delete process.env.PILO_AGENT_CHAT_MODEL;
      } else {
        process.env.PILO_AGENT_CHAT_MODEL = originalModel;
      }
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps empty OpenAI action proposals empty for lookup questions", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalModel = process.env.PILO_AGENT_CHAT_MODEL;
    const originalFetch = globalThis.fetch;

    process.env.OPENAI_API_KEY = "test-key";
    process.env.PILO_AGENT_CHAT_MODEL = "gpt-chat-test";
    globalThis.fetch = async () =>
      Response.json({
        output_text: JSON.stringify({
          shortConclusion: "어제 회의록 기준으로 지연 위험을 먼저 확인하세요.",
          priorityTasks: ["막힌 일 확인", "오늘 처리할 작업 정리"],
          evidence: [
            {
              source: "meeting",
              title: "어제 회의록",
              detail: "회의록 contextRef를 기준으로 한 조회형 답변입니다.",
              referenceId: "meeting-2026-06-29",
            },
          ],
          recommendedNextActions: ["담당자와 막힌 사유를 확인하세요."],
          actionProposals: [],
        }),
      });

    try {
      const { service } = createService();
      const result = await service.sendChatMessage(
        "workspace-agent-runtime",
        {
          message: "어제 회의록 내용 기준으로 무엇을 먼저 처리하면 좋을까?",
          workflowType: "task.draft.generate",
          contextRefs: [{ type: "meeting_report", id: "meeting-2026-06-29" }],
          currentDateKst: "2026-06-30",
        },
        { memberId: "member-saein" },
      );

      assert.equal(result.response.fallback, false);
      assert.equal(result.response.usedModel, "gpt-chat-test");
      assert.equal(result.response.dateRange.label, "어제");
      assert.equal(result.response.dateRange.from, "2026-06-29");
      assert.deepEqual(result.response.actionProposals, []);
      assert.equal(result.run.actions.length, 0);
      assert.equal(result.run.pendingActionCount, 0);
      assert.equal(result.run.status, "succeeded");
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
      if (originalModel === undefined) {
        delete process.env.PILO_AGENT_CHAT_MODEL;
      } else {
        process.env.PILO_AGENT_CHAT_MODEL = originalModel;
      }
      globalThis.fetch = originalFetch;
    }
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
