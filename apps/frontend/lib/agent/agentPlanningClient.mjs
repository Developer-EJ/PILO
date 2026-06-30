import {
  defaultWorkspaceApiBaseUrl,
  LOCAL_MVP_MEMBER_ID,
  localMvpActorHeaders,
} from "../workspace/workspaceClient.mjs";

const DEFAULT_AGENT_MODE = "mock";
const LOCAL_NOW = "2026-06-30T00:00:00.000Z";
const LOCAL_WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const LOCAL_ACTOR_MEMBER_ID = LOCAL_MVP_MEMBER_ID;

const mockRuns = new Map();

export const defaultProjectStartInput = {
  goal: "Launch a focused PILO MVP",
  targetUser: "Small product teams coordinating an MVP",
  problem:
    "Project intent, tasks, meetings, and review work are split across tools.",
  duration: "4 weeks",
  teamSize: "3 people",
  experienceLevel: "mixed",
  outputGoal: "A usable MVP plan with approved tasks ready for execution",
};

export const projectStartQuestions = [
  {
    id: "goal",
    label: "Project goal",
    placeholder: "Launch a focused PILO MVP",
  },
  {
    id: "targetUser",
    label: "Target user",
    placeholder: "Small product teams coordinating an MVP",
  },
  {
    id: "problem",
    label: "Problem",
    placeholder:
      "Project intent, tasks, meetings, and review work are split across tools.",
  },
  {
    id: "duration",
    label: "Timeline",
    placeholder: "4 weeks",
  },
  {
    id: "teamSize",
    label: "Team size",
    placeholder: "3 people",
  },
  {
    id: "experienceLevel",
    label: "Experience level",
    placeholder: "beginner / mixed / senior",
  },
  {
    id: "outputGoal",
    label: "Output goal",
    placeholder: "A usable MVP plan with approved tasks ready for execution",
  },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(input, key, fallback) {
  const value = input?.[key];

  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  return trimmed.length ? trimmed : fallback;
}

function sequenceId(prefix, sequence) {
  return `${prefix}${String(sequence).padStart(12, "0")}`;
}

function teamExecutionNote(teamSize, experienceLevel) {
  const lowerTeamSize = teamSize.toLowerCase();
  const lowerExperience = experienceLevel.toLowerCase();
  const isSmallTeam =
    /\b(1|2|3)\b/.test(lowerTeamSize) ||
    lowerTeamSize.includes("small") ||
    lowerTeamSize.includes("solo") ||
    lowerTeamSize.includes("소규모");
  const isEarlyExperience =
    lowerExperience.includes("beginner") ||
    lowerExperience.includes("junior") ||
    lowerExperience.includes("new") ||
    lowerExperience.includes("초보") ||
    lowerExperience.includes("낮");

  if (isSmallTeam && isEarlyExperience) {
    return "Keep Must scope narrow, choose familiar infrastructure, and split work into small approval-sized tasks.";
  }

  if (isSmallTeam) {
    return "Keep Must scope narrow and avoid parallel work that needs extra coordination.";
  }

  if (isEarlyExperience) {
    return "Prefer lower operational complexity and tasks with explicit acceptance criteria.";
  }

  return "Use the existing TypeScript stack and keep approval boundaries visible for the demo.";
}

function defaultAgentMode() {
  return (
    process.env.NEXT_PUBLIC_PILO_AGENT_MODE ??
    process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE ??
    DEFAULT_AGENT_MODE
  );
}

export function resolveAgentPlanningClientMode(mode = defaultAgentMode()) {
  return mode === "api" ? "api" : "mock";
}

export class AgentPlanningApiError extends Error {
  constructor(message, { status, path } = {}) {
    super(message);
    this.name = "AgentPlanningApiError";
    this.status = status;
    this.path = path;
  }
}

export function buildAgentApiUrl(path, baseUrl = defaultWorkspaceApiBaseUrl()) {
  if (!path.startsWith("/api/")) {
    throw new AgentPlanningApiError("Agent API path must start with /api/", {
      path,
    });
  }

  if (!baseUrl) {
    return path;
  }

  const normalizedBase = baseUrl.replace(/\/$/, "");

  if (normalizedBase.endsWith("/api")) {
    return `${normalizedBase}${path.slice(4)}`;
  }

  return `${normalizedBase}${path}`;
}

function buildPlanDraft(workspaceId, draftId, actionId, input) {
  const goal = textValue(input, "goal", defaultProjectStartInput.goal);
  const targetUser = textValue(
    input,
    "targetUser",
    defaultProjectStartInput.targetUser,
  );
  const problem = textValue(input, "problem", defaultProjectStartInput.problem);
  const duration = textValue(
    input,
    "duration",
    defaultProjectStartInput.duration,
  );
  const teamSize = textValue(
    input,
    "teamSize",
    defaultProjectStartInput.teamSize,
  );
  const experienceLevel = textValue(
    input,
    "experienceLevel",
    defaultProjectStartInput.experienceLevel,
  );
  const outputGoal = textValue(
    input,
    "outputGoal",
    defaultProjectStartInput.outputGoal,
  );
  const executionNote = teamExecutionNote(teamSize, experienceLevel);
  const projectBrief = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-010000000001",
    draftId,
    title: goal,
    goal,
    targetUser,
    problem,
    duration,
    teamSize,
    experienceLevel,
    outputGoal,
    successCriteria: [
      outputGoal,
      "Only approved Must tasks are written to the Task API.",
      "Dashboard shows persisted runtime Tasks after approval.",
    ],
    constraints: [executionNote],
    createdAt: LOCAL_NOW,
  };
  const featureDrafts = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-100000000001",
      draftId,
      title: "Project kickoff intake",
      description:
        "Capture the project goal, duration, team shape, and experience level as a ProjectBrief.",
      scope: "must",
      reason: "The team needs shared context before any Task API write.",
      sortOrder: 0,
      createdAt: LOCAL_NOW,
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-100000000002",
      draftId,
      title: "Approval-first action queue",
      description:
        "Show generated task candidates until a workspace member approves the exact Tasks to create.",
      scope: "must",
      reason: "Agent output must remain reviewable before the Task API executes.",
      sortOrder: 1,
      createdAt: LOCAL_NOW,
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-100000000003",
      draftId,
      title: "Dashboard handoff destination",
      description:
        "After approval, show the created Tasks on the Dashboard and Tasks board.",
      scope: "should",
      reason: "The MVP needs an end-to-end visible planning surface.",
      sortOrder: 2,
      createdAt: LOCAL_NOW,
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-100000000004",
      draftId,
      title: "Scene2 automation package",
      description:
        "Daily briefings, PR mentions, voice-driven canvas changes, and schedule automation stay outside Scene1.",
      scope: "excluded",
      reason: "Scene1 must stand alone before expanding to existing-user workflows.",
      sortOrder: 3,
      createdAt: LOCAL_NOW,
    },
  ];
  const techStackCandidates = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-300000000001",
      draftId,
      name: "Recommended MVP stack",
      frontend: "Next.js",
      backend: "NestJS",
      databaseName: "PostgreSQL",
      ai: "Local deterministic runner now, OpenAI workflow later",
      deploy: "AWS ECS",
      reason: `Matches the current PILO codebase and keeps ${teamSize} / ${experienceLevel} execution predictable. ${executionNote}`,
      difficulty: "medium",
      recommended: true,
      alternatives: ["FastAPI worker-only planning", "Supabase prototype"],
      createdAt: LOCAL_NOW,
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-300000000002",
      draftId,
      name: "Lean prototype stack",
      frontend: "Next.js",
      backend: "Supabase Edge Functions",
      databaseName: "Supabase Postgres",
      ai: "OpenAI workflow through ai-worker",
      deploy: "Vercel + Supabase",
      reason:
        "Lower operations overhead, but it would introduce a second backend shape during the current MVP branch.",
      difficulty: "low",
      recommended: false,
      alternatives: ["Keep NestJS owner APIs", "Use local-only demo data"],
      createdAt: LOCAL_NOW,
    },
  ];
  const milestoneDrafts = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-200000000001",
      draftId,
      title: "Planning approval checkpoint",
      startDate: "2026-07-01",
      endDate: "2026-07-05",
      sortOrder: 0,
      createdAt: LOCAL_NOW,
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-200000000002",
      draftId,
      title: "Owner API execution handoff",
      startDate: "2026-07-06",
      endDate: "2026-07-12",
      sortOrder: 1,
      createdAt: LOCAL_NOW,
    },
  ];

  return {
    summary: {
      id: draftId,
      workspaceId,
      goal,
      targetUser,
      status: "reviewing",
      featureDraftCount: featureDrafts.length,
      milestoneDraftCount: milestoneDrafts.length,
      riskCount: 2,
      createdAt: LOCAL_NOW,
    },
    detail: {
      id: draftId,
      workspaceId,
      goal,
      targetUser,
      problem,
      duration,
      teamSize,
      experienceLevel,
      outputGoal,
      status: "reviewing",
      createdByMemberId: LOCAL_ACTOR_MEMBER_ID,
      projectBrief,
      techStack: techStackCandidates[0],
      techStackCandidates,
      featureDrafts,
      roleDrafts: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-400000000001",
          draftId,
          member: {
            memberId: LOCAL_ACTOR_MEMBER_ID,
            name: "Sein",
          },
          suggestedRole: "Agent Runtime / Planning",
          reason:
            "Owns the local runner, action draft contract, trace, and planning approval boundary.",
          sortOrder: 0,
          createdAt: LOCAL_NOW,
        },
      ],
      milestoneDrafts,
      riskNotes: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-500000000001",
          draftId,
          content:
            "Only approved Must task actions should write to the Task API; Should and Excluded items stay read-only in Scene1.",
          severity: "medium",
          sortOrder: 0,
          createdAt: LOCAL_NOW,
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-500000000002",
          draftId,
          content: executionNote,
          severity: "medium",
          sortOrder: 1,
          createdAt: LOCAL_NOW,
        },
      ],
      firstAgendaDraft: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-600000000001",
        draftId,
        title: "MVP planning approval",
        objective:
          "Confirm ProjectBrief, Must scope, and which task candidates should be created.",
        agendaItems: [
          "Review ProjectBrief",
          "Confirm Must / Should / Excluded split",
          "Approve only the task candidates that should become Tasks",
        ],
        attendeeMemberIds: [LOCAL_ACTOR_MEMBER_ID],
        durationMinutes: 45,
        createdAt: LOCAL_NOW,
      },
      approval: {
        status: "waiting_confirmation",
        actionId,
        requestedAt: LOCAL_NOW,
        confirmedAt: null,
        executedAt: null,
        ownerApiResults: [],
      },
      createdAt: LOCAL_NOW,
      updatedAt: LOCAL_NOW,
    },
  };
}

