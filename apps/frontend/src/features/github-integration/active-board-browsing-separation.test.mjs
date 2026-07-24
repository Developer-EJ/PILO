import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panel = await readFile(
  new URL("./components/github-panel.tsx", import.meta.url),
  "utf8"
);

const {
  activateDefaultGithubBoardForRepository,
  isGithubActiveBoardProject,
  resolveGithubBrowsingSelection
} = await import(new URL("./utils/github-project-selection.ts", import.meta.url));

const activeBoardSource = {
  boardId: "board-active",
  workspaceId: "workspace-active",
  repository: {
    id: "repo-active",
    fullName: "owner/repo-active",
    htmlUrl: "https://github.com/owner/repo-active"
  },
  project: {
    id: "project-active",
    githubProjectNodeId: "PVT_active",
    projectNumber: 1,
    title: "Active project",
    url: "https://github.com/orgs/owner/projects/1"
  },
  updatedByUserId: "user-active",
  updatedAt: "2026-07-24T00:00:00.000Z"
};
const nextActiveBoardSource = {
  ...activeBoardSource,
  boardId: "board-next",
  repository: {
    id: "repo-next",
    fullName: "owner/repo-next",
    htmlUrl: "https://github.com/owner/repo-next"
  },
  project: {
    id: "project-next",
    githubProjectNodeId: "PVT_next",
    projectNumber: 2,
    title: "Next project",
    url: "https://github.com/orgs/owner/projects/2"
  }
};

assert.deepEqual(
  resolveGithubBrowsingSelection({
    repositories: [{ id: "repo-active" }],
    projects: [{ id: "project-active", repositoryIds: ["repo-active"] }],
    activeBoardSource
  }),
  { repositoryId: "repo-active", projectV2Id: "project-active" }
);

assert.deepEqual(
  resolveGithubBrowsingSelection({
    repositories: [{ id: "repo-active" }],
    projects: [{ id: "project-active", repositoryIds: ["repo-active"] }],
    activeBoardSource,
    preferredRepositoryId: "",
    preferredProjectV2Id: ""
  }),
  { repositoryId: "", projectV2Id: "" }
);

assert.equal(
  isGithubActiveBoardProject({
    activeBoardSource,
    repositoryId: "repo-active",
    projectV2Id: "project-active"
  }),
  true
);
assert.equal(
  isGithubActiveBoardProject({
    activeBoardSource,
    repositoryId: "repo-other",
    projectV2Id: "project-active"
  }),
  false
);
assert.equal(
  isGithubActiveBoardProject({
    activeBoardSource,
    repositoryId: "repo-active",
    projectV2Id: "project-other"
  }),
  false
);

const result = await activateDefaultGithubBoardForRepository({
  projects: [{ id: "project-next", repositoryIds: ["repo-next"] }],
  repositoryId: "repo-next",
  activate: async () => nextActiveBoardSource
});
assert.deepEqual(result, nextActiveBoardSource);

const snapshotLoader =
  panel.match(/async function loadGithubIntegrationSnapshot\([\s\S]*?\n  \}/)?.[0] ??
  "";
const repositoryHandler =
  panel.match(
    /async function handleSelectRepository\(repositoryId: string\) \{[\s\S]*?\n  \}\n\n  function clearRepositorySelection/
  )?.[0] ?? "";
const clearSelectionHandler =
  panel.match(
    /function clearRepositorySelection\(\) \{[\s\S]*?\n  \}\n\n  function handleRepositoryQueryChange/
  )?.[0] ?? "";
const manualActivationHandler =
  panel.match(
    /async function handleActivateProjectV2\(projectV2Id: string\) \{[\s\S]*?\n  \}\n\n  async function handleStartGithubSyncRun/
  )?.[0] ?? "";
