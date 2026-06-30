import { buildPiloApiUrl, defaultAppServerUrl } from "../api/apiUrl.mjs";

export const agentOnboardingRequiredFields = [
  "workspaceTitle",
  "goal",
  "problem",
  "targetUser",
  "duration",
  "teamSize",
  "experienceLevel",
  "outputGoal",
];

export const agentOnboardingFieldLabels = {
  workspaceTitle: "워크스페이스 제목",
  goal: "목표",
  problem: "해결할 문제",
  targetUser: "대상 사용자",
  duration: "기간",
  teamSize: "팀 규모",
  experienceLevel: "경험 수준",
  outputGoal: "최종 산출물",
};

const fieldQuestions = {
  workspaceTitle: "먼저 워크스페이스 이름을 정해볼까요?",
  goal: "이 워크스페이스로 이루고 싶은 가장 중요한 목표는 무엇인가요?",
  problem: "지금 해결하려는 문제나 불편함은 무엇인가요?",
  targetUser: "가장 먼저 도와야 할 대상 사용자는 누구인가요?",
  duration: "MVP를 어느 정도 기간 안에 만들 계획인가요?",
  teamSize: "함께 만드는 팀은 몇 명인가요?",
  experienceLevel: "팀의 경험 수준은 초보, 혼합, 경험 있음 중 어디에 가까운가요?",
  outputGoal: "최종 산출물은 무엇이면 좋을까요?",
};

export function createAgentOnboardingClient({
  baseUrl = defaultAppServerUrl(),
  fetcher = fetch,
  mode = process.env.NEXT_PUBLIC_PILO_AGENT_ONBOARDING_MODE ??
    process.env.NEXT_PUBLIC_PILO_AGENT_MODE ??
    "api",
} = {}) {
  return mode === "mock"
    ? createMockAgentOnboardingClient()
    : createAgentOnboardingApiClient({ baseUrl, fetcher });
}

export function createAgentOnboardingApiClient({
  baseUrl = defaultAppServerUrl(),
  fetcher = fetch,
} = {}) {
  return {
    async runTurn(input = {}) {
      const response = await fetcher(
        buildPiloApiUrl("/api/agent-onboarding/turn", baseUrl),
        {
          method: "POST",
          credentials: "include",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: input.messages ?? [],
            draft: input.draft ?? {},
          }),
        },
      );

      if (!response.ok) {
        throw new Error("AI 온보딩 요청에 실패했습니다.");
      }

      return response.json();
    },
  };
}

export function createMockAgentOnboardingClient() {
  return {
    async runTurn(input = {}) {
      return buildFallbackOnboardingTurn(input);
    },
  };
}

export function buildWorkspaceCreationPayload(onboardingResult) {
  const draft = normalizeOnboardingDraft(onboardingResult?.draft);

  return {
    name: draft.workspaceTitle,
    description: draft.goal,
    type: "side_project",
    onboarding: {
      workspaceTitle: draft.workspaceTitle,
      goal: draft.goal,
      problem: draft.problem,
      targetUser: draft.targetUser,
      duration: draft.duration,
      teamSize: draft.teamSize,
      experienceLevel: draft.experienceLevel,
      outputGoal: draft.outputGoal,
    },
    planningSeed: onboardingResult?.planningSeed ?? draft,
    taskCandidates: onboardingResult?.taskCandidates ?? [],
    milestoneCandidates: onboardingResult?.milestoneCandidates ?? [],
  };
}

export function buildFallbackOnboardingTurn(input = {}) {
  const draft = mergeLatestAnswer(
    normalizeOnboardingDraft(input.draft),
    input.messages ?? [],
  );
  const missingFields = missingOnboardingFields(draft);
  const ready = missingFields.length === 0;
  const fieldInFocus = ready ? null : missingFields[0];

  return {
    reply: ready
      ? "필수 정보가 모두 채워졌습니다. 요약을 확인한 뒤 워크스페이스 생성을 확정해 주세요."
      : fieldQuestions[fieldInFocus],
    draft,
    missingFields,
    ready,
    fieldInFocus,
    summary: ready ? summarizeDraft(draft) : null,
    planningSeed: ready ? draft : null,
    taskCandidates: ready ? buildTaskCandidates(draft) : [],
    milestoneCandidates: ready ? buildMilestoneCandidates(draft) : [],
    usedModel: null,
    fallback: true,
  };
}

export function normalizeOnboardingDraft(input = {}) {
  return {
    workspaceTitle: text(input.workspaceTitle),
    goal: text(input.goal),
    problem: text(input.problem),
    targetUser: text(input.targetUser),
    duration: text(input.duration),
    teamSize: positiveInteger(input.teamSize),
    experienceLevel: text(input.experienceLevel),
    outputGoal: text(input.outputGoal),
  };
}

export function missingOnboardingFields(draft) {
  return agentOnboardingRequiredFields.filter((field) => {
    const value = draft[field];
    return field === "teamSize"
      ? typeof value !== "number" || value <= 0
      : typeof value !== "string" || value.trim().length < 2;
  });
}

function mergeLatestAnswer(draft, messages) {
  const latestUser = [...messages].reverse().find((item) => item.role === "user");
  if (!latestUser?.body?.trim()) return draft;

  const previousAssistant = [...messages]
    .reverse()
    .find((item) => item.role === "assistant" && item.fieldKey);
  const field = previousAssistant?.fieldKey ?? missingOnboardingFields(draft)[0];
  if (!field) return draft;

  return {
    ...draft,
    [field]: field === "teamSize" ? positiveInteger(latestUser.body) : latestUser.body.trim(),
  };
}

function summarizeDraft(draft) {
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

function buildTaskCandidates(draft) {
  return [
    {
      workspaceId: null,
      sourceType: "planning_feature",
      sourceId: "onboarding-feature-brief",
      title: `${draft.goal} 요구사항 정리`,
      description: `${draft.problem}를 해결하기 위한 사용자 시나리오와 MVP 성공 기준을 정리합니다.`,
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
      title: `${draft.outputGoal} 기준 점검`,
      description: "최종 산출물을 기준으로 데모에 꼭 필요한 기능과 제외 범위를 확인합니다.",
      assigneeMemberId: null,
      priority: "medium",
      dueDate: null,
    },
  ];
}

function buildMilestoneCandidates(draft) {
  return [
    {
      title: "MVP 방향 확정",
      status: "planned",
      startDate: null,
      endDate: null,
    },
    {
      title: `${draft.duration} 실행 계획`,
      status: "planned",
      startDate: null,
      endDate: null,
    },
  ];
}

function text(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function positiveInteger(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const match = value.match(/\d+/);
    if (match) return Number(match[0]);
  }
  return null;
}