function createLocalPlanningRun(workspaceId, input, sequence) {
  const runId = sequenceId("99999999-9999-4999-8999-", sequence);
  const workflowId = sequenceId("99999999-9999-4999-8998-", sequence);
  const draftId = sequenceId("aaaaaaaa-aaaa-4aaa-8aaa-", sequence);
  const planningActionId = sequenceId("99999999-9999-4999-8997-", sequence);
  const planDraft = buildPlanDraft(
    workspaceId,
    draftId,
    planningActionId,
    input,
  );
  const actions = [
    {
      id: planningActionId,
      runId,
      type: "planning.approve",
      source: "planning",
      requiresConfirmation: true,
      payload: { workspaceId, draftId },
      status: "waiting_confirmation",
      confirmedByMemberId: null,
      confirmedAt: null,
      executedAt: null,
    },
    ...planDraft.detail.featureDrafts
      .filter((feature) => feature.scope === "must")
      .map((feature, index) => ({
        id: sequenceId(
          "99999999-9999-4999-8996-",
          sequence * 10 + index + 1,
        ),
        runId,
        type: "task.create",
        source: "planning",
        requiresConfirmation: true,
        payload: {
          workspaceId,
          sourceType: "planning_feature_draft",
          sourceId: feature.id,
          title: feature.title,
          description: feature.description,
          assigneeMemberId: null,
          priority: "medium",
          dueDate: null,
          status: "todo",
        },
        status: "waiting_confirmation",
        confirmedByMemberId: null,
        confirmedAt: null,
        executedAt: null,
      })),
  ];

  return {
    id: runId,
    workflowId,
    workflowType: "planning.generate",
    workflowVersion: "v1",
    workspaceId,
    actorMemberId: LOCAL_ACTOR_MEMBER_ID,
    status: "requires_confirmation",
    actionRequired: true,
    pendingActionCount: actions.length,
    input,
    output: {
      summary: `Drafted ${planDraft.detail.featureDrafts.length} MVP features for ${planDraft.detail.goal}.`,
      planDraft,
    },
    error: null,
    tokenUsage: {
      inputTokens: 840,
      outputTokens: 340,
      totalTokens: 1180,
      model: "local-runner",
    },
    steps: [
      {
        id: sequenceId("88888888-8888-4888-8888-", sequence * 10 + 1),
        runId,
        stepName: "collect_project_start_context",
        status: "succeeded",
        input,
        output: { questionCount: 7 },
        error: null,
        tokenUsage: {
          inputTokens: 320,
          outputTokens: 80,
          totalTokens: 400,
          model: "local-runner",
        },
        startedAt: LOCAL_NOW,
        finishedAt: LOCAL_NOW,
        createdAt: LOCAL_NOW,
      },
      {
        id: sequenceId("88888888-8888-4888-8888-", sequence * 10 + 2),
        runId,
        stepName: "draft_project_plan",
        status: "succeeded",
        input: {
          goal: planDraft.detail.goal,
          duration: planDraft.detail.duration,
        },
        output: {
          featureDraftCount: planDraft.detail.featureDrafts.length,
          milestoneDraftCount: planDraft.detail.milestoneDrafts.length,
        },
        error: null,
        tokenUsage: {
          inputTokens: 520,
          outputTokens: 260,
          totalTokens: 780,
          model: "local-runner",
        },
        startedAt: LOCAL_NOW,
        finishedAt: LOCAL_NOW,
        createdAt: LOCAL_NOW,
      },
    ],
    actions,
    trace: [
      {
        id: sequenceId("77777777-7777-4777-8777-", sequence * 10 + 1),
        runId,
        stepId: sequenceId("88888888-8888-4888-8888-", sequence * 10 + 1),
        message: "collect_project_start_context completed",
        metadata: { usesLlm: false, runner: "deterministic-local" },
        createdAt: LOCAL_NOW,
      },
      {
        id: sequenceId("77777777-7777-4777-8777-", sequence * 10 + 2),
        runId,
        stepId: sequenceId("88888888-8888-4888-8888-", sequence * 10 + 2),
        message: "draft_project_plan completed",
        metadata: { usesLlm: false, runner: "deterministic-local" },
        createdAt: LOCAL_NOW,
      },
    ],
    startedAt: LOCAL_NOW,
    finishedAt: null,
    createdAt: LOCAL_NOW,
    updatedAt: LOCAL_NOW,
  };
}

