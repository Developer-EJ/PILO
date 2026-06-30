import { buildPiloApiUrl } from "../api/apiUrl.mjs";

const DEFAULT_AGENT_MODE = "mock";
const MOCK_WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const MOCK_MEMBER_ID = "33333333-3333-4333-8333-333333333331";

const mockState = {
  messages: [],
  recommendations: [],
  plans: new Map(),
  runs: new Map(),
};

export function defaultAgentMode() {
  return (
    process.env.NEXT_PUBLIC_PILO_AGENT_MODE ??
    process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE ??
    DEFAULT_AGENT_MODE
  );
}

export function resolveAgentClientMode(mode = defaultAgentMode()) {
  return mode === "api" ? "api" : "mock";
}

export class AgentApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "AgentApiError";
    this.status = options.status ?? null;
    this.path = options.path ?? null;
  }
}

export function createAgentApiClient({ baseUrl = "", fetcher = fetch } = {}) {
  async function readJson(response, path) {
    try {
      return await response.json();
    } catch {
      throw new AgentApiError("Agent API returned invalid JSON", {
        status: response.status,
        path,
      });
    }
  }

  async function request(path, { method = "GET", body } = {}) {
    const response = await fetcher(buildPiloApiUrl(path, baseUrl), {
      method,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      throw new AgentApiError(`Agent API request failed: ${path}`, {
        status: response.status,
        path,
      });
    }

    return readJson(response, path);
  }

  async function executePlanOwnerApis(plan) {
    if (!plan?.approval?.ownerApiResults?.length) {
      return plan;
    }

    const updatedResults = [];
    for (const result of plan.approval.ownerApiResults) {
      try {
        if (result.operation === "milestone.create") {
          const milestone = plan.milestoneDrafts?.find(
            (item) => item.id === result.sourceDraftId,
          );
          if (!milestone) {
            updatedResults.push({
              ...result,
              status: "skipped",
              errorMessage: "연결할 마일스톤 후보를 찾을 수 없습니다.",
            });
            continue;
          }

          const created = await request(
            `/api/workspaces/${encodeURIComponent(plan.workspaceId)}/milestones`,
            {
              method: "POST",
              body: {
                title: milestone.title,
                status: "planned",
                startDate: milestone.startDate,
                endDate: milestone.endDate,
              },
            },
          );
          updatedResults.push({
            ...result,
            status: "succeeded",
            targetEntityId: created.id ?? null,
            errorMessage: null,
          });
          continue;
        }

        if (result.operation === "task.create") {
          const feature = plan.featureDrafts?.find(
            (item) => item.id === result.sourceDraftId,
          );
          if (!feature) {
            updatedResults.push({
              ...result,
              status: "skipped",
              errorMessage: "연결할 기능 후보를 찾을 수 없습니다.",
            });
            continue;
          }

          const created = await request(
            `/api/workspaces/${encodeURIComponent(plan.workspaceId)}/task-drafts`,
            {
              method: "POST",
              body: {
                workspaceId: plan.workspaceId,
                sourceType: "planning_feature",
                sourceId: feature.id,
                title: feature.title,
                description: feature.description,
                assigneeMemberId: null,
                priority: feature.sortOrder === 0 ? "high" : "medium",
                dueDate: null,
              },
            },
          );
          updatedResults.push({
            ...result,
            status: "succeeded",
            targetEntityId: created.id ?? null,
            errorMessage: null,
          });
          continue;
        }

        updatedResults.push({
          ...result,
          status: "skipped",
          errorMessage: "지원하지 않는 owner API 작업입니다.",
        });
      } catch (error) {
        updatedResults.push({
          ...result,
          status: "failed",
          targetEntityId: null,
          errorMessage:
            error instanceof Error
              ? error.message
              : "담당 도메인 API 실행에 실패했습니다.",
        });
      }
    }

    return {
      ...plan,
      approval: {
        ...plan.approval,
        executedAt: new Date().toISOString(),
        ownerApiResults: updatedResults,
      },
    };
  }

  return {
    createProjectPlanDraft(workspaceId, body) {
      return request(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/project-plan-drafts`,
        { method: "POST", body },
      );
    },
    getProjectPlanDraft(draftId) {
      return request(`/api/project-plan-drafts/${encodeURIComponent(draftId)}`);
    },
    recommendTechStack(draftId) {
      return request(
        `/api/project-plan-drafts/${encodeURIComponent(draftId)}/recommend-tech-stack`,
        { method: "POST" },
      );
    },
    breakdownFeatures(draftId) {
      return request(
        `/api/project-plan-drafts/${encodeURIComponent(draftId)}/breakdown-features`,
        { method: "POST" },
      );
    },
    assignRoles(draftId) {
      return request(
        `/api/project-plan-drafts/${encodeURIComponent(draftId)}/assign-roles`,
        { method: "POST" },
      );
    },
    async approveProjectPlanDraft(draftId, options = {}) {
      const approved = await request(
        `/api/project-plan-drafts/${encodeURIComponent(draftId)}/approve`,
        { method: "POST" },
      );
      return options.executeOwnerApis === false
        ? approved
        : executePlanOwnerApis(approved);
    },
    createAgentRun(workspaceId, body) {
      return request(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/agent-runs`,
        { method: "POST", body },
      );
    },
    getAgentRun(runId) {
      return request(`/api/agent-runs/${encodeURIComponent(runId)}`);
    },
    approveAction(actionId) {
      return request(`/api/agent-actions/${encodeURIComponent(actionId)}/approve`, {
        method: "POST",
      });
    },
    rejectAction(actionId) {
      return request(`/api/agent-actions/${encodeURIComponent(actionId)}/reject`, {
        method: "POST",
      });
    },
    listChatMessages(workspaceId) {
      return request(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/agent-chat/messages`,
      );
    },
    sendChatMessage(workspaceId, body) {
      return request(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/agent-chat/messages`,
        { method: "POST", body },
      );
    },
    listRecommendations(workspaceId) {
      return request(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/agent-recommendations`,
      );
    },
  };
}

export function createMockAgentClient() {
  return {
    async createProjectPlanDraft(workspaceId = MOCK_WORKSPACE_ID, body = {}) {
      const plan = createMockPlan(workspaceId, body);
      const run = createMockRun(workspaceId, {
        workflowType: "planning.generate",
        input: body,
        output: {
          summary: `${plan.goal} 계획 초안이 준비되었습니다.`,
          draftId: plan.id,
        },
        actions: [
          ...plan.featureDrafts
            .filter((feature) => feature.scope === "mvp")
            .map((feature) =>
              createMockAction("task.create.draft", "planning", {
                workspaceId,
                sourceType: "planning_feature",
                sourceId: feature.id,
                title: feature.title,
                description: feature.description,
                assigneeMemberId: null,
                priority: feature.sortOrder === 0 ? "high" : "medium",
                dueDate: null,
              }),
            ),
          createMockAction("planning.approve", "planning", {
            workspaceId,
            draftId: plan.id,
          }, plan.approval.actionId),
        ],
      });
      linkRunActions(run);
      mockState.plans.set(plan.id, plan);
      mockState.runs.set(run.id, run);
      appendMockMessage(
        workspaceId,
        "user",
        body.goal ?? "프로젝트 계획",
        null,
        [],
      );
      appendMockMessage(
        workspaceId,
        "assistant",
        run.output.summary,
        run.id,
        run.actions.map((action) => action.id),
      );
      syncRecommendations(workspaceId);
      return clone(plan);
    },
    async getProjectPlanDraft(draftId) {
      return clone(requireMockPlan(draftId));
    },
    async recommendTechStack(draftId) {
      return clone(requireMockPlan(draftId));
    },
    async breakdownFeatures(draftId) {
      return clone(requireMockPlan(draftId));
    },
    async assignRoles(draftId) {
      return clone(requireMockPlan(draftId));
    },
    async approveProjectPlanDraft(draftId) {
      const plan = requireMockPlan(draftId);
      const now = new Date().toISOString();
      plan.status = "approved";
      plan.updatedAt = now;
      plan.approval.status = "confirmed";
      plan.approval.confirmedAt = now;
      plan.approval.executedAt = now;
      plan.approval.ownerApiResults = plan.approval.ownerApiResults.map(
        (result) => {
          const prefix =
            result.operation === "milestone.create" ? "mock-milestone" : "mock-task";
          return {
            ...result,
            status: "succeeded",
            targetEntityId: `${prefix}-${result.sourceDraftId}`,
            errorMessage: null,
          };
        },
      );
      updateMockAction(plan.approval.actionId, {
        status: "confirmed",
        confirmedAt: now,
        confirmedByMemberId: MOCK_MEMBER_ID,
      });
      syncRecommendations(plan.workspaceId);
      return clone(plan);
    },
    async createAgentRun(workspaceId = MOCK_WORKSPACE_ID, body = {}) {
      const run = createMockRun(workspaceId, {
        workflowType: body.workflowType ?? "task.draft.generate",
        input: body.input ?? {},
      });
      linkRunActions(run);
      mockState.runs.set(run.id, run);
      appendMockMessage(
        workspaceId,
        "assistant",
        run.output.summary,
        run.id,
        run.actions.map((action) => action.id),
      );
      syncRecommendations(workspaceId);
      return clone(run);
    },
    async getAgentRun(runId) {
      return clone(requireMockRun(runId));
    },
    async approveAction(actionId) {
      const run = updateMockAction(actionId, {
        status: "confirmed",
        confirmedAt: new Date().toISOString(),
        confirmedByMemberId: MOCK_MEMBER_ID,
      });
      syncRecommendations(run.workspaceId);
      return clone(run);
    },
    async rejectAction(actionId) {
      const run = updateMockAction(actionId, {
        status: "rejected",
        confirmedAt: null,
        confirmedByMemberId: null,
      });
      syncRecommendations(run.workspaceId);
      return clone(run);
    },
    async listChatMessages(workspaceId = MOCK_WORKSPACE_ID) {
      seedMockMessages(workspaceId);
      return clone(mockState.messages.filter((message) => message.workspaceId === workspaceId));
    },
    async sendChatMessage(workspaceId = MOCK_WORKSPACE_ID, body = {}) {
      appendMockMessage(workspaceId, "user", body.message, null, []);
      const run = createMockRun(workspaceId, {
        workflowType: body.workflowType ?? "task.draft.generate",
        input: { message: body.message },
      });
      linkRunActions(run);
      mockState.runs.set(run.id, run);
      const message = appendMockMessage(
        workspaceId,
        "assistant",
        run.output.summary,
        run.id,
        run.actions.map((action) => action.id),
      );
      syncRecommendations(workspaceId);
      return { message: clone(message), run: clone(run) };
    },
    async listRecommendations(workspaceId = MOCK_WORKSPACE_ID) {
      syncRecommendations(workspaceId);
      return clone(
        mockState.recommendations.filter(
          (recommendation) => recommendation.workspaceId === workspaceId,
        ),
      );
    },
  };
}

export function createAgentClient(options = {}) {
  return resolveAgentClientMode(options.mode) === "api"
    ? createAgentApiClient(options)
    : createMockAgentClient();
}

function createMockPlan(workspaceId, body) {
  const now = new Date().toISOString();
  const id = uuid();
  const features = [
    ["프로젝트 시작 질문", "목표, 기간, 경험 수준을 받아 프로젝트 요약을 만듭니다.", "mvp"],
    ["승인 대기열", "AI가 제안한 Task 후보를 승인하거나 거절합니다.", "mvp"],
    ["계획 결과 검토", "스택, 기능, 역할, 마일스톤, 리스크를 함께 확인합니다.", "mvp"],
    ["장기 개인화 추천", "개인 선호를 장기 저장해 추천합니다.", "excluded"],
  ].map(([title, description, scope], sortOrder) => ({
    id: uuid(),
    draftId: id,
    title,
    description,
    scope,
    reason:
      scope === "mvp"
        ? "MVP 성공 기준에 직접 연결됩니다."
        : "MVP 제외 범위입니다.",
    sortOrder,
    createdAt: now,
  }));
  const milestones = ["런타임 흐름 구현", "데모 다듬기"].map((title, sortOrder) => ({
    id: uuid(),
    draftId: id,
    title,
    startDate: null,
    endDate: null,
    sortOrder,
    createdAt: now,
  }));
  const approvalActionId = uuid();

  return {
    id,
    workspaceId,
    goal: body.goal ?? "AI 프로젝트 운영 MVP",
    targetUser: body.targetUser ?? "초보 개발팀",
    problem: body.problem ?? "프로젝트 시작과 실행 관리가 흩어져 있습니다.",
    duration: body.duration ?? "4 weeks",
    outputGoal: body.outputGoal ?? "시연 가능한 MVP",
    status: "reviewing",
    createdByMemberId: MOCK_MEMBER_ID,
    techStack: {
      id: uuid(),
      draftId: id,
      frontend: "Next.js",
      backend: "NestJS",
      databaseName: "PostgreSQL",
      ai: "서버/worker 환경변수 기반 OpenAI API",
      deploy: "AWS ECS 또는 미리보기 배포 환경",
      reason: "현재 PILO 구조와 맞고 TypeScript로 병렬 구현하기 쉽습니다.",
      difficulty: "medium",
      alternatives: ["FastAPI worker", "Supabase 프로토타입"],
      createdAt: now,
    },
    featureDrafts: features,
    roleDrafts: (body.teamMembers?.length ? body.teamMembers : ["프로젝트 리드"]).map(
      (name, sortOrder) => ({
        id: uuid(),
        draftId: id,
        member: { memberId: sortOrder === 0 ? MOCK_MEMBER_ID : uuid(), name },
        suggestedRole: ["기획", "프론트엔드", "백엔드", "AI 워크플로"][sortOrder % 4],
        reason: "데모 흐름이 끊기지 않도록 책임 영역을 나눕니다.",
        sortOrder,
        createdAt: now,
      }),
    ),
    milestoneDrafts: milestones,
    riskNotes: [
      {
        id: uuid(),
        draftId: id,
        content: "Owner API 경계가 늦어지면 실행 제안이 승인됨 상태에 머물 수 있습니다.",
        severity: "medium",
        sortOrder: 0,
        createdAt: now,
      },
    ],
    firstAgendaDraft: {
      id: uuid(),
      draftId: id,
      title: "MVP 킥오프",
      objective: "목표, 역할, 첫 주 Task 후보를 확정합니다.",
      agendaItems: ["목표 확인", "역할 분배", "Task 초안 승인"],
      attendeeMemberIds: [MOCK_MEMBER_ID],
      durationMinutes: 45,
      createdAt: now,
    },
    approval: {
      status: "waiting_confirmation",
      actionId: approvalActionId,
      requestedAt: now,
      confirmedAt: null,
      executedAt: null,
      ownerApiResults: [
        ...features
          .filter((feature) => feature.scope === "mvp")
          .map((feature) => ({
            owner: "task",
            operation: "task.create",
            sourceDraftType: "feature",
            sourceDraftId: feature.id,
            status: "pending",
            targetEntityId: null,
            errorMessage: null,
          })),
        ...milestones.map((milestone) => ({
          owner: "task",
          operation: "milestone.create",
          sourceDraftType: "milestone",
          sourceDraftId: milestone.id,
          status: "pending",
          targetEntityId: null,
          errorMessage: null,
        })),
      ],
    },
    createdAt: now,
    updatedAt: now,
  };
}

function createMockRun(workspaceId, options = {}) {
  const now = new Date().toISOString();
  const id = uuid();
  const workflowType = options.workflowType ?? "task.draft.generate";
  const actions =
    options.actions ??
    [
      createMockAction("task.create.draft", "orchestrator", {
        workspaceId,
        sourceType: "agent_recommendation",
        sourceId: uuid(),
        title: "다음 MVP 범위를 하루 단위 Task로 나누기",
        description: "사용자가 바로 승인할 수 있는 작은 작업으로 나눕니다.",
        assigneeMemberId: null,
        priority: "medium",
        dueDate: null,
      }),
    ];
  return {
    id,
    workflowId: uuid(),
    workflowType,
    workflowVersion: "v1",
    workspaceId,
    actorMemberId: MOCK_MEMBER_ID,
    status: actions.length ? "requires_confirmation" : "succeeded",
    actionRequired: actions.length > 0,
    pendingActionCount: actions.length,
    input: options.input ?? {},
    output:
      options.output ??
      {
        summary: "AI 에이전트 실행 제안이 준비되었습니다.",
      },
    error: null,
    tokenUsage: {
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
      model: "mock-local-planner",
    },
    steps: [],
    actions,
    trace: [],
    startedAt: now,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function createMockAction(type, source, payload, id = uuid()) {
  return {
    id,
    runId: "pending-run-id",
    type,
    source,
    requiresConfirmation: true,
    payload,
    status: "waiting_confirmation",
    confirmedByMemberId: null,
    confirmedAt: null,
    executedAt: null,
  };
}

function linkRunActions(run) {
  run.actions = run.actions.map((action) => ({ ...action, runId: run.id }));
}

function updateMockAction(actionId, patch) {
  for (const run of mockState.runs.values()) {
    const index = run.actions.findIndex((action) => action.id === actionId);
    if (index >= 0) {
      run.actions[index] = { ...run.actions[index], ...patch };
      run.pendingActionCount = run.actions.filter(
        (action) => action.status === "waiting_confirmation",
      ).length;
      run.actionRequired = run.pendingActionCount > 0;
      run.status = run.actionRequired ? "requires_confirmation" : "succeeded";
      run.updatedAt = new Date().toISOString();
      return run;
    }
  }
  throw new AgentApiError("Mock 실행 제안을 찾을 수 없습니다.");
}

function syncRecommendations(workspaceId) {
  const recommendations = [];
  for (const run of mockState.runs.values()) {
    if (run.workspaceId !== workspaceId) continue;
    for (const action of run.actions) {
      recommendations.push({
        id: action.id,
        workspaceId,
        owner: "agent_runtime",
        source: action.source,
        title: action.payload.title ?? action.type,
        summary:
          action.type === "planning.approve"
            ? "계획 초안을 확정하고 owner 실행 대기 상태로 둡니다."
            : "승인 후 담당 도메인 API로 넘길 수 있는 실행 제안입니다.",
        status: action.status,
        createdAt: action.confirmedAt ?? run.createdAt,
      });
    }
  }
  mockState.recommendations = recommendations;
}

function appendMockMessage(workspaceId, role, body, runId, actionIds) {
  const message = {
    id: uuid(),
    workspaceId,
    role,
    body,
    runId,
    actionIds,
    createdAt: new Date().toISOString(),
  };
  mockState.messages.push(message);
  return message;
}

function seedMockMessages(workspaceId) {
  if (mockState.messages.some((message) => message.workspaceId === workspaceId)) {
    return;
  }
  appendMockMessage(
    workspaceId,
    "assistant",
    "프로젝트 시작 AI 에이전트에게 목표를 입력하면 Task 초안 실행 제안을 만들 수 있습니다.",
    null,
    [],
  );
}

function requireMockPlan(draftId) {
  const plan = mockState.plans.get(draftId);
  if (!plan) throw new AgentApiError("Mock 계획 초안을 찾을 수 없습니다.");
  return plan;
}

function requireMockRun(runId) {
  const run = mockState.runs.get(runId);
  if (!run) throw new AgentApiError("Mock 실행 기록을 찾을 수 없습니다.");
  return run;
}

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".replace(/a/g, () =>
    Math.floor(Math.random() * 16).toString(16),
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
