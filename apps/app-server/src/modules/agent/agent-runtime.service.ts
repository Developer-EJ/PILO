import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  WorkspaceAccessPublicService,
  WorkspaceActor,
} from "../workspace/public/workspace-access-public.service";
import {
  AgentRunCreateBody,
  AgentChatMessageBody,
  AgentOnboardingTurnBody,
  ProjectPlanCreateBody,
} from "./agent-runtime.input";
import { AgentRuntimeRepository } from "./agent-runtime.repository";
import {
  AgentAction,
  AgentActionSource,
  AgentActionType,
  AgentChatMessage,
  AgentContextRef,
  AgentOnboardingDraft,
  AgentOnboardingFieldKey,
  AgentOnboardingMilestoneCandidate,
  AgentOnboardingTaskCandidate,
  AgentOnboardingTurnResult,
  AgentRecommendation,
  AgentRunDetail,
  AgentRunStatus,
  AgentRunStatusResponse,
  ProjectPlanDraftDetail,
  ProjectPlanFeatureDraft,
  ProjectPlanMilestoneDraft,
  ProjectPlanRiskNote,
  ProjectPlanRoleDraft,
  ProjectPlanTechStackRecommendation,
} from "./agent-runtime.types";

const LOCAL_MODEL_NAME = "local-deterministic-planner";
const DEFAULT_AGENT_CHAT_MODEL = "gpt-4.1-mini";
const agentRuntimeLogger = new Logger("AgentRuntimeService");

type AgentChatEvidenceSource =
  | "meeting"
  | "task"
  | "review"
  | "progress"
  | "canvas"
  | "agent";

type AgentChatEvidence = {
  source: AgentChatEvidenceSource;
  title: string;
  detail: string;
  referenceId: string | null;
};

type AgentChatDateRange = {
  label: string;
  from: string;
  to: string;
  timezone: "Asia/Seoul";
};

type AgentActionProposal = {
  type: AgentActionType;
  source: AgentActionSource;
  requiresConfirmation: true;
  summary: string;
  payload: Record<string, unknown>;
};

type AgentWorkspaceChatResponse = {
  shortConclusion: string;
  priorityTasks: string[];
  evidence: AgentChatEvidence[];
  recommendedNextActions: string[];
  actionProposals: AgentActionProposal[];
  dateRange: AgentChatDateRange;
  fallback: boolean;
  usedModel: string | null;
  runtime: {
    generatedAt: string;
    timezone: "Asia/Seoul";
    dateBasis: string;
    sourceStatus: {
      meetings: "provided" | "deferred";
      tasks: "provided" | "deferred";
      reviews: "provided" | "deferred";
      progress: "provided" | "deferred";
      canvas: "proposal_only" | "deferred";
    };
    diagnostic: string | null;
  };
};

@Injectable()
export class AgentRuntimeService {
  constructor(
    private readonly repository: AgentRuntimeRepository,
    private readonly workspaceAccess: WorkspaceAccessPublicService,
  ) {}

  async runOnboardingTurn(
    body: AgentOnboardingTurnBody,
  ): Promise<AgentOnboardingTurnResult> {
    const fallback = buildOnboardingFallback(body);
    const openAiResult = await tryBuildOnboardingWithOpenAI(body, fallback);

    return openAiResult ?? fallback;
  }

  async createAgentRun(
    workspaceId: string,
    body: AgentRunCreateBody,
    actor?: WorkspaceActor,
  ): Promise<AgentRunDetail> {
    const currentMember = await this.workspaceAccess.requireWorkspaceMember(
      workspaceId,
      actor,
    );

    const run = this.buildRun({
      workspaceId,
      actorMemberId: currentMember.id,
      workflowType: body.workflowType,
      workflowVersion: body.workflowVersion,
      input: body.input,
      contextRefs: body.contextRefs,
      source: sourceForWorkflow(body.workflowType),
    });

    this.repository.saveRun(run);
    this.appendRunMessages(run);
    return run;
  }

  async getAgentRun(
    runId: string,
    actor?: WorkspaceActor,
  ): Promise<AgentRunDetail> {
    const run = this.repository.getRun(runId);
    await this.workspaceAccess.requireWorkspaceMember(run.workspaceId, actor);
    return run;
  }

  async approveAction(actionId: string, actor?: WorkspaceActor) {
    const { run, action } = this.repository.findAction(actionId);
    const currentMember = await this.workspaceAccess.requireWorkspaceMember(
      run.workspaceId,
      actor,
    );
    if (action.status !== "waiting_confirmation") {
      throw new BadRequestException("Agent action is not waiting confirmation");
    }

    const now = nowIso();
    const updatedRun = this.updateActionInRun(run, actionId, {
      status: "confirmed",
      confirmedByMemberId: currentMember.id,
      confirmedAt: now,
      executedAt: null,
    });

    updatedRun.trace.push({
      id: randomUUID(),
      runId: run.id,
      stepId: null,
      message:
        "Action confirmed. Owner execution is intentionally pending behind the public action/API boundary.",
      metadata: {
        actionId,
        actionType: action.type,
      },
      createdAt: now,
    });

    return this.repository.updateRun(this.refreshRunState(updatedRun, now));
  }

  async rejectAction(actionId: string, actor?: WorkspaceActor) {
    const { run, action } = this.repository.findAction(actionId);
    await this.workspaceAccess.requireWorkspaceMember(run.workspaceId, actor);
    if (action.status !== "waiting_confirmation") {
      throw new BadRequestException("Agent action is not waiting confirmation");
    }

    const now = nowIso();
    const updatedRun = this.updateActionInRun(run, actionId, {
      status: "rejected",
      confirmedByMemberId: null,
      confirmedAt: null,
      executedAt: null,
    });

    updatedRun.trace.push({
      id: randomUUID(),
      runId: run.id,
      stepId: null,
      message: "Action rejected by user before owner-domain execution.",
      metadata: {
        actionId,
        actionType: action.type,
      },
      createdAt: now,
    });

    return this.repository.updateRun(this.refreshRunState(updatedRun, now));
  }

  async listChatMessages(
    workspaceId: string,
    actor?: WorkspaceActor,
  ): Promise<AgentChatMessage[]> {
    await this.workspaceAccess.requireWorkspaceMember(workspaceId, actor);
    return this.repository.listMessagesForWorkspace(workspaceId);
  }

  async sendChatMessage(
    workspaceId: string,
    body: AgentChatMessageBody,
    actor?: WorkspaceActor,
  ) {
    const currentMember = await this.workspaceAccess.requireWorkspaceMember(
      workspaceId,
      actor,
    );
    const userMessage = this.repository.appendMessage({
      id: randomUUID(),
      workspaceId,
      role: "user",
      body: body.message,
      runId: null,
      actionIds: [],
      createdAt: nowIso(),
    });
    const dateRange = resolveAgentChatDateRange(
      body.message,
      body.dateRange,
      body.currentDateKst,
    );
    const fallbackResponse = buildAgentChatFallbackResponse({
      workspaceId,
      message: body.message,
      contextRefs: body.contextRefs,
      currentMemberId: currentMember.id,
      dateRange,
      diagnostic: "local_fallback",
    });
    const chatResponse =
      (await tryBuildAgentChatWithOpenAI({
        workspaceId,
        message: body.message,
        workflowType: body.workflowType,
        contextRefs: body.contextRefs,
        actor,
        currentMember,
        currentUserContext: body.currentUserContext,
        currentMemberContext: body.currentMemberContext,
        dateRange,
        fallback: fallbackResponse,
      })) ?? fallbackResponse;
    const actions = chatResponse.actionProposals.map((proposal) =>
      createAction({
        runId: "pending-run-id",
        type: proposal.type,
        source: proposal.source,
        summary: proposal.summary,
        payload: proposal.payload,
      }),
    );
    const run = this.buildRun({
      workspaceId,
      actorMemberId: currentMember.id,
      workflowType: body.workflowType,
      workflowVersion: "v1",
      input: {
        message: body.message,
        currentMemberId: currentMember.id,
        currentUserId: currentMember.userId,
        currentUserContext: body.currentUserContext,
        currentMemberContext: body.currentMemberContext,
        dateRange,
      },
      contextRefs: body.contextRefs,
      source: "orchestrator",
      output: chatResponse as unknown as Record<string, unknown>,
      actions,
    });
    this.repository.saveRun(run);
    const assistantMessage = this.repository.appendMessage({
      id: randomUUID(),
      workspaceId,
      role: "assistant",
      body: formatAgentChatAssistantMessage(chatResponse),
      runId: run.id,
      actionIds: run.actions.map((action) => action.id),
      createdAt: run.updatedAt,
    });

    return {
      message: userMessage,
      assistantMessage,
      run,
      response: chatResponse,
      actions: run.actions,
    };
  }