function refreshRunActionState(run) {
  const waitingActionCount = run.actions.filter(
    (action) => action.status === "waiting_confirmation",
  ).length;
  const terminalStatuses = new Set(["executed", "rejected", "failed"]);
  const failedActionCount = run.actions.filter(
    (action) => action.status === "failed",
  ).length;

  run.actionRequired = waitingActionCount > 0;
  run.pendingActionCount = run.actions.filter(
    (action) => !terminalStatuses.has(action.status),
  ).length;
  run.status =
    waitingActionCount > 0
      ? "requires_confirmation"
      : failedActionCount > 0
        ? "failed"
        : "succeeded";
  run.updatedAt = new Date().toISOString();
}

function taskIdForAction(action) {
  return `44444444-4444-4444-8444-${String(action.id).slice(-12)}`;
}

function taskOwnerResult(action, status, targetEntityId, errorMessage = null) {
  return {
    owner: "task",
    operation: "task.create",
    sourceDraftType: "feature",
    sourceDraftId:
      typeof action.payload.sourceId === "string"
        ? action.payload.sourceId
        : action.id,
    status,
    targetEntityId,
    errorMessage,
  };
}

function updatePlanApproval(run, action) {
  const approval = run.output?.planDraft?.detail?.approval;

  if (!approval) {
    return;
  }

  if (action.type === "planning.approve") {
    approval.status = action.status;
    approval.confirmedAt = action.confirmedAt;
    approval.executedAt = action.executedAt;
    return;
  }

  if (
    (action.type === "task.create" || action.type === "task.create.draft") &&
    action.status === "executed"
  ) {
    approval.ownerApiResults = [
      ...approval.ownerApiResults,
      taskOwnerResult(action, "succeeded", taskIdForAction(action)),
    ];
  }
}