const syncHandler =
  panel.match(
    /async function handleStartGithubSyncRun\(\) \{[\s\S]*?\n  \}\n\n  return \(/
  )?.[0] ?? "";


assert.match(
  panel,
  /GithubActiveBoardSource/,
  "GithubPanel must type the server-confirmed active Board source"
);
assert.match(
  panel,
  /const \[activeBoardSource, setActiveBoardSource\] =\s*useState<GithubActiveBoardSource \| null>\(null\)/,
  "active Board source must be state independent from browsing selections"
);
assert.match(
  panel,
  /const \[browsingRepositoryId, setBrowsingRepositoryId\] = useState\(""\)/,
  "repository browsing must have independent state"
);
assert.match(
  panel,
  /const \[browsingProjectV2Id, setBrowsingProjectV2Id\] = useState\(""\)/,
  "ProjectV2 browsing must have independent state"
);
assert.match(
  panel,
  /const browsingRepositoryIdRef = useRef\(""\)/,
  "repository browsing must have a ref for snapshot refresh defaults"
);
assert.match(
  panel,
  /const browsingProjectV2IdRef = useRef\(""\)/,
  "ProjectV2 browsing must have a ref for snapshot refresh defaults"
);
assert.match(
  snapshotLoader,
  /setActiveBoardSource\(activeBoardSource\)/,
  "snapshot GET must always update the active Board source"
);
assert.match(
  snapshotLoader,
  /setBrowsingRepositoryId\(nextRepositoryId\)/,
  "snapshot GET must update browsing repository separately"
);
assert.match(
  snapshotLoader,
  /setBrowsingProjectV2Id\(nextProjectV2Id\)/,
  "snapshot GET must update browsing ProjectV2 separately"
);
assert.match(
  snapshotLoader,
  /browsingRepositoryIdRef\.current = ""/,
  "workspace reset/error paths must clear repository browsing refs"
);
assert.match(
  snapshotLoader,
  /browsingProjectV2IdRef\.current = ""/,
  "workspace reset/error paths must clear ProjectV2 browsing refs"
);
assert.match(
  repositoryHandler,
  /setBrowsingRepositoryId\(repositoryId\)/,
  "repository browsing must commit immediately when a row is selected"
);
assert.match(
  repositoryHandler,
  /setBrowsingProjectV2Id\(""\)/,
  "repository browsing must clear ProjectV2 before discovery"
);
assert.match(
  repositoryHandler,
  /if \(isSavingProjectV2SelectionsRef\.current\) \{[\s\S]{0,120}return;/,
  "a held activation lock must allow browse-only selection without a second discovery or PUT"
);
assert.ok(
  repositoryHandler.indexOf("setBrowsingRepositoryId(repositoryId)") >= 0 &&
    repositoryHandler.indexOf("setBrowsingRepositoryId(repositoryId)") <
      repositoryHandler.indexOf("if (isSavingProjectV2SelectionsRef.current)"),
  "repository browsing must commit before checking the activation lock"
);
assert.match(
  repositoryHandler,
  /activate: \(source\) => \{[\s\S]{0,320}shouldApplyGithubBrowsingResult[\s\S]{0,320}setBrowsingProjectV2Id\(source\.projectV2Id\)[\s\S]{0,320}activateWorkspaceBoardSource/,
  "default activation must move browsing ProjectV2 only when the requested repository is still browsed before PUT"
);
assert.match(
  repositoryHandler,
  /applyActivatedGithubBoardSource\(activatedSource\)/,
  "successful default activation must store only the returned active Board source"
);
assert.doesNotMatch(
  repositoryHandler,
  /setActiveBoardSource\(null\)/,
  "failed default activation must not clear the previous active Board source"
);
assert.doesNotMatch(
  clearSelectionHandler,
  /setActiveBoardSource/,
  "clearing repository browsing must not clear the active Board source"
);
assert.match(
  manualActivationHandler,
  /const requestedRepositoryId = browsingRepositoryId/,
  "manual activation must capture the browsing repository before awaiting PUT"
);
assert.match(
  manualActivationHandler,
  /repositoryId: requestedRepositoryId/,
  "manual activation PUT must use the captured browsing repository"
);
assert.match(
  manualActivationHandler,
  /const activatedSource = await apiClient\.activateWorkspaceBoardSource/,
  "manual activation must retain the PUT response"
);
assert.match(
  manualActivationHandler,
  /applyActivatedGithubBoardSource\(activatedSource\)/,
  "manual activation must store only the returned active Board source"
);
assert.doesNotMatch(
  manualActivationHandler,
  /setBrowsingRepositoryId|setBrowsingProjectV2Id/,
  "manual activation success must not mutate browsing state"
);
assert.match(
  syncHandler,
  /body\.repositoryId = browsingRepositoryId/,
  "manual sync repository scope must use the browsing repository"
);
assert.match(
  syncHandler,
  /body\.projectV2Id = browsingProjectV2Id/,
  "manual sync ProjectV2 scope must use the browsing ProjectV2"
);
assert.doesNotMatch(
  syncHandler,
  /setActiveBoardSource|setBrowsingRepositoryId|setBrowsingProjectV2Id/,
  "manual sync must not mutate active or browsing state"
);


console.log("active Board browsing separation tests passed");