  async listRecommendations(
    workspaceId: string,
    actor?: WorkspaceActor,
  ): Promise<AgentRecommendation[]> {
    await this.workspaceAccess.requireWorkspaceMember(workspaceId, actor);
    return this.repository
      .listRunsForWorkspace(workspaceId)
      .flatMap((run) =>
        run.actions
          .filter((action) => action.status !== "draft")
          .map((action) => toRecommendation(run.workspaceId, action)),
      );
  }

  async createProjectPlanDraft(
    workspaceId: string,
    body: ProjectPlanCreateBody,
    actor?: WorkspaceActor,
  ): Promise<ProjectPlanDraftDetail> {
    const currentMember = await this.workspaceAccess.requireWorkspaceMember(
      workspaceId,
      actor,
    );
    const now = nowIso();
    const draftId = randomUUID();
    const featureDrafts = buildFeatureDrafts(draftId, body, now);
    const milestoneDrafts = buildMilestoneDrafts(draftId, body, now);
    const riskNotes = buildRiskNotes(draftId, body, now);
    const roleDrafts = buildRoleDrafts(draftId, body, currentMember.id, now);
    const planningActionId = randomUUID();

    const plan: ProjectPlanDraftDetail = {
      id: draftId,
      workspaceId,
      goal: body.goal,
      targetUser: body.targetUser,
      problem: body.problem,
      duration: body.duration,
      outputGoal: body.outputGoal,
      status: "reviewing",
      createdByMemberId: currentMember.id,
      techStack: buildTechStack(draftId, body, now),
      featureDrafts,
      roleDrafts,
      milestoneDrafts,
      riskNotes,
      firstAgendaDraft: {
        id: randomUUID(),
        draftId,
        title: "MVP kickoff",
        objective: "프로젝트 목표, 역할, 첫 주 작업을 확정한다.",
        agendaItems: [
          "목표와 데모 시나리오 확인",
          "Must/Should 범위 합의",
          "첫 Task draft 승인",
        ],
        attendeeMemberIds: [currentMember.id],
        durationMinutes: 45,
        createdAt: now,
      },
      approval: {
        status: "waiting_confirmation",
        actionId: planningActionId,
        requestedAt: now,
        confirmedAt: null,
        executedAt: null,
        ownerApiResults: [
          ...featureDrafts
            .filter((feature) => feature.scope === "mvp")
            .map((feature) => ({
              owner: "task" as const,
              operation: "task.create" as const,
              sourceDraftType: "feature" as const,
              sourceDraftId: feature.id,
              status: "pending" as const,
              targetEntityId: null,
              errorMessage: null,
            })),
          ...milestoneDrafts.map((milestone) => ({
            owner: "task" as const,
            operation: "milestone.create" as const,
            sourceDraftType: "milestone" as const,
            sourceDraftId: milestone.id,
            status: "pending" as const,
            targetEntityId: null,
            errorMessage: null,
          })),
        ],
      },
      createdAt: now,
      updatedAt: now,
    };

    const actions: AgentAction[] = [
      ...featureDrafts
        .filter((feature) => feature.scope === "mvp")
        .map((feature) =>
          createAction({
            runId: "pending-run-id",
            type: "task.create.draft",
            source: "planning",
            payload: {
              workspaceId,
              sourceType: "planning_feature",
              sourceId: feature.id,
              title: feature.title,
              description: feature.description,
              assigneeMemberId: null,
              priority: feature.sortOrder === 0 ? "high" : "medium",
              dueDate: null,
            },
          }),
        ),
      createAction({
        id: planningActionId,
        runId: "pending-run-id",
        type: "planning.approve",
        source: "planning",
        payload: {
          workspaceId,
          draftId,
        },
      }),
    ];

    const run = this.buildRun({
      workspaceId,
      actorMemberId: currentMember.id,
      workflowType: "planning.generate",
      workflowVersion: "v1",
      input: {
        goal: body.goal,
        targetUser: body.targetUser,
        duration: body.duration,
        teamSize: body.teamSize,
        experienceLevel: body.experienceLevel,
      },
      contextRefs: [],
      source: "planning",
      output: {
        summary: `${body.goal} 계획 초안과 ${featureDrafts.length}개 기능 후보를 만들었습니다.`,
        draftId,
      },
      actions,
    });

    plan.approval.actionId = planningActionId;
    this.repository.savePlan(plan);
    this.repository.saveRun(run);
    this.appendRunMessages(run);
    return this.repository.getPlan(draftId);
  }

  async getProjectPlanDraft(
    draftId: string,
    actor?: WorkspaceActor,
  ): Promise<ProjectPlanDraftDetail> {
    const plan = this.repository.getPlan(draftId);
    await this.workspaceAccess.requireWorkspaceMember(plan.workspaceId, actor);
    return plan;
  }

  async recommendTechStack(
    draftId: string,
    actor?: WorkspaceActor,
  ): Promise<ProjectPlanDraftDetail> {
    const plan = await this.getProjectPlanDraft(draftId, actor);
    const updated = {
      ...plan,
      techStack: plan.techStack ?? buildTechStack(draftId, {}, nowIso()),
      updatedAt: nowIso(),
    };
    return this.repository.updatePlan(updated);
  }

  async breakdownFeatures(
    draftId: string,
    actor?: WorkspaceActor,
  ): Promise<ProjectPlanDraftDetail> {
    const plan = await this.getProjectPlanDraft(draftId, actor);
    if (plan.featureDrafts.length > 0) {
      return plan;
    }
    const now = nowIso();
    const updated = {
      ...plan,
      featureDrafts: buildFeatureDrafts(draftId, plan, now),
      updatedAt: now,
    };
    return this.repository.updatePlan(updated);
  }

  async assignRoles(
    draftId: string,
    actor?: WorkspaceActor,
  ): Promise<ProjectPlanDraftDetail> {
    const plan = await this.getProjectPlanDraft(draftId, actor);
    if (plan.roleDrafts.length > 0) {
      return plan;
    }
    const currentMember = await this.workspaceAccess.requireWorkspaceMember(
      plan.workspaceId,
      actor,
    );
    const now = nowIso();
    const updated = {
      ...plan,
      roleDrafts: buildRoleDrafts(
        draftId,
        { teamMembers: [] },
        currentMember.id,
        now,
      ),
      updatedAt: now,
    };
    return this.repository.updatePlan(updated);
  }

  async approveProjectPlanDraft(
    draftId: string,
    actor?: WorkspaceActor,
  ): Promise<ProjectPlanDraftDetail> {
    const plan = await this.getProjectPlanDraft(draftId, actor);
    const actionId = plan.approval.actionId;
    if (!actionId) {
      throw new BadRequestException("Planning approval action is missing");
    }

    const { run, action } = this.repository.findAction(actionId);
    if (action.status !== "waiting_confirmation") {
      throw new BadRequestException("Planning approval is not waiting");
    }

    const currentMember = await this.workspaceAccess.requireWorkspaceMember(
      plan.workspaceId,
      actor,
    );
    const now = nowIso();
    const updatedRun = this.updateActionInRun(run, actionId, {
      status: "confirmed",
      confirmedByMemberId: currentMember.id,
      confirmedAt: now,
      executedAt: null,
    });
    updatedRun.trace.push({
      id: randomUUID(),
      runId: run.id,
      stepId: null,
      message:
        "Planning approval confirmed. Task/Milestone owner execution is pending because the public integration boundary is not attached in this domain slice.",
      metadata: {
        draftId,
        actionId,
      },
      createdAt: now,
    });
    this.repository.updateRun(this.refreshRunState(updatedRun, now));

    return this.repository.updatePlan({
      ...plan,
      status: "approved",
      approval: {
        ...plan.approval,
        status: "confirmed",
        confirmedAt: now,
        executedAt: null,
        ownerApiResults: plan.approval.ownerApiResults.map((result) => ({
          ...result,
          status: "pending",
          targetEntityId: null,
          errorMessage: null,
        })),
      },
      updatedAt: now,
    });
  }