async function readAgentJson(response, path) {
  try {
    return await response.json();
  } catch (error) {
    throw new AgentPlanningApiError("Agent API returned invalid JSON", {
      status: response.status,
      path,
    });
  }
}

async function requestAgentJson(path, init, { baseUrl, fetcher }) {
  const response = await fetcher(buildAgentApiUrl(path, baseUrl), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...localMvpActorHeaders(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new AgentPlanningApiError("Agent API request failed", {
      status: response.status,
      path,
    });
  }

  return readAgentJson(response, path);
}

function withJsonBody(body, init = {}) {
  return {
    ...init,
    body: JSON.stringify(body),
  };
}

export function createAgentPlanningApiClient({
  baseUrl = defaultWorkspaceApiBaseUrl(),
  fetcher = fetch,
} = {}) {
  const requestOptions = { baseUrl, fetcher };

  return {
    async startPlanningRun(workspaceId, input = defaultProjectStartInput) {
      return requestAgentJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/agent-runs`,
        withJsonBody(
          {
            workflowType: "planning.generate",
            workflowVersion: "v1",
            input,
            contextRefs: [],
          },
          { method: "POST" },
        ),
        requestOptions,
      );
    },

    async getRun(runId) {
      return requestAgentJson(
        `/api/agent-runs/${encodeURIComponent(runId)}`,
        undefined,
        requestOptions,
      );
    },

    async listWorkspaceActions(workspaceId) {
      return requestAgentJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/agent-actions`,
        undefined,
        requestOptions,
      );
    },

    async approveAction(actionId) {
      return requestAgentJson(
        `/api/agent-actions/${encodeURIComponent(actionId)}/approve`,
        { method: "POST" },
        requestOptions,
      );
    },

    async rejectAction(actionId) {
      return requestAgentJson(
        `/api/agent-actions/${encodeURIComponent(actionId)}/reject`,
        { method: "POST" },
        requestOptions,
      );
    },
  };
}

