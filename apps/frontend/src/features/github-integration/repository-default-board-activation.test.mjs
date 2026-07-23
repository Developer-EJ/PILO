import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const projectSelectionModule = await import(
  new URL("./utils/github-project-selection.ts", import.meta.url)
);

const { activateDefaultGithubBoardForRepository } = projectSelectionModule;

function createProjects() {
  return [
    {
      id: "project-unlinked",
      repositoryIds: ["repo-other"]
    },
    {
      id: "project-linked-first",
      repositoryIds: ["repo-target", "repo-other"]
    },
    {
      id: "project-linked-preferred",
      repositoryIds: ["repo-target"]
    }
  ];
}

{
  const activatedSources = [];
  const projectV2Id = await activateDefaultGithubBoardForRepository({
    projects: createProjects(),
    repositoryId: "repo-target",
    activate: async (source) => {
      activatedSources.push(source);
    }
  });

  assert.equal(projectV2Id, "project-linked-first");
  assert.deepEqual(activatedSources, [
    {
      repositoryId: "repo-target",
      projectV2Id: "project-linked-first"
    }
  ]);
}

{
  const activatedSources = [];
  const projectV2Id = await activateDefaultGithubBoardForRepository({
    projects: createProjects(),
    preferredProjectV2Id: "project-linked-preferred",
    repositoryId: "repo-target",
    activate: async (source) => {
      activatedSources.push(source);
    }
  });

  assert.equal(projectV2Id, "project-linked-preferred");
  assert.deepEqual(activatedSources, [
    {
      repositoryId: "repo-target",
      projectV2Id: "project-linked-preferred"
    }
  ]);
}

{
  let didActivate = false;
  const projectV2Id = await activateDefaultGithubBoardForRepository({
    projects: [],
    repositoryId: "repo-target",
    activate: async () => {
      didActivate = true;
    }
  });

  assert.equal(projectV2Id, "");
  assert.equal(didActivate, false);
}

{
  await assert.rejects(
    () =>
      activateDefaultGithubBoardForRepository({
        projects: createProjects(),
        repositoryId: "repo-target",
        activate: async () => {
          throw new Error("activation failed");
        }
      }),
    /activation failed/
  );
}

const panel = await readFile(
  new URL("./components/github-panel.tsx", import.meta.url),
  "utf8"
);
const layout = await readFile(
  new URL("./components/github-connect-layout.tsx", import.meta.url),
  "utf8"
);
const repositories = await readFile(
  new URL("./components/github-connect-repositories.tsx", import.meta.url),
  "utf8"
);
const sync = await readFile(
  new URL("./components/github-connect-sync.tsx", import.meta.url),
  "utf8"
);

assert.match(panel, /activateDefaultGithubBoardForRepository/);
assert.match(panel, /activatingRepositoryId/);
assert.match(panel, /isSavingProjectV2SelectionsRef/);

const selectRepositoryStart = panel.indexOf(
  "async function handleSelectRepository"
);
const clearRepositoryStart = panel.indexOf(
  "function clearRepositorySelection",
  selectRepositoryStart
);
assert.ok(selectRepositoryStart >= 0 && clearRepositoryStart > selectRepositoryStart);
const selectRepositoryHandler = panel.slice(
  selectRepositoryStart,
  clearRepositoryStart
);