  toStatusResponse(run: AgentRunDetail): AgentRunStatusResponse {
    return {
      id: run.id,
      workspaceId: run.workspaceId,
      workflowType: run.workflowType,
      workflowVersion: run.workflowVersion,
      status: run.status,
      actionRequired: run.actionRequired,
      pendingActionCount: run.pendingActionCount,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      updatedAt: run.updatedAt,
      error: run.error,
    };
  }

  private buildRun(input: {
    workspaceId: string;
    actorMemberId: string;
    workflowType: AgentRunDetail["workflowType"];
    workflowVersion: string;
    input: Record<string, unknown>;
    contextRefs: Array<{ type: string; id: string }>;
    source: AgentActionSource;
    output?: Record<string, unknown>;
    actions?: AgentAction[];
  }): AgentRunDetail {
    const now = nowIso();
    const runId = randomUUID();
    const stepId = randomUUID();
    const generated =
      input.output ??
      generateOutput(input.workflowType, input.input, input.contextRefs);
    const rawActions =
      input.actions ??
      generateActions({
        runId,
        workspaceId: input.workspaceId,
        workflowType: input.workflowType,
        input: input.input,
        source: input.source,
      });
    const actions = rawActions.map((action) => ({
      ...action,
      runId,
    }));
    const status = actions.some(
      (action) => action.status === "waiting_confirmation",
    )
      ? "requires_confirmation"
      : "succeeded";

    return {
      id: runId,
      workflowId: randomUUID(),
      workflowType: input.workflowType,
      workflowVersion: input.workflowVersion,
      workspaceId: input.workspaceId,
      actorMemberId: input.actorMemberId,
      status,
      actionRequired: status === "requires_confirmation",
      pendingActionCount: actions.filter(
        (action) => action.status === "waiting_confirmation",
      ).length,
      input: {
        ...input.input,
        contextRefs: input.contextRefs,
      },
      output: generated,
      error: null,
      tokenUsage: estimateTokenUsage(input.input, generated),
      steps: [
        {
          id: stepId,
          runId,
          stepName: "local_draft",
          status: "succeeded",
          input: input.input,
          output: generated,
          error: null,
          tokenUsage: estimateTokenUsage(input.input, generated),
          startedAt: now,
          finishedAt: now,
          createdAt: now,
        },
      ],
      actions,
      trace: [
        {
          id: randomUUID(),
          runId,
          stepId,
          message:
            "Deterministic local runner produced structured output and approval actions.",
          metadata: {
            workflowType: input.workflowType,
            runner: LOCAL_MODEL_NAME,
          },
          createdAt: now,
        },
      ],
      startedAt: now,
      finishedAt: status === "succeeded" ? now : null,
      createdAt: now,
      updatedAt: now,
    };
  }

  private updateActionInRun(
    run: AgentRunDetail,
    actionId: string,
    patch: Partial<AgentAction>,
  ): AgentRunDetail {
    return {
      ...run,
      actions: run.actions.map((action) =>
        action.id === actionId ? { ...action, ...patch } : action,
      ),
    };
  }

  private refreshRunState(run: AgentRunDetail, updatedAt: string) {
    const pendingActionCount = run.actions.filter(
      (action) => action.status === "waiting_confirmation",
    ).length;
    const status: AgentRunStatus =
      pendingActionCount > 0 ? "requires_confirmation" : "succeeded";
    return {
      ...run,
      status,
      actionRequired: pendingActionCount > 0,
      pendingActionCount,
      finishedAt: status === "succeeded" ? (run.finishedAt ?? updatedAt) : null,
      updatedAt,
    };
  }

  private appendRunMessages(run: AgentRunDetail) {
    const userBody = summarizeInput(run.input);
    if (userBody) {
      this.repository.appendMessage({
        id: randomUUID(),
        workspaceId: run.workspaceId,
        role: "user",
        body: userBody,
        runId: run.id,
        actionIds: [],
        createdAt: run.createdAt,
      });
    }
    this.appendAssistantMessage(run);
  }

  private appendAssistantMessage(run: AgentRunDetail) {
    this.repository.appendMessage({
      id: randomUUID(),
      workspaceId: run.workspaceId,
      role: "assistant",
      body:
        typeof run.output?.summary === "string"
          ? run.output.summary
          : `${run.workflowType} 결과가 준비되었습니다.`,
      runId: run.id,
      actionIds: run.actions.map((action) => action.id),
      createdAt: run.updatedAt,
    });
  }
}

function createAction(input: {
  id?: string;
  runId: string;
  type: AgentAction["type"];
  source: AgentAction["source"];
  summary?: string;
  payload: Record<string, unknown>;
}): AgentAction {
  return {
    id: input.id ?? randomUUID(),
    runId: input.runId,
    type: input.type,
    source: input.source,
    requiresConfirmation: true,
    ...(input.summary ? { summary: input.summary } : {}),
    payload: input.payload,
    status: "waiting_confirmation",
    confirmedByMemberId: null,
    confirmedAt: null,
    executedAt: null,
  };
}

const ONBOARDING_FIELDS: AgentOnboardingFieldKey[] = [
  "workspaceTitle",
  "goal",
  "problem",
  "targetUser",
  "duration",
  "teamSize",
  "experienceLevel",
  "outputGoal",
];

const ONBOARDING_FIELD_LABELS: Record<AgentOnboardingFieldKey, string> = {
  workspaceTitle: "워크스페이스 제목",
  goal: "목표",
  problem: "해결할 문제",
  targetUser: "대상 사용자",
  duration: "기간",
  teamSize: "팀 규모",
  experienceLevel: "경험 수준",
  outputGoal: "최종 산출물",
};

const ONBOARDING_QUESTIONS: Record<AgentOnboardingFieldKey, string> = {
  workspaceTitle: "먼저 워크스페이스 이름을 정해볼까요?",
  goal: "이 워크스페이스로 이루고 싶은 가장 중요한 목표는 무엇인가요?",
  problem: "지금 팀이 해결하려는 문제나 불편함은 무엇인가요?",
  targetUser: "이 프로젝트가 가장 먼저 도와야 할 대상 사용자는 누구인가요?",
  duration: "MVP를 어느 정도 기간 안에 만들 계획인가요?",
  teamSize: "함께 만드는 팀은 몇 명인가요?",
  experienceLevel: "팀의 경험 수준은 초보, 혼합, 경험 있음 중 어디에 가까운가요?",
  outputGoal: "마지막으로 데모, 발표 자료, 배포 등 최종 산출물은 무엇이면 좋을까요?",
};

function buildOnboardingFallback(
  body: AgentOnboardingTurnBody,
): AgentOnboardingTurnResult {
  const draft = mergeOnboardingAnswer(
    normalizeOnboardingDraft(body.draft),
    body.messages,
  );
  const missingFields = missingOnboardingFields(draft);
  const ready = missingFields.length === 0;
  const fieldInFocus = ready ? null : missingFields[0];
  const taskCandidates = ready ? buildOnboardingTaskCandidates(draft) : [];
  const milestoneCandidates = ready ? buildOnboardingMilestoneCandidates(draft) : [];

  return {
    reply: ready
      ? "필수 정보가 모두 채워졌습니다. 아래 요약을 확인하고 필요하면 수정한 뒤 워크스페이스 생성을 확정해 주세요."
      : ONBOARDING_QUESTIONS[fieldInFocus!],
    draft,
    missingFields,
    ready,
    fieldInFocus,
    summary: ready ? summarizeOnboardingDraft(draft) : null,
    planningSeed: ready ? draft : null,
    taskCandidates,
    milestoneCandidates,
    usedModel: null,
    fallback: true,
  };
}

