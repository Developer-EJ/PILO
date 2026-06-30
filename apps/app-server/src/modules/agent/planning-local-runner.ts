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

function teamExecutionNote(teamSize: string, experienceLevel: string) {
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
    "A usable MVP plan with approved tasks ready for execution",
  );
  const teamSize = textFromInput(input, "teamSize", "3 people");
  const experienceLevel = textFromInput(input, "experienceLevel", "mixed");
  const executionNote = teamExecutionNote(teamSize, experienceLevel);

  const projectBrief = {
    id: nextId("aaaaaaaa-aaaa-4aaa-8aaa-"),
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
      id: nextId("aaaaaaaa-aaaa-4aaa-8aaa-"),
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
      id: nextId("aaaaaaaa-aaaa-4aaa-8aaa-"),
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
      id: nextId("aaaaaaaa-aaaa-4aaa-8aaa-"),
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
      id: nextId("aaaaaaaa-aaaa-4aaa-8aaa-"),
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
      id: nextId("aaaaaaaa-aaaa-4aaa-8aaa-"),
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
      id: nextId("aaaaaaaa-aaaa-4aaa-8aaa-"),
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
      teamSize,
      experienceLevel,
      outputGoal,
      status: "reviewing",
      createdByMemberId: actorMemberId,
      projectBrief,
      techStack: techStackCandidates[0],
      techStackCandidates,
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
            "Only approved Must task actions should write to the Task API; Should and Excluded items stay read-only in Scene1.",
          severity: "medium",
          sortOrder: 0,
          createdAt: LOCAL_NOW,
        },
        {
          id: nextId("aaaaaaaa-aaaa-4aaa-8aaa-"),
          draftId,
          content: executionNote,
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
          "Confirm ProjectBrief, Must scope, and which task candidates should be created.",
        agendaItems: [
          "Review ProjectBrief",
          "Confirm Must / Should / Excluded split",
          "Approve only the task candidates that should become Tasks",
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
        questionCount: 7,
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
    ...draft.detail.featureDrafts
      .filter((feature) => feature.scope === "must")
      .map((feature) => ({
        id: nextId("99999999-9999-4999-8996-"),
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
        status: "waiting_confirmation" as const,
        confirmedByMemberId: null,
        confirmedAt: null,
        executedAt: null,
      })),
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
