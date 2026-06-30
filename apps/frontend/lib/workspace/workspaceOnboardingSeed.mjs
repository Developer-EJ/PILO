export const PLANNING_ONBOARDING_SEED_STORAGE_PREFIX =
  "pilo:planning:onboarding:";
export const PLANNING_ONBOARDING_LAST_SEED_STORAGE_KEY =
  "pilo:planning:onboarding:last";

function defaultWorkspaceStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch (error) {
    return null;
  }
}

function text(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function positiveTeamSize(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const exactNumber = value.trim();

  if (/^\d+$/.test(exactNumber)) {
    const parsed = Number(exactNumber);

    return parsed > 0 ? parsed : null;
  }

  const firstNumber = value.match(/\d+/)?.[0];

  if (!firstNumber) {
    return null;
  }

  const parsed = Number(firstNumber);

  return parsed > 0 ? parsed : null;
}

function normalizeExperienceLevel(value) {
  const level = text(value);

  if (!level) return null;

  const normalizedLevelByLabel = {
    입문: "beginner",
    초급: "beginner",
    중급: "intermediate",
    고급: "advanced",
    "혼합 팀": "mixed",
  };

  return normalizedLevelByLabel[level] ?? level;
}

export function workspacePlanningOnboardingSeedStorageKey(workspaceId) {
  return `${PLANNING_ONBOARDING_SEED_STORAGE_PREFIX}${workspaceId}`;
}

export function buildWorkspacePlanningOnboardingSeed(values, workspaceId) {
  return {
    workspaceId: text(workspaceId),
    workspaceTitle: text(values?.title) ?? text(values?.workspaceTitle),
    goal: text(values?.goal),
    problem: text(values?.problem),
    targetUser: text(values?.targetUsers) ?? text(values?.targetUser),
    duration: text(values?.duration),
    teamSize: positiveTeamSize(values?.teamSize),
    experienceLevel: normalizeExperienceLevel(values?.experienceLevel),
    outputGoal: text(values?.finalDeliverable) ?? text(values?.outputGoal),
  };
}

export function writeWorkspacePlanningOnboardingSeed({
  workspaceId,
  values,
  storage = defaultWorkspaceStorage(),
}) {
  const seed = buildWorkspacePlanningOnboardingSeed(values, workspaceId);

  if (!storage || !seed.workspaceId) {
    return seed;
  }

  try {
    const serializedSeed = JSON.stringify(seed);

    storage.setItem(
      workspacePlanningOnboardingSeedStorageKey(seed.workspaceId),
      serializedSeed,
    );
    storage.setItem(PLANNING_ONBOARDING_LAST_SEED_STORAGE_KEY, serializedSeed);
  } catch (error) {
    // Planning can still use the workspace description if storage is blocked.
  }

  return seed;
}