async function tryBuildOnboardingWithOpenAI(
  body: AgentOnboardingTurnBody,
  fallback: AgentOnboardingTurnResult,
): Promise<AgentOnboardingTurnResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    agentRuntimeLogger.warn(
      "Agent onboarding OpenAI fallback used: missing_api_key",
    );
    return null;
  }

  const model =
    process.env.PILO_AGENT_ONBOARDING_MODEL ??
    process.env.OPENAI_MODEL ??
    "gpt-4.1-mini";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "You are PILO's onboarding planning agent. Return one raw compact JSON object only. Do not wrap it in Markdown or code fences. Do not add prose before or after the JSON. Do not create a workspace. Ask exactly one missing question unless all required fields are complete.",
          },
          {
            role: "user",
            content: JSON.stringify({
              requiredFields: ONBOARDING_FIELDS,
              currentDraft: body.draft,
              messages: body.messages,
              fallback,
              responseRules: [
                "Return JSON only.",
                "The first character must be { and the last character must be }.",
                "Do not include markdown fences such as ```json.",
              ],
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      agentRuntimeLogger.warn(
        `Agent onboarding OpenAI fallback used: http_status status=${response.status}`,
      );
      return null;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const rawText = extractOpenAIText(payload);
    if (!rawText) {
      agentRuntimeLogger.warn(
        "Agent onboarding OpenAI fallback used: empty_output",
      );
      return null;
    }

    const parsed = parseOpenAIJson<AgentOnboardingTurnResult>(rawText);
    if (!parsed) {
      agentRuntimeLogger.warn(
        "Agent onboarding OpenAI fallback used: parse_error",
      );
      return null;
    }

    const draft = normalizeOnboardingDraft(parsed.draft ?? fallback.draft);
    const missingFields = missingOnboardingFields(draft);
    const ready = missingFields.length === 0;
    const fieldInFocus = ready
      ? null
      : parseOnboardingField(parsed.fieldInFocus) ?? missingFields[0];

    return {
      reply:
        typeof parsed.reply === "string" && parsed.reply.trim()
          ? parsed.reply.trim()
          : ready
            ? fallback.reply
            : ONBOARDING_QUESTIONS[fieldInFocus!],
      draft,
      missingFields,
      ready,
      fieldInFocus,
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : ready
            ? summarizeOnboardingDraft(draft)
            : null,
      planningSeed: ready ? draft : null,
      taskCandidates: ready
        ? sanitizeTaskCandidates(parsed.taskCandidates, draft)
        : [],
      milestoneCandidates: ready
        ? sanitizeMilestoneCandidates(parsed.milestoneCandidates, draft)
        : [],
      usedModel: model,
      fallback: false,
    };
  } catch (error) {
    agentRuntimeLogger.warn(
      `Agent onboarding OpenAI fallback used: request_error message=${safeErrorMessage(error)}`,
    );
    return null;
  }
}

async function tryBuildAgentChatWithOpenAI(input: {
  workspaceId: string;
  message: string;
  workflowType: AgentRunDetail["workflowType"];
  contextRefs: AgentContextRef[];
  actor?: WorkspaceActor;
  currentMember: { id: string; workspaceId: string; userId: string; role: string };
  currentUserContext: Record<string, unknown> | null;
  currentMemberContext: Record<string, unknown> | null;
  dateRange: AgentChatDateRange;
  fallback: AgentWorkspaceChatResponse;
}): Promise<AgentWorkspaceChatResponse | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    agentRuntimeLogger.warn(
      "Agent chat OpenAI fallback used: missing_api_key",
    );
    return null;
  }

  const model =
    process.env.PILO_AGENT_CHAT_MODEL ??
    process.env.OPENAI_MODEL ??
    DEFAULT_AGENT_CHAT_MODEL;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "You are PILO's workspace AI agent. Return one raw compact JSON object only. Do not use Markdown or code fences. Interpret relative dates in Asia/Seoul. Never execute user changes directly; represent changes only as actionProposals requiring confirmation. For read-only lookup questions, return actionProposals as an empty array. Only create canvas.memo.create when the user clearly asks to add/create/write/record a memo on the canvas or project map. For task creation, use task.create.draft. For task completion/status changes, use task.update.status. Do not invent task field update actions; report them as recommendedNextActions until the Task owner contract exists.",
          },
          {
            role: "user",
            content: JSON.stringify({
              requiredShape: {
                shortConclusion: "string",
                priorityTasks: ["string"],
                evidence: [
                  {
                    source: "meeting|task|review|progress|canvas|agent",
                    title: "string",
                    detail: "string",
                    referenceId: "string|null",
                  },
                ],
                recommendedNextActions: ["string"],
                actionProposals: [
                  {
                    type: "canvas.memo.create|task.create.draft|task.update.status",
                    summary: "string",
                    payload: "object",
                  },
                ],
              },
              workspaceId: input.workspaceId,
              userMessage: input.message,
              workflowType: input.workflowType,
              currentMember: input.currentMember,
              currentUserContext: input.currentUserContext,
              currentMemberContext: input.currentMemberContext,
              actor: input.actor ?? {},
              contextRefs: input.contextRefs,
              dateRange: input.dateRange,
              fallback: input.fallback,
              responseRules: [
                "Return JSON only.",
                "The first character must be { and the last character must be }.",
                "Do not include markdown fences such as ```json.",
                "Use actionProposals for requested changes instead of claiming execution.",
              ],
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      agentRuntimeLogger.warn(
        `Agent chat OpenAI fallback used: http_status status=${response.status}`,
      );
      return null;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const rawText = extractOpenAIText(payload);
    if (!rawText) {
      agentRuntimeLogger.warn("Agent chat OpenAI fallback used: empty_output");
      return null;
    }

    const parsed = parseOpenAIJson<AgentWorkspaceChatResponse>(rawText);
    if (!parsed) {
      agentRuntimeLogger.warn("Agent chat OpenAI fallback used: parse_error");
      return null;
    }

    return sanitizeAgentChatResponse(parsed, input.fallback, {
      workspaceId: input.workspaceId,
      dateRange: input.dateRange,
      fallback: false,
      usedModel: model,
      diagnostic: null,
    });
  } catch (error) {
    agentRuntimeLogger.warn(
      `Agent chat OpenAI fallback used: request_error message=${safeErrorMessage(error)}`,
    );
    return null;
  }
}

function extractOpenAIText(payload: Record<string, unknown>): string | null {
  if (typeof payload.output_text === "string") {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    const content = Array.isArray(item.content) ? item.content : [];
    for (const contentItem of content) {
      if (
        isRecord(contentItem) &&
        typeof contentItem.text === "string" &&
        contentItem.text.trim()
      ) {
        return contentItem.text.trim();
      }
    }
  }

  return null;
}

function parseOpenAIJson<T extends object>(
  rawText: string,
): Partial<T> | null {
  const jsonText = extractJsonObjectText(rawText);
  if (!jsonText) return null;

  try {
    return JSON.parse(jsonText) as Partial<T>;
  } catch {
    return null;
  }
}

function extractJsonObjectText(rawText: string): string | null {
  const text = rawText.trim();
  if (!text) return null;

  const fencedMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = (fencedMatch?.[1] ?? text).trim();
  if (candidate.startsWith("{") && candidate.endsWith("}")) {
    return candidate;
  }

  const objectStart = candidate.indexOf("{");
  const objectEnd = candidate.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return candidate.slice(objectStart, objectEnd + 1);
  }

  return null;
}

function buildAgentChatFallbackResponse(input: {
  workspaceId: string;
  message: string;
  contextRefs: AgentContextRef[];
  currentMemberId: string;
  dateRange: AgentChatDateRange;
  diagnostic: string;
}): AgentWorkspaceChatResponse {
  const actionProposals = inferAgentChatActionProposals(
    input.workspaceId,
    input.message,
    input.contextRefs,
  );
  const evidenceFromRefs = input.contextRefs.slice(0, 3).map((ref) => ({
    source: normalizeEvidenceSource(ref.type),
    title: `${ref.type} ${ref.id}`,
    detail:
      "요청에 포함된 contextRef입니다. 세부 read model은 owner domain API 계약이 붙으면 더 풍부하게 연결할 수 있습니다.",
    referenceId: ref.id,
  }));
  const evidence =
    evidenceFromRefs.length > 0
      ? evidenceFromRefs
      : [
          {
            source: "agent" as const,
            title: "Agent Runtime fallback",
            detail:
              "현재 세인 경계 안에서는 회의록/Task/리뷰/진행률 live read model을 직접 조회하지 않고, 요청 문장과 contextRef만 근거로 안전한 제안을 만듭니다.",
            referenceId: null,
          },
          {
            source: "progress" as const,
            title: "진행률 신호",
            detail:
              "진행률 요약은 Workspace/Dashboard read model 계약이 연결되면 근거로 사용할 수 있습니다.",
            referenceId: null,
          },
        ];

  return {
    shortConclusion: `${input.dateRange.label}(${input.dateRange.from}~${input.dateRange.to}, KST) 기준으로 확인했습니다. 직접 실행은 하지 않고 확인 가능한 다음 행동과 승인 대기 제안만 준비했습니다.`,
    priorityTasks: [
      "회의록/Task/리뷰/진행률 근거를 먼저 확인하세요.",
      "변경이 필요한 항목은 action proposal로 승인 여부를 결정하세요.",
      "캔버스나 Task 생성은 owner domain API가 연결된 뒤 실행하세요.",
    ].slice(0, 3),
    evidence,
    recommendedNextActions:
      actionProposals.length > 0
        ? [
            "제안된 action을 승인하거나 거절하세요.",
            "승인 후 실제 owner domain 실행은 Canvas/Task API 경계에서 처리해야 합니다.",
          ]
        : [
            "필요한 회의록, Task, 리뷰 contextRef를 함께 보내면 더 구체적으로 답할 수 있습니다.",
            "변경 요청이 있으면 메모 추가, Task 초안 생성처럼 구체적으로 지시하세요.",
          ],
    actionProposals,
    dateRange: input.dateRange,
    fallback: true,
    usedModel: null,
    runtime: buildAgentChatRuntimeMetadata(
      input.dateRange,
      input.diagnostic,
      input.contextRefs,
    ),
  };
}

