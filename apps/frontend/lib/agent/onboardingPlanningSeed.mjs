export const PLANNING_ONBOARDING_SEED_STORAGE_PREFIX =
  "pilo:planning:onboarding:";
export const PLANNING_ONBOARDING_LAST_SEED_STORAGE_KEY =
  "pilo:planning:onboarding:last";

const queryKeyMap = {
  workspaceTitle: ["workspaceTitle", "workspaceName", "title"],
  goal: ["goal"],
  problem: ["problem"],
  targetUser: ["targetUser", "target_user"],
  duration: ["duration"],
  teamSize: ["teamSize", "team_size"],
  experienceLevel: ["experienceLevel", "experience_level"],
  outputGoal: ["outputGoal", "output_goal"],
};

export function planningOnboardingSeedStorageKey(workspaceId) {
  return `${PLANNING_ONBOARDING_SEED_STORAGE_PREFIX}${workspaceId}`;
}

export function normalizePlanningOnboardingSeed(input = {}) {
  const seed = {
    workspaceTitle: text(input.workspaceTitle),
    goal: text(input.goal),
    problem: text(input.problem),
    targetUser: text(input.targetUser),
    duration: text(input.duration),
    teamSize: positiveInteger(input.teamSize),
    experienceLevel: text(input.experienceLevel),
    outputGoal: text(input.outputGoal),
  };

  return Object.values(seed).some((value) => value !== null) ? seed : null;
}

export function readPlanningOnboardingSeed({
  workspaceId,
  search,
  storage,
} = {}) {
  const querySeed = normalizePlanningOnboardingSeed(
    seedFromSearchParams(resolveSearch(search)),
  );
  if (querySeed) return querySeed;

  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage || !workspaceId) return null;

  const scopedSeed = readSeedFromStorage(
    resolvedStorage,
    planningOnboardingSeedStorageKey(workspaceId),
  );
  if (scopedSeed) return scopedSeed;

  const lastSeed = readJsonFromStorage(
    resolvedStorage,
    PLANNING_ONBOARDING_LAST_SEED_STORAGE_KEY,
  );
  if (lastSeed?.workspaceId && lastSeed.workspaceId !== workspaceId) {
    return null;
  }

  return normalizePlanningOnboardingSeed(lastSeed);
}

export function buildPlanningFormValuesFromSeed(defaults, seed) {
  if (!seed) return { ...defaults };

  return {
    ...defaults,
    workspaceTitle: seed.workspaceTitle ?? defaults.workspaceTitle,
    goal: seed.goal ?? defaults.goal,
    problem: seed.problem ?? defaults.problem,
    targetUser: seed.targetUser ?? defaults.targetUser,
    duration: seed.duration ?? defaults.duration,
    teamSize: seed.teamSize ?? defaults.teamSize,
    experienceLevel: seed.experienceLevel ?? defaults.experienceLevel,
    outputGoal: seed.outputGoal ?? defaults.outputGoal,
  };
}

export function buildAgentMessageFromPlanningSeed(seed) {
  if (!seed) {
    return "이번 MVP 범위를 실행 가능한 Task 초안으로 나눠 주세요.";
  }

  const pieces = [
    seed.workspaceTitle ? `워크스페이스: ${seed.workspaceTitle}` : null,
    seed.goal ? `목표: ${seed.goal}` : null,
    seed.problem ? `문제: ${seed.problem}` : null,
    seed.targetUser ? `대상 사용자: ${seed.targetUser}` : null,
    seed.duration ? `기간: ${seed.duration}` : null,
    seed.teamSize ? `팀 규모: ${seed.teamSize}명` : null,
    seed.experienceLevel ? `경험 수준: ${seed.experienceLevel}` : null,
    seed.outputGoal ? `최종 산출물: ${seed.outputGoal}` : null,
  ].filter(Boolean);

  return `${pieces.join("\n")}\n\n위 온보딩 맥락을 바탕으로 우선 승인할 Task 초안을 제안해 주세요.`;
}

function seedFromSearchParams(search) {
  if (!search) return {};

  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const seed = {};

  for (const [field, keys] of Object.entries(queryKeyMap)) {
    for (const key of keys) {
      if (params.has(key)) {
        seed[field] = params.get(key);
        break;
      }
    }
  }

  return seed;
}

function readSeedFromStorage(storage, key) {
  return normalizePlanningOnboardingSeed(readJsonFromStorage(storage, key));
}

function readJsonFromStorage(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function resolveSearch(search) {
  if (typeof search === "string") return search;
  if (typeof window === "undefined") return "";
  return window.location?.search ?? "";
}

function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage ?? null;
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
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return parsed > 0 ? parsed : null;
  }
  return null;
}
