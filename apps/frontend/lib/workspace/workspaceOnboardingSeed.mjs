export const PLANNING_ONBOARDING_SEED_STORAGE_PREFIX =
  "pilo:planning:onboarding:";
export const PLANNING_ONBOARDING_LAST_SEED_STORAGE_KEY =
  "pilo:planning:onboarding:last";
export const WORKSPACE_ONBOARDING_PAYLOAD_STORAGE_PREFIX =
  "pilo:workspace:onboarding-payload:";
export const WORKSPACE_ONBOARDING_LAST_PAYLOAD_STORAGE_KEY =
  "pilo:workspace:onboarding-payload:last";

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

function readStoredJson(storage, key) {
  try {
    const rawValue = storage?.getItem(key);

    return rawValue ? JSON.parse(rawValue) : null;
  } catch (error) {
    return null;
  }
}

export function workspacePlanningOnboardingSeedStorageKey(workspaceId) {
  return `${PLANNING_ONBOARDING_SEED_STORAGE_PREFIX}${workspaceId}`;
}

export function workspaceOnboardingPayloadStorageKey(workspaceId) {
  return `${WORKSPACE_ONBOARDING_PAYLOAD_STORAGE_PREFIX}${workspaceId}`;
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

export function buildWorkspaceDescriptionFromOnboardingSeed(seed) {
  if (!seed) return null;

  const description = [
    ["목표", text(seed.goal)],
    ["해결할 문제", text(seed.problem)],
    ["대상 사용자", text(seed.targetUser)],
    ["기간", text(seed.duration)],
    [
      "팀 규모",
      typeof seed.teamSize === "number" && Number.isFinite(seed.teamSize)
        ? String(seed.teamSize)
        : text(seed.teamSize),
    ],
    ["경험 수준", text(seed.experienceLevel)],
    ["최종 산출물", text(seed.outputGoal)],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");

  return description || null;
}

export function readWorkspacePlanningOnboardingSeed({
  workspaceId,
  storage = defaultWorkspaceStorage(),
} = {}) {
  if (!storage || !workspaceId) {
    return null;
  }

  const scopedSeed = readStoredJson(
    storage,
    workspacePlanningOnboardingSeedStorageKey(workspaceId),
  );
  if (scopedSeed) {
    return buildWorkspacePlanningOnboardingSeed(scopedSeed, workspaceId);
  }

  const lastSeed = readStoredJson(storage, PLANNING_ONBOARDING_LAST_SEED_STORAGE_KEY);
  if (!lastSeed || lastSeed.workspaceId !== workspaceId) {
    return null;
  }

  return buildWorkspacePlanningOnboardingSeed(lastSeed, workspaceId);
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

function withWorkspaceId(value, workspaceId) {
  if (!workspaceId || typeof value !== "object" || value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return null;
  }

  return {
    ...value,
    workspaceId,
  };
}

function withWorkspaceIdList(values, workspaceId) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => withWorkspaceId(value, workspaceId))
    .filter(Boolean);
}

export function buildWorkspaceOnboardingPayloadSnapshot({
  workspaceId,
  payload,
} = {}) {
  const resolvedWorkspaceId = text(workspaceId);
  const source = payload && typeof payload === "object" ? payload : {};
  const planningSeed = buildWorkspacePlanningOnboardingSeed(
    source.planningSeed ?? source.onboarding,
    resolvedWorkspaceId,
  );

  return {
    workspaceId: resolvedWorkspaceId,
    name: text(source.name) ?? planningSeed.workspaceTitle,
    description: text(source.description),
    type: text(source.type) ?? "side_project",
    onboarding: buildWorkspacePlanningOnboardingSeed(
      source.onboarding ?? source.planningSeed,
      resolvedWorkspaceId,
    ),
    planningSeed,
    taskCandidates: withWorkspaceIdList(source.taskCandidates, resolvedWorkspaceId),
    milestoneCandidates: withWorkspaceIdList(
      source.milestoneCandidates,
      resolvedWorkspaceId,
    ),
  };
}

export function readWorkspaceOnboardingPayload({
  workspaceId,
  storage = defaultWorkspaceStorage(),
} = {}) {
  if (!storage || !workspaceId) {
    return null;
  }

  const scopedPayload = readStoredJson(
    storage,
    workspaceOnboardingPayloadStorageKey(workspaceId),
  );
  if (scopedPayload) {
    return buildWorkspaceOnboardingPayloadSnapshot({
      workspaceId,
      payload: scopedPayload,
    });
  }

  const lastPayload = readStoredJson(
    storage,
    WORKSPACE_ONBOARDING_LAST_PAYLOAD_STORAGE_KEY,
  );
  if (!lastPayload || lastPayload.workspaceId !== workspaceId) {
    return null;
  }

  return buildWorkspaceOnboardingPayloadSnapshot({
    workspaceId,
    payload: lastPayload,
  });
}

export function writeWorkspaceOnboardingPayload({
  workspaceId,
  payload,
  storage = defaultWorkspaceStorage(),
}) {
  const snapshot = buildWorkspaceOnboardingPayloadSnapshot({
    workspaceId,
    payload,
  });

  if (!storage || !snapshot.workspaceId) {
    return snapshot;
  }

  try {
    const serializedPayload = JSON.stringify(snapshot);

    storage.setItem(
      workspaceOnboardingPayloadStorageKey(snapshot.workspaceId),
      serializedPayload,
    );
    storage.setItem(
      WORKSPACE_ONBOARDING_LAST_PAYLOAD_STORAGE_KEY,
      serializedPayload,
    );
  } catch (error) {
    // Candidate previews are optional; workspace creation must not fail on storage.
  }

  return snapshot;
}