function sanitizeAgentChatResponse(
  parsed: Partial<AgentWorkspaceChatResponse>,
  fallback: AgentWorkspaceChatResponse,
  input: {
    workspaceId: string;
    dateRange: AgentChatDateRange;
    fallback: boolean;
    usedModel: string | null;
    diagnostic: string | null;
  },
): AgentWorkspaceChatResponse {
  const actionProposals = sanitizeAgentActionProposals(
    parsed.actionProposals,
    fallback.actionProposals,
    input.workspaceId,
  );

  return {
    shortConclusion:
      cleanText(parsed.shortConclusion) ?? fallback.shortConclusion,
    priorityTasks: readTextArray(parsed.priorityTasks, fallback.priorityTasks, 3),
    evidence: sanitizeAgentChatEvidence(parsed.evidence, fallback.evidence),
    recommendedNextActions: readTextArray(
      parsed.recommendedNextActions,
      fallback.recommendedNextActions,
      5,
    ),
    actionProposals,
    dateRange: input.dateRange,
    fallback: input.fallback,
    usedModel: input.usedModel,
    runtime: {
      ...buildAgentChatRuntimeMetadata(
        input.dateRange,
        input.diagnostic,
        [],
      ),
      sourceStatus: fallback.runtime.sourceStatus,
    },
  };
}

function sanitizeAgentChatEvidence(
  value: unknown,
  fallback: AgentChatEvidence[],
): AgentChatEvidence[] {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .slice(0, 6)
    .map((item) => {
      const record = isRecord(item) ? item : {};
      const title = cleanText(record.title);
      const detail = cleanText(record.detail);
      if (!title || !detail) return null;
      return {
        source: normalizeEvidenceSource(record.source),
        title,
        detail,
        referenceId: cleanText(record.referenceId),
      };
    })
    .filter((item): item is AgentChatEvidence => Boolean(item));
  return items.length > 0 ? items : fallback;
}

function sanitizeAgentActionProposals(
  value: unknown,
  fallback: AgentActionProposal[],
  workspaceId: string,
): AgentActionProposal[] {
  if (!Array.isArray(value)) return fallback;
  if (value.length === 0) return [];
  const proposals = value
    .slice(0, 4)
    .map((item) => {
      const record = isRecord(item) ? item : {};
      const type = parseAgentActionType(record.type);
      if (!type) return null;
      const summary =
        cleanText(record.summary) ?? defaultActionSummary(type);
      const payload = isRecord(record.payload) ? record.payload : {};
      return buildActionProposal(type, workspaceId, summary, payload);
    })
    .filter((item): item is AgentActionProposal => Boolean(item));
  return proposals;
}

function inferAgentChatActionProposals(
  workspaceId: string,
  message: string,
  contextRefs: AgentContextRef[] = [],
): AgentActionProposal[] {
  const proposals: AgentActionProposal[] = [];
  if (hasCanvasMemoMutationIntent(message)) {
    const proposal = buildActionProposal(
      "canvas.memo.create",
      workspaceId,
      "프로젝트 맵 캔버스에 메모를 추가합니다.",
      {
        workspaceId,
        boardId: findContextRefId(contextRefs, /canvas.*board|board/i),
        boardHint: "project-map",
        text: extractQuotedMemoText(message) ?? message,
        shapeType: "memo",
        position: { x: 160, y: 120 },
      },
    );
    if (proposal) proposals.push(proposal);
  }

  if (hasTaskStatusMutationIntent(message)) {
    const status = readRequestedTaskStatus(message);
    const proposal = buildActionProposal(
      "task.update.status",
      workspaceId,
      `Task 상태를 ${status} 상태로 변경하도록 제안합니다.`,
      {
        workspaceId,
        taskId: findContextRefId(contextRefs, /^task$/i),
        taskHint: extractQuotedMemoText(message) ?? summarizeActionTitle(message),
        status,
      },
    );
    if (proposal) proposals.push(proposal);
    return proposals;
  }

  if (hasTaskDraftMutationIntent(message)) {
    const taskDraft = extractTaskDraftFields(message);
    const proposal = buildActionProposal(
      "task.create.draft",
      workspaceId,
      "새 작업을 생성합니다.",
      {
        workspaceId,
        sourceType: "planning_feature",
        sourceId: randomUUID(),
        title: taskDraft.title,
        description: taskDraft.description ?? message,
        assigneeName: taskDraft.assigneeName,
        assigneeMemberId: null,
        status: "todo",
        priority: "medium",
        dueDate: null,
      },
    );
    if (proposal) proposals.push(proposal);
  }

  return proposals;
}

function hasCanvasMemoMutationIntent(message: string) {
  const hasMemoTarget = /(메모|memo)/i.test(message);
  const hasCanvasTarget =
    /(캔버스|canvas|프로젝트\s*맵|project\s*map|보드|board)/i.test(message);
  return hasMemoTarget && hasCanvasTarget && hasMutationVerb(message);
}

function hasTaskDraftMutationIntent(message: string) {
  const hasTaskTarget = /(task|할\s*일|작업|업무)/i.test(message);
  const hasDraftTarget = /(초안|draft)/i.test(message);
  const hasCreateVerb =
    /(추가|생성|만들|만들어|등록|작성|create|add|make|write)/i.test(message);
  return (hasTaskTarget || hasDraftTarget) && hasCreateVerb;
}

function hasTaskStatusMutationIntent(message: string) {
  const hasTaskTarget = /(task|할\s*일|작업)/i.test(message);
  const hasStatusTarget =
    /(완료|끝났|끝내|done|complete|막힘|막힌|blocked|진행\s*중|in[-\s]?progress|검토|review)/i.test(
      message,
    );
  const hasStatusVerb =
    /(처리|표시|변경|바꿔|업데이트|전환|완료|끝내|mark|update|change|complete)/i.test(
      message,
    );
  return hasTaskTarget && hasStatusTarget && hasStatusVerb;
}

function hasMutationVerb(message: string) {
  return /(추가|생성|만들|남겨|등록|작성|기록|붙여|넣어|올려|전환|create|add|make|write|record)/i.test(
    message,
  );
}

function extractQuotedMemoText(message: string) {
  return (
    message.match(/'([^']{1,500})'/)?.[1]?.trim() ??
    message.match(/"([^"]{1,500})"/)?.[1]?.trim() ??
    message.match(/“([^”]{1,500})”/)?.[1]?.trim() ??
    message.match(/‘([^’]{1,500})’/)?.[1]?.trim() ??
    null
  );
}

function extractTaskDraftFields(message: string) {
  const description = extractKoreanClause(message, /설명(?:은|:)?\s*/i, [
    /담당자는?/i,
    /마감(?:은|일은|:)?/i,
    /우선순위(?:는|:)?/i,
  ]);
  const assigneeName = extractKoreanClause(message, /담당자는?\s*/i, [
    /설명(?:은|:)?/i,
    /마감(?:은|일은|:)?/i,
    /우선순위(?:는|:)?/i,
  ])?.replace(/(?:으로|로)?\s*(?:해줘|해주세요|배정해줘|맡겨줘)\.?$/i, "")
    .trim();
  const title =
    extractTaskTitle(message) ??
    summarizeActionTitle(
      message
        .replace(/설명(?:은|:)?\s*.+$/i, "")
        .replace(/담당자는?\s*.+$/i, ""),
    );

  return {
    title,
    description,
    assigneeName: assigneeName || null,
  };
}