export function createMockAgentPlanningClient() {
  return {
    async startPlanningRun(workspaceId = LOCAL_WORKSPACE_ID, input = {}) {
      const sequence = mockRuns.size + 1;
      const run = createLocalPlanningRun(
        workspaceId,
        isRecord(input) ? input : {},
        sequence,
      );

      mockRuns.set(run.id, clone(run));

      return clone(run);
    },

    async getRun(runId) {
      return clone(
        mockRuns.get(runId) ??
          createLocalPlanningRun(LOCAL_WORKSPACE_ID, {}, 1),
      );
    },

    async listWorkspaceActions(workspaceId = LOCAL_WORKSPACE_ID) {
      return [...mockRuns.values()]
        .filter((run) => run.workspaceId === workspaceId)
        .flatMap((run) => run.actions)
        .map((action) => clone(action));
    },

    async approveAction(actionId) {
      for (const run of mockRuns.values()) {
        const action = run.actions.find(
          (candidate) => candidate.id === actionId,
        );

        if (!action) continue;

        const decidedAt = new Date().toISOString();

        action.status =
          action.type === "planning.approve" ||
          action.type === "task.create" ||
          action.type === "task.create.draft"
            ? "executed"
            : "confirmed";
        action.confirmedByMemberId = LOCAL_ACTOR_MEMBER_ID;
        action.confirmedAt = decidedAt;
        action.executedAt = action.status === "executed" ? decidedAt : null;
        updatePlanApproval(run, action);
        refreshRunActionState(run);

        return clone(action);
      }

      throw new AgentPlanningApiError("Agent action not found", {
        status: 404,
        path: `/api/agent-actions/${actionId}/approve`,
      });
    },

    async rejectAction(actionId) {
      for (const run of mockRuns.values()) {
        const action = run.actions.find(
          (candidate) => candidate.id === actionId,
        );

        if (!action) continue;

        action.status = "rejected";
        action.confirmedByMemberId = null;
        action.confirmedAt = null;
        action.executedAt = null;
        updatePlanApproval(run, action);
        refreshRunActionState(run);

        return clone(action);
      }

      throw new AgentPlanningApiError("Agent action not found", {
        status: 404,
        path: `/api/agent-actions/${actionId}/reject`,
      });
    },
  };
}

export function createAgentPlanningClient(options = {}) {
  const mode = resolveAgentPlanningClientMode(options.mode);

  if (mode === "api") {
    return createAgentPlanningApiClient(options);
  }

  return createMockAgentPlanningClient();
}
