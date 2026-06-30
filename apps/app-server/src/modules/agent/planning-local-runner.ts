import {
  AgentActionDetail,
  AgentRunDetail,
  AgentTraceEntry,
} from "./agent-runtime.types";

const LOCAL_ACTOR_MEMBER_ID = "33333333-3333-4333-8333-333333333331";
const LOCAL_NOW = "2026-06-30T00:00:00.000Z";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textFromInput(
  input: Record<string, unknown>,
  key: string,
  fallback: string,
) {
  const value = input[key];

  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  return trimmed.length ? trimmed : fallback;
}

function sequenceId(prefix: string, sequence: number) {
  return `${prefix}${String(sequence).padStart(12, "0")}`;
}

function createSequenceIdFactory(sequence: number) {
  let offset = 0;

  return (prefix: string) => {
    offset += 1;

    return sequenceId(prefix, sequence * 1000 + offset);
  };
}

function buildPlanDraft({
  actionId,
  actorMemberId,
  draftId,
  input,
  nextId,
  workspaceId,
}: {
  actionId: string;
  actorMemberId: string;
  draftId: string;
  input: Record<string, unknown>;
  nextId: (prefix: string) => string;
  workspaceId: string;
}) {
  const goal = textFromInput(input, "goal", "Launch a focused PILO MVP");
  const targetUser = textFromInput(
    input,
    "targetUser",
    "Small product teams coordinating an MVP",
  );
  const problem = textFromInput(
    input,
    "problem",
    "Project intent, tasks, meetings, and review work are split across tools.",
  );
  const duration = textFromInput(input, "duration", "4 weeks");
  const outputGoal = textFromInput(
    input,
    "outputGoal",
    "A usable MVP plan with task drafts ready for owner approval",
  );

  const featureDrafts = [
    {
      id: nextId("aaaaaaaa-aaaa-4aaa-8aaa-"),
      draftId,
      title: "Project kickoff intake",
      description:
        "Capture the project goal, audience, problem, duration, and delivery target in one planning draft.",
      scope: "mvp",
      reason: "The team needs shared context before any owner-domain writes.",
      sortOrder: 0,
      createdAt: LOCAL_NOW,
    },
    {
      id: nextId("aaaaaaaa-aaaa-4aaa-8aaa-"),
      draftId,
      title: "Approval-first action queue",
      description:
        "Show generated task and planning actions as drafts until a workspace member confirms them.",
      scope: "mvp",
      reason: "Agent output must remain reviewable before Task or Meeting APIs execute.",
      sortOrder: 1,
      createdAt: LOCAL_NOW,
    },
    {
      id: nextId("aaaaaaaa-aaaa-4aaa-8aaa-"),
      draftId,
      title: "Dashboard handoff destination",
      description:
        "Expose a workspace Agent/Planning page that Dashboard links can open without a dead route.",
      scope: "mvp",
      reason: "The MVP needs an end-to-end visible planning surface.",
      sortOrder: 2,
      createdAt: LOCAL_NOW,
    },
  ];

  const milestoneDrafts = [
    {
      id: nextId("aaaaaaaa-aaaa-4aaa-8aaa-"),
      draftId,
      title: "Planning approval checkpoint",
      startDate: "2026-07-01",
      endDate: "2026-07-05",
      sortOrder: 0,
      createdAt: LOCAL_NOW,
    },
    {
      id: nextId("aaaaaaaa-aaaa-4aaa-8aaa-"),
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
      outputGoal,
      status: "reviewing",
      createdByMemberId: actorMemberId,
      techStack: {
        id: nextId("aaaaaaaa-aaaa-4aaa-8aaa-"),
        draftId,
        frontend: "Next.js",
        backend: "NestJS",
        databaseName: "PostgreSQL",
        ai: "Local deterministic runner now, OpenAI workflow later",
        deploy: "AWS ECS",
        reason:
          "The current PILO stack already uses TypeScript, NestJS, and contract fixtures, so the MVP can move without inventing new infrastructure.",
        difficulty: "medium",
        alternatives: ["FastAPI worker-only planning", "Supabase prototype"],
        createdAt: LOCAL_NOW,
      },
      featureDrafts,
      roleDrafts: [
        {
          id: nextId("aaaaaaaa-aaaa-4aaa-8aaa-"),
          draftId,
          member: {
            memberId: actorMemberId,
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
          id: nextId("aaaaaaaa-aaaa-4aaa-8aaa-"),
          draftId,
          content:
            "Task and Meeting owner APIs may not be available when a planning draft is approved.",
          severity: "medium",
          sortOrder: 0,
          createdAt: LOCAL_NOW,
        },
        {
          id: nextId("aaaaaaaa-aaaa-4aaa-8aaa-"),
          draftId,
          content:
            "Contract drift can make fixture-backed UI look complete while runtime routes lag behind.",
          severity: "medium",
          sortOrder: 1,
          createdAt: LOCAL_NOW,
        },
      ],
      firstAgendaDraft: {
        id: nextId("aaaaaaaa-aaaa-4aaa-8aaa-"),
        draftId,
        title: "MVP planning approval",
        objective:
          "Confirm the plan draft and decide which owner APIs should receive approved actions first.",
        agendaItems: [
          "Review feature drafts",
          "Confirm action approval semantics",
          "Assign owner API follow-ups",
        ],
        attendeeMemberIds: [actorMemberId],
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

export function createPlanningGenerateRun({
  idFactory,
  sequence = 1,
  actorMemberId = LOCAL_ACTOR_MEMBER_ID,
  workspaceId,
  workflowVersion,
  rawInput,
}: {
  idFactory?: () => string;
  sequence?: number;
  actorMemberId?: string;
  workspaceId: string;
  workflowVersion: string;
  rawInput: unknown;
}): AgentRunDetail {
  const input = isRecord(rawInput) ? rawInput : {};
  const nextId: (prefix: string) => string = idFactory
    ? () => idFactory()
    : createSequenceIdFactory(sequence);
  const runId = nextId("99999999-9999-4999-8999-");
  const workflowId = nextId("99999999-9999-4999-8998-");
  const draftId = nextId("aaaaaaaa-aaaa-4aaa-8aaa-");
  const planningActionId = nextId("99999999-9999-4999-8997-");
  const taskActionId = nextId("99999999-9999-4999-8996-");
  const draft = buildPlanDraft({
    actionId: planningActionId,
    actorMemberId,
    draftId,
    input,
    nextId,
    workspaceId,
  });
  const steps = [
    {
      id: nextId("88888888-8888-4888-8888-"),
      runId,
      stepName: "collect_project_start_context",
      status: "succeeded" as const,
      input,
      output: {
        questionCount: 5,
      },
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
      id: nextId("88888888-8888-4888-8888-"),
      runId,
      stepName: "draft_project_plan",
      status: "succeeded" as const,
      input: {
        goal: draft.detail.goal,
        duration: draft.detail.duration,
      },
      output: {
        featureDraftCount: draft.detail.featureDrafts.length,
        milestoneDraftCount: draft.detail.milestoneDrafts.length,
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
  ];
  const actions: AgentActionDetail[] = [
    {
      id: planningActionId,
      runId,
      type: "planning.approve",
      source: "planning",
      requiresConfirmation: true,
      payload: {
        workspaceId,
        draftId,
      },
      status: "waiting_confirmation",
      confirmedByMemberId: null,
      confirmedAt: null,
      executedAt: null,
    },
    {
      id: taskActionId,
      runId,
      type: "task.create.draft",
      source: "planning",
      requiresConfirmation: true,
      payload: {
        workspaceId,
        sourceType: "planning_feature_draft",
        sourceId: draft.detail.featureDrafts[0].id,
        title: draft.detail.featureDrafts[0].title,
        description: draft.detail.featureDrafts[0].description,
        assigneeMemberId: null,
        priority: "medium",
        dueDate: null,
      },
      status: "waiting_confirmation",
      confirmedByMemberId: null,
      confirmedAt: null,
      executedAt: null,
    },
  ];
  const trace: AgentTraceEntry[] = steps.map((step) => ({
    id: nextId("77777777-7777-4777-8777-"),
    runId,
    stepId: step.id,
    message: `${step.stepName} completed`,
    metadata: {
      usesLlm: false,
      runner: "deterministic-local",
    },
    createdAt: LOCAL_NOW,
  }));

  return {
    id: runId,
    workflowId,
    workflowType: "planning.generate",
    workflowVersion,
    workspaceId,
    actorMemberId,
    status: "requires_confirmation",
    actionRequired: true,
    pendingActionCount: actions.length,
    input,
    output: {
      summary: `Drafted ${draft.detail.featureDrafts.length} MVP features for ${draft.detail.goal}.`,
      planDraft: draft,
    },
    error: null,
    tokenUsage: {
      inputTokens: 840,
      outputTokens: 340,
      totalTokens: 1180,
      model: "local-runner",
    },
    steps,
    actions,
    trace,
    startedAt: LOCAL_NOW,
    finishedAt: null,
    createdAt: LOCAL_NOW,
    updatedAt: LOCAL_NOW,
  };
}