function extractTaskTitle(message: string) {
  const patterns = [
    /(.+?)\s*(?:작업|업무|할\s*일)\s*(?:하나|1개|한\s*개)?\s*(?:만들어줘|만들어\s*줘|생성해줘|생성|추가해줘|추가|등록해줘|등록)/i,
    /(.+?)\s*(?:task)\s*(?:하나|1개|한\s*개)?\s*(?:만들어줘|만들어\s*줘|생성해줘|생성|추가해줘|추가|등록해줘|등록|create|add|make)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    const title = cleanTaskTitle(match?.[1]);
    if (title) return title;
  }

  return null;
}

function extractKoreanClause(
  message: string,
  prefix: RegExp,
  nextPrefixes: RegExp[],
) {
  const startMatch = prefix.exec(message);
  if (!startMatch || startMatch.index === undefined) return null;

  const startIndex = startMatch.index + startMatch[0].length;
  let endIndex = message.length;
  for (const nextPrefix of nextPrefixes) {
    const searchArea = message.slice(startIndex);
    const nextMatch = nextPrefix.exec(searchArea);
    if (nextMatch?.index !== undefined) {
      endIndex = Math.min(endIndex, startIndex + nextMatch.index);
    }
  }

  return cleanTaskClause(message.slice(startIndex, endIndex));
}

function cleanTaskTitle(value: unknown) {
  return cleanTaskClause(value)
    ?.replace(/^(그리고|그럼|그리고\s+)?/i, "")
    .replace(/(?:새|신규)\s*$/i, "")
    .trim() ?? null;
}

function cleanTaskClause(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const trimmed = text
    .replace(/[.。]+$/g, "")
    .replace(/(?:이고|이며|그리고|,)\s*$/g, "")
    .trim();
  return trimmed || null;
}

function findContextRefId(contextRefs: AgentContextRef[], pattern: RegExp) {
  return (
    contextRefs.find((ref) => pattern.test(ref.type))?.id ??
    null
  );
}

function readRequestedTaskStatus(message: string) {
  if (/(완료|끝났|끝내|done|complete)/i.test(message)) return "done";
  if (/(막힘|막힌|blocked)/i.test(message)) return "blocked";
  if (/(검토|review)/i.test(message)) return "in_review";
  if (/(진행\s*중|in[-\s]?progress)/i.test(message)) return "in_progress";
  return "in_progress";
}

function buildActionProposal(
  type: AgentActionType,
  workspaceId: string,
  summary: string,
  payload: Record<string, unknown>,
): AgentActionProposal | null {
  if (type === "canvas.memo.create") {
    const position = isRecord(payload.position) ? payload.position : {};
    return {
      type,
      source: "canvas",
      requiresConfirmation: true,
      summary,
      payload: {
        workspaceId,
        boardId: cleanText(payload.boardId),
        boardHint: cleanText(payload.boardHint) ?? "project-map",
        text: cleanText(payload.text) ?? summary,
        shapeType: "memo",
        position: {
          x: readNumberValue(position.x) ?? 160,
          y: readNumberValue(position.y) ?? 120,
        },
      },
    };
  }

  if (type === "task.create.draft") {
    return {
      type,
      source: "task",
      requiresConfirmation: true,
      summary,
      payload: {
        workspaceId,
        sourceType: "planning_feature",
        sourceId: cleanText(payload.sourceId) ?? randomUUID(),
        title: cleanText(payload.title) ?? summary,
        description: cleanText(payload.description) ?? "",
        assigneeName: cleanText(payload.assigneeName),
        assigneeMemberId: cleanText(payload.assigneeMemberId),
        status: parseTaskStatus(payload.status) ?? "todo",
        priority: parsePriority(payload.priority),
        dueDate: cleanText(payload.dueDate),
      },
    };
  }

  if (type === "task.update.status") {
    return {
      type,
      source: "task",
      requiresConfirmation: true,
      summary,
      payload: {
        workspaceId,
        taskId: cleanText(payload.taskId),
        taskHint:
          cleanText(payload.taskHint) ??
          cleanText(payload.title) ??
          cleanText(payload.description),
        status: parseTaskStatus(payload.status) ?? "in_progress",
      },
    };
  }

  return null;
}

function resolveAgentChatDateRange(
  message: string,
  input: { label?: string; from?: string; to?: string; timezone?: string } | null,
  currentDateKst: string | null,
): AgentChatDateRange {
  if (input?.from && input?.to) {
    return {
      label: input.label ?? "사용자 지정 기간",
      from: input.from,
      to: input.to,
      timezone: "Asia/Seoul",
    };
  }

  const today = parseKstDate(currentDateKst) ?? currentKstDate();
  if (/(어제|yesterday)/i.test(message)) {
    const yesterday = addDays(today, -1);
    return {
      label: "어제",
      from: yesterday,
      to: yesterday,
      timezone: "Asia/Seoul",
    };
  }

  if (/(오늘|today)/i.test(message)) {
    return {
      label: "오늘",
      from: today,
      to: today,
      timezone: "Asia/Seoul",
    };
  }

  return {
    label: "최근 7일",
    from: addDays(today, -6),
    to: today,
    timezone: "Asia/Seoul",
  };
}

function buildAgentChatRuntimeMetadata(
  dateRange: AgentChatDateRange,
  diagnostic: string | null,
  contextRefs: AgentContextRef[],
): AgentWorkspaceChatResponse["runtime"] {
  const hasSource = (source: string) =>
    contextRefs.some((ref) => ref.type.toLowerCase().includes(source));
  return {
    generatedAt: nowIso(),
    timezone: "Asia/Seoul",
    dateBasis: `${dateRange.label}:${dateRange.from}:${dateRange.to}`,
    sourceStatus: {
      meetings: hasSource("meeting") ? "provided" : "deferred",
      tasks: hasSource("task") ? "provided" : "deferred",
      reviews: hasSource("review") ? "provided" : "deferred",
      progress: hasSource("progress") ? "provided" : "deferred",
      canvas: hasSource("canvas") ? "proposal_only" : "deferred",
    },
    diagnostic,
  };
}

function formatAgentChatAssistantMessage(response: AgentWorkspaceChatResponse) {
  const lines = [
    response.shortConclusion,
    "",
    "우선 처리할 일",
    ...response.priorityTasks.slice(0, 3).map((item) => `- ${item}`),
    "",
    "다음 행동",
    ...response.recommendedNextActions.slice(0, 3).map((item) => `- ${item}`),
  ];
  if (response.actionProposals.length > 0) {
    lines.push(
      "",
      `승인 대기 제안 ${response.actionProposals.length}개가 준비됐습니다.`,
    );
  }
  return lines.join("\n");
}

function normalizeEvidenceSource(value: unknown): AgentChatEvidenceSource {
  if (value === "meeting" || value === "meeting_report") return "meeting";
  if (value === "task" || value === "task_draft") return "task";
  if (value === "review" || value === "pull_request") return "review";
  if (value === "progress") return "progress";
  if (value === "canvas") return "canvas";
  return "agent";
}

function parseAgentActionType(value: unknown): AgentActionType | null {
  return value === "canvas.memo.create" ||
    value === "task.create.draft" ||
    value === "task.update.status"
    ? value
    : null;
}

function defaultActionSummary(type: AgentActionType) {
  if (type === "canvas.memo.create") {
    return "프로젝트 맵 캔버스에 메모를 추가합니다.";
  }
  if (type === "task.create.draft") {
    return "요청 내용을 Task 초안으로 제안합니다.";
  }
  if (type === "task.update.status") {
    return "Task 상태 변경을 제안합니다.";
  }
  return "사용자 승인이 필요한 action proposal입니다.";
}