assert.match(
  selectRepositoryHandler,
  /activateDefaultGithubBoardForRepository\([\s\S]{0,700}activateWorkspaceBoardSource/,
  "repository selection must persist the default ProjectV2 as the active Board"
);
const activationCallIndex = selectRepositoryHandler.indexOf(
  "activateDefaultGithubBoardForRepository"
);
const selectedCommitIndex = selectRepositoryHandler.indexOf(
  "setSelectedRepositoryId(repositoryId)"
);
assert.ok(
  activationCallIndex >= 0 &&
    selectedCommitIndex > activationCallIndex,
  "repository selection must commit selected state only after activation succeeds"
);
assert.match(
  selectRepositoryHandler,
  /isSavingProjectV2SelectionsRef\.current\s*=\s*true/,
  "repository selection must lock synchronously before awaiting activation"
);
const snapshotInvalidationIndex = selectRepositoryHandler.indexOf(
  "snapshotRequestGateRef.current.invalidate()"
);
assert.ok(
  snapshotInvalidationIndex >= 0 &&
    snapshotInvalidationIndex < activationCallIndex,
  "repository selection must invalidate any in-flight snapshot refresh before activation can commit"
);
assert.match(
  selectRepositoryHandler,
  /isSavingProjectV2SelectionsRef\.current\s*=\s*false/,
  "repository selection must release the synchronous lock in finally"
);
assert.match(
  selectRepositoryHandler,
  /setSelectedRepositoryId\(repositoryId\)/,
  "repository selection should mark the repository selected after activation succeeds"
);
assert.match(
  selectRepositoryHandler,
  /setActionError\(getErrorMessage\(error\)\)/,
  "repository activation failure must surface an error without committing selection state"
);

const discoverStart = panel.indexOf("async function handleDiscoverGithubProjectV2");
const disconnectProjectOAuthStart = panel.indexOf(
  "async function handleDisconnectGithubProjectOAuth",
  discoverStart
);
assert.ok(discoverStart >= 0 && disconnectProjectOAuthStart > discoverStart);
const discoverHandler = panel.slice(discoverStart, disconnectProjectOAuthStart);
assert.match(
  discoverHandler,
  /if \(discovery\.connectionRequired\) \{[\s\S]{0,240}setActionError\(/,
  "connectionRequired must be shown as an error because selection was not applied"
);
assert.doesNotMatch(
  discoverHandler,
  /if \(discovery\.connectionRequired\) \{[\s\S]{0,240}setActionMessage\(/,
  "connectionRequired must not be shown as a success/info message"
);

const activateProjectStart = panel.indexOf(
  "async function handleActivateProjectV2"
);
const startSyncStart = panel.indexOf(
  "async function handleStartGithubSyncRun",
  activateProjectStart
);
assert.ok(activateProjectStart >= 0 && startSyncStart > activateProjectStart);
const activateProjectHandler = panel.slice(activateProjectStart, startSyncStart);
assert.match(
  activateProjectHandler,
  /isSavingProjectV2SelectionsRef\.current/,
  "manual Board activation must share the synchronous activation lock"
);
assert.match(
  activateProjectHandler,
  /snapshotRequestGateRef\.current\.invalidate\(\)[\s\S]*?activateWorkspaceBoardSource/,
  "manual Board activation must invalidate in-flight snapshot refresh before persistence"
);
assert.match(
  activateProjectHandler,
  /isSavingProjectV2SelectionsRef\.current\s*=\s*true[\s\S]*?activateWorkspaceBoardSource[\s\S]*?isSavingProjectV2SelectionsRef\.current\s*=\s*false/,
  "manual Board activation must hold and release the lock around persistence"
);

const refreshStart = panel.indexOf("function handleRefreshGithubIntegration");
const refreshEnd = panel.indexOf("async function handleStartGithubOAuth", refreshStart);
assert.ok(refreshStart >= 0 && refreshEnd > refreshStart);
const refreshHandler = panel.slice(refreshStart, refreshEnd);
assert.match(
  refreshHandler,
  /if \(isSavingProjectV2SelectionsRef\.current\) \{[\s\S]{0,80}return;/,
  "refresh must not reload snapshot while a repository/Board activation is pending"
);
assert.match(panel, /onRefresh=\{handleRefreshGithubIntegration\}/);

assert.match(layout, /activatingRepositoryId/);
assert.match(layout, /isLoading=\{isLoading \|\| isActivatingProjectV2\}/);
assert.match(layout, /isSyncing=\{isSyncing \|\| isActivatingProjectV2\}/);
assert.match(repositories, /activatingRepositoryId/);
assert.match(repositories, /설정 중/);
assert.match(
  sync,
  /<Select[\s\S]{0,120}disabled=\{isLoading \|\| isSyncing\}/,
  "sync target selection must be disabled while repository/Board activation is pending"
);
