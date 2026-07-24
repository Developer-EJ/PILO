import assert from "node:assert/strict";

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

const result = await activateDefaultGithubBoardForRepository({
  projects: [{ id: "project-next", repositoryIds: ["repo-next"] }],
  repositoryId: "repo-next",
  activate: async () => nextActiveBoardSource
});
assert.deepEqual(result, nextActiveBoardSource);

console.log("active Board browsing separation tests passed");