function summarizeActionTitle(message: string) {
  const trimmed = message.trim().replace(/\s+/g, " ");
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}...` : trimmed;
}

function readTextArray(
  value: unknown,
  fallback: string[],
  limit: number,
): string[] {
  if (!Array.isArray(value)) return fallback.slice(0, limit);
  const items = value
    .map((item) => cleanText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, limit);
  return items.length > 0 ? items : fallback.slice(0, limit);
}

function readNumberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseKstDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function currentKstDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(dateText: string, amount: number) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function mergeOnboardingAnswer(
  draft: AgentOnboardingDraft,
  messages: AgentOnboardingTurnBody["messages"],
): AgentOnboardingDraft {
  const latestUser = [...messages].reverse().find((message) => message.role === "user");
  if (!latestUser?.body.trim()) return draft;

  const previousAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.fieldKey);
  const focusedField =
    parseOnboardingField(previousAssistant?.fieldKey) ??
    missingOnboardingFields(draft)[0];

  if (!focusedField) return draft;

  return {
    ...draft,
    [focusedField]:
      focusedField === "teamSize"
        ? parseTeamSize(latestUser.body)
        : latestUser.body.trim(),
  };
}

function normalizeOnboardingDraft(
  input: Partial<AgentOnboardingDraft> | Record<string, unknown> | null | undefined,
): AgentOnboardingDraft {
  const source = isRecord(input) ? input : {};

  return {
    workspaceTitle: cleanText(source.workspaceTitle),
    goal: cleanText(source.goal),
    problem: cleanText(source.problem),
    targetUser: cleanText(source.targetUser),
    duration: cleanText(source.duration),
    teamSize: parseTeamSize(source.teamSize),
    experienceLevel: cleanText(source.experienceLevel),
    outputGoal: cleanText(source.outputGoal),
  };
}

function missingOnboardingFields(
  draft: AgentOnboardingDraft,
): AgentOnboardingFieldKey[] {
  return ONBOARDING_FIELDS.filter((field) => {
    const value = draft[field];
    return field === "teamSize"
      ? typeof value !== "number" || value <= 0
      : typeof value !== "string" || value.trim().length < 2;
  });
}

function summarizeOnboardingDraft(draft: AgentOnboardingDraft): string {
  return [
    `워크스페이스: ${draft.workspaceTitle}`,
    `목표: ${draft.goal}`,
    `문제: ${draft.problem}`,
    `대상 사용자: ${draft.targetUser}`,
    `기간/팀: ${draft.duration}, ${draft.teamSize}명`,
    `경험 수준: ${draft.experienceLevel}`,
    `최종 산출물: ${draft.outputGoal}`,
  ].join("\n");
}

function buildOnboardingTaskCandidates(
  draft: AgentOnboardingDraft,
): AgentOnboardingTaskCandidate[] {
  const goal = draft.goal ?? "MVP";
  const problem = draft.problem ?? "초기 문제";

  return [
    {
      workspaceId: null,
      sourceType: "planning_feature",
      sourceId: "onboarding-feature-brief",
      title: `${goal} 요구사항 정리`,
      description: `${problem}를 해결하기 위한 사용자 시나리오와 MVP 성공 기준을 정리합니다.`,
      assigneeMemberId: null,
      priority: "high",
      dueDate: null,
    },
    {
      workspaceId: null,
      sourceType: "planning_feature",
      sourceId: "onboarding-feature-plan",
      title: "첫 주 실행 Task 분해",
      description: "워크스페이스 생성 직후 승인할 수 있는 작은 Task 후보로 나눕니다.",
      assigneeMemberId: null,
      priority: "medium",
      dueDate: null,
    },
    {
      workspaceId: null,
      sourceType: "planning_feature",
      sourceId: "onboarding-feature-demo",
      title: `${draft.outputGoal ?? "데모"} 기준 점검`,
      description: "최종 산출물을 기준으로 데모에 꼭 필요한 기능과 제외 범위를 확인합니다.",
      assigneeMemberId: null,
      priority: "medium",
      dueDate: null,
    },
  ];
}

function buildOnboardingMilestoneCandidates(
  draft: AgentOnboardingDraft,
): AgentOnboardingMilestoneCandidate[] {
  return [
    {
      title: "MVP 방향 확정",
      status: "planned",
      startDate: null,
      endDate: null,
    },
    {
      title: `${draft.duration ?? "초기 기간"} 실행 계획`,
      status: "planned",
      startDate: null,
      endDate: null,
    },
  ];
}

function sanitizeTaskCandidates(
  value: unknown,
  draft: AgentOnboardingDraft,
): AgentOnboardingTaskCandidate[] {
  if (!Array.isArray(value)) return buildOnboardingTaskCandidates(draft);

  return value.slice(0, 6).map((item, index) => {
    const record = isRecord(item) ? item : {};

    return {
      workspaceId: null,
      sourceType: "planning_feature",
      sourceId: cleanText(record.sourceId) ?? `onboarding-feature-${index + 1}`,
      title: cleanText(record.title) ?? `초기 Task ${index + 1}`,
      description: cleanText(record.description) ?? "",
      assigneeMemberId: null,
      priority: parsePriority(record.priority),
      dueDate: cleanText(record.dueDate),
    };
  });
}

function sanitizeMilestoneCandidates(
  value: unknown,
  draft: AgentOnboardingDraft,
): AgentOnboardingMilestoneCandidate[] {
  if (!Array.isArray(value)) return buildOnboardingMilestoneCandidates(draft);

  return value.slice(0, 4).map((item, index) => {
    const record = isRecord(item) ? item : {};

    return {
      title: cleanText(record.title) ?? `마일스톤 ${index + 1}`,
      status: "planned",
      startDate: cleanText(record.startDate),
      endDate: cleanText(record.endDate),
    };
  });
}

function parseOnboardingField(value: unknown): AgentOnboardingFieldKey | null {
  return typeof value === "string" &&
    (ONBOARDING_FIELDS as string[]).includes(value)
    ? (value as AgentOnboardingFieldKey)
    : null;
}

function parseTeamSize(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const match = value.match(/\d+/);
    if (match) {
      const parsed = Number(match[0]);
      return parsed > 0 ? parsed : null;
    }
  }
  return null;
}

function parsePriority(value: unknown): AgentOnboardingTaskCandidate["priority"] {
  return value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "urgent"
    ? value
    : "medium";
}

function parseTaskStatus(value: unknown) {
  if (
    value === "todo" ||
    value === "in_progress" ||
    value === "in_review" ||
    value === "done" ||
    value === "blocked"
  ) {
    return value;
  }
  return null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function generateOutput(
  workflowType: AgentRunDetail["workflowType"],
  input: Record<string, unknown>,
  contextRefs: Array<{ type: string; id: string }>,
) {
  const message = text(input.message) ?? text(input.goal) ?? "요청";
  if (workflowType === "task.draft.generate") {
    return {
      summary: `${message} 기준으로 실행 가능한 Task 후보를 만들었습니다.`,
      candidateCount: 3,
    };
  }
  if (workflowType === "meeting.report.generate") {
    return {
      summary: "회의 문맥을 회의록 생성 action으로 정리했습니다.",
      contextRefs,
    };
  }
  if (workflowType === "review.analysis.generate") {
    return {
      summary: "PR 분석 action을 준비했습니다.",
      contextRefs,
    };
  }
  if (workflowType === "planning.generate") {
    return {
      summary: `${message} 프로젝트 계획 초안을 만들었습니다.`,
    };
  }
  return {
    summary: `${message} 요청에 대한 다음 action 후보를 만들었습니다.`,
  };
}

function generateActions(input: {
  runId: string;
  workspaceId: string;
  workflowType: AgentRunDetail["workflowType"];
  input: Record<string, unknown>;
  source: AgentActionSource;
}): AgentAction[] {
  if (input.workflowType === "task.draft.generate") {
    const message = text(input.input.message) ?? "프로젝트 작업";
    return [
      "요구사항을 사용자 흐름으로 정리",
      "Current Runtime API와 화면 연결",
      "승인 전 데이터 변경 방지 테스트",
    ].map((title, index) =>
      createAction({
        runId: input.runId,
        type: "task.create.draft",
        source: input.source,
        payload: {
          workspaceId: input.workspaceId,
          sourceType: "planning_feature",
          sourceId: randomUUID(),
          title,
          description: `${message} 목표를 위해 ${index + 1}번째로 처리할 작업입니다.`,
          assigneeMemberId: null,
          priority: index === 0 ? "high" : "medium",
          dueDate: null,
        },
      }),
    );
  }

  if (input.workflowType === "meeting.report.generate") {
    return [
      createAction({
        runId: input.runId,
        type: "meeting.report.generate",
        source: "meeting",
        payload: {
          workspaceId: input.workspaceId,
          meetingId: text(input.input.meetingId) ?? randomUUID(),
        },
      }),
    ];
  }

  if (input.workflowType === "review.analysis.generate") {
    return [
      createAction({
        runId: input.runId,
        type: "review.analysis.generate",
        source: "review",
        payload: {
          workspaceId: input.workspaceId,
          pullRequestId: text(input.input.pullRequestId) ?? randomUUID(),
        },
      }),
    ];
  }

  return [];
}

function toRecommendation(
  workspaceId: string,
  action: AgentAction,
): AgentRecommendation {
  return {
    id: action.id,
    workspaceId,
    owner: "agent_runtime",
    source: action.source,
    title: recommendationTitle(action),
    summary: recommendationSummary(action),
    status: action.status === "draft" ? "waiting_confirmation" : action.status,
    createdAt: action.confirmedAt ?? action.executedAt ?? nowIso(),
  };
}

function recommendationTitle(action: AgentAction): string {
  const payloadTitle = text(action.payload.title);
  if (payloadTitle) {
    return payloadTitle;
  }
  if (action.type === "canvas.memo.create") {
    return "프로젝트 맵 메모 추가";
  }
  if (action.type === "task.update.status") {
    return "Task 상태 변경";
  }
  if (action.type === "planning.approve") {
    return "프로젝트 계획 승인";
  }
  return action.type;
}

function recommendationSummary(action: AgentAction): string {
  if (action.summary) {
    return action.summary;
  }
  if (action.type === "canvas.memo.create") {
    return "승인하면 Canvas owner API 경계에서 프로젝트 맵 메모 생성으로 넘길 수 있는 제안입니다.";
  }
  if (action.type === "task.create.draft") {
    return "승인하면 Task owner API로 넘길 수 있는 TaskCreateDraft payload입니다.";
  }
  if (action.type === "task.update.status") {
    return "승인하면 Task owner API로 넘길 수 있는 TaskStatusUpdateAction payload입니다.";
  }
  if (action.type === "planning.approve") {
    return "계획 초안을 확정하고 Task/Milestone owner 실행을 대기 상태로 둡니다.";
  }
  return "사용자 확인 후 owner domain이 실행해야 하는 Agent action입니다.";
}

function buildTechStack(
  draftId: string,
  input: { experienceLevel?: string },
  createdAt: string,
): ProjectPlanTechStackRecommendation {
  const beginner = (input.experienceLevel ?? "beginner")
    .toLowerCase()
    .includes("beginner");
  return {
    id: randomUUID(),
    draftId,
    frontend: "Next.js",
    backend: "NestJS",
    databaseName: "PostgreSQL",
    ai: "OpenAI API via server/worker environment variables",
    deploy: "AWS ECS or a managed preview host",
    reason: beginner
      ? "TypeScript 기반으로 화면과 API를 나눠 구현하면서도 팀원이 같은 언어로 학습할 수 있습니다."
      : "현재 PILO runtime과 가장 잘 맞고 domain별 병렬 구현 비용이 낮습니다.",
    difficulty: beginner ? "medium" : "low",
    alternatives: ["FastAPI worker", "Supabase prototype"],
    createdAt,
  };
}

function buildFeatureDrafts(
  draftId: string,
  input: Pick<ProjectPlanCreateBody, "goal" | "targetUser">,
  createdAt: string,
): ProjectPlanFeatureDraft[] {
  return [
    {
      title: "프로젝트 시작 질문 flow",
      description: `${input.targetUser}가 ${input.goal} 목표를 설명하고 ProjectBrief를 받을 수 있게 합니다.`,
      scope: "mvp" as const,
      reason: "빈 Workspace에서 첫 방향을 잡는 MVP success criteria입니다.",
    },
    {
      title: "Task 후보 승인 queue",
      description:
        "AI가 만든 TaskCreateDraft payload를 사용자가 승인 또는 거절합니다.",
      scope: "mvp" as const,
      reason: "Agent가 원본 데이터를 바로 쓰지 않는 안전장치입니다.",
    },
    {
      title: "계획 결과 공유 화면",
      description:
        "기술스택, 기능 범위, 역할, 마일스톤, 리스크를 한 화면에서 검토합니다.",
      scope: "mvp" as const,
      reason: "팀원이 같은 기준으로 시작할 수 있게 합니다.",
    },
    {
      title: "장기 개인화 추천",
      description: "과거 프로젝트 선호도를 저장해 추천에 반영합니다.",
      scope: "excluded" as const,
      reason: "MVP에서 장기 개인화와 RAG는 제외입니다.",
    },
  ].map((feature, sortOrder) => ({
    id: randomUUID(),
    draftId,
    ...feature,
    sortOrder,
    createdAt,
  }));
}

function buildMilestoneDrafts(
  draftId: string,
  input: Pick<ProjectPlanCreateBody, "duration">,
  createdAt: string,
): ProjectPlanMilestoneDraft[] {
  const durationWeeks = Number.parseInt(input.duration, 10);
  const longProject = Number.isFinite(durationWeeks) && durationWeeks >= 5;
  return [
    {
      id: randomUUID(),
      draftId,
      title: "MVP contract and runtime slice",
      startDate: null,
      endDate: null,
      sortOrder: 0,
      createdAt,
    },
    {
      id: randomUUID(),
      draftId,
      title: longProject ? "Demo hardening" : "Demo polish",
      startDate: null,
      endDate: null,
      sortOrder: 1,
      createdAt,
    },
  ];
}

function buildRiskNotes(
  draftId: string,
  input: Pick<ProjectPlanCreateBody, "teamSize" | "experienceLevel">,
  createdAt: string,
): ProjectPlanRiskNote[] {
  return [
    {
      id: randomUUID(),
      draftId,
      content:
        "Owner API 경계가 늦게 합쳐지면 Agent action이 confirmed 상태에서 오래 대기할 수 있습니다.",
      severity: "medium",
      sortOrder: 0,
      createdAt,
    },
    {
      id: randomUUID(),
      draftId,
      content:
        input.teamSize <= 3
          ? "소규모 팀은 Must 범위를 더 작게 유지해야 합니다."
          : "병렬 구현이 많아 contract drift를 주기적으로 확인해야 합니다.",
      severity: input.experienceLevel.toLowerCase().includes("beginner")
        ? "medium"
        : "low",
      sortOrder: 1,
      createdAt,
    },
  ];
}

function buildRoleDrafts(
  draftId: string,
  input: { teamMembers?: string[] },
  fallbackMemberId: string,
  createdAt: string,
): ProjectPlanRoleDraft[] {
  const members =
    input.teamMembers && input.teamMembers.length > 0
      ? input.teamMembers
      : ["Project lead"];
  const roleNames = [
    "Product / Planning",
    "Frontend",
    "Backend",
    "AI Workflow",
    "QA / Demo",
  ];

  return members.map((name, index) => ({
    id: randomUUID(),
    draftId,
    member: {
      memberId: index === 0 ? fallbackMemberId : randomUUID(),
      name,
    },
    suggestedRole: roleNames[index % roleNames.length],
    reason: "초기 MVP demo story가 끊기지 않도록 책임 영역을 나눕니다.",
    sortOrder: index,
    createdAt,
  }));
}

function sourceForWorkflow(
  workflowType: AgentRunDetail["workflowType"],
): AgentActionSource {
  if (workflowType.startsWith("meeting.")) return "meeting";
  if (workflowType.startsWith("review.")) return "review";
  if (workflowType.startsWith("planning.")) return "planning";
  if (workflowType.startsWith("github.")) return "github";
  if (workflowType.startsWith("task.")) return "task";
  return "orchestrator";
}

function estimateTokenUsage(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
) {
  const inputTokens = Math.ceil(JSON.stringify(input).length / 4);
  const outputTokens = Math.ceil(JSON.stringify(output).length / 4);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    model: LOCAL_MODEL_NAME,
  };
}

function summarizeInput(input: Record<string, unknown>): string | null {
  return (
    text(input.message) ??
    text(input.goal) ??
    (typeof input.workflowType === "string" ? input.workflowType : null)
  );
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nowIso() {
  return new Date().toISOString();
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown_error";
}
