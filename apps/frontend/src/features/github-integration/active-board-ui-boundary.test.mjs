import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panelSource = await readFile(
  new URL("./components/github-panel.tsx", import.meta.url),
  "utf8"
);
const layoutSource = await readFile(
  new URL("./components/github-connect-layout.tsx", import.meta.url),
  "utf8"
);
const projectSource = await readFile(
  new URL("./components/github-connect-project.tsx", import.meta.url),
  "utf8"
);
const repositorySource = await readFile(
  new URL("./components/github-connect-repositories.tsx", import.meta.url),
  "utf8"
);

const projectPropsBlock =
  projectSource.match(/type GithubConnectProjectProps = \{[\s\S]*?\n\};/)?.[0] ??
  "";
const projectComponentSignature =
  projectSource.match(
    /export function GithubConnectProject\(\{[\s\S]*?\}: GithubConnectProjectProps\)/
  )?.[0] ?? "";
const projectDialogList =
  projectSource.match(
    /projects\.map\(\(project\) => \{[\s\S]*?\n\s+\}\)\}/
  )?.[0] ?? "";
const projectPanelBody =
  projectSource.match(
    /\{activeProject && activeRepository \? \([\s\S]*?projects\.length === 0 \? \(/
  )?.[0] ?? "";
const repositorySearchBlock =
  repositorySource.match(/<Input[\s\S]*?\/>/)?.[0] ?? "";
const previousPageButton =
  repositorySource.match(
    /<Button[\s\S]*?onClick=\{\(\) => onRepositoryPageChange\(repositoryPage - 1\)\}[\s\S]*?<\/Button>/
  )?.[0] ?? "";
const nextPageButton =
  repositorySource.match(
    /<Button[\s\S]*?onClick=\{\(\) => onRepositoryPageChange\(repositoryPage \+ 1\)\}[\s\S]*?<\/Button>/
  )?.[0] ?? "";
const repositoryRowButton =
  repositorySource.match(
    /<Button[\s\S]*?onClick=\{onSelect\}[\s\S]*?<\/Button>/
  )?.[0] ?? "";

assert.match(
  panelSource,
  /activeBoardSource=\{visibleActiveBoardSource\}/,
  "GithubPanel must pass the workspace-scoped active source to layout"
);
assert.match(
  layoutSource,
  /GithubActiveBoardSource/,
  "layout props must include the active source type"
);
assert.match(
  layoutSource,
  /activeBoardSource: GithubActiveBoardSource \| null/,
  "layout must expose activeBoardSource separately from browsing selection"
);
assert.match(
  layoutSource,
  /activeBoardSource=\{activeBoardSource\}/,
  "layout must pass activeBoardSource through to the Project panel"
);
assert.doesNotMatch(
  layoutSource,
  /activeProjectV2Id=\{selectedProjectV2Id\}/,
  "layout must not treat browsing selectedProjectV2Id as the active ProjectV2"
);

assert.match(
  projectPropsBlock,
  /activeBoardSource: GithubActiveBoardSource \| null/,
  "Project props must receive the active source object"
);
assert.doesNotMatch(
  projectPropsBlock,
  /activeProjectV2Id/,
  "Project props must not accept a bare active ProjectV2 id"
);
assert.match(
  projectComponentSignature,
  /activeBoardSource/,
  "Project component must destructure activeBoardSource"
);
assert.match(
  projectSource,
  /const activeProject = activeBoardSource\?\.project \?\?/,
  "top active Board card must render from activeBoardSource.project"
);
assert.ok(
  projectPanelBody.indexOf("activeProject && activeRepository ? (") >= 0 &&
    projectPanelBody.indexOf("activeProject && activeRepository ? (") <
      projectPanelBody.indexOf("!selectedRepository ? ("),
  "top active Board card must render before browsing repository empty state"
);
assert.match(
  projectPanelBody,
  /activeRepository\.fullName/,
  "top active Board card must render repository metadata from activeBoardSource"
);
assert.match(
  projectSource,
  /isGithubActiveBoardProject/,
  "dialog active markers should reuse the exact active-pair helper"
);
assert.match(
  projectDialogList,
  /activeBoardSource/,
  "dialog active markers must compare against the active source"
);
assert.match(
  projectDialogList,
  /selectedRepository\?\.id/,
  "dialog active markers must include the current browsing repository"
);
assert.doesNotMatch(
  projectDialogList,
  /project\.id === activeProjectV2Id/,
  "dialog active markers must not use the browsing ProjectV2 alone"
);

assert.doesNotMatch(
  repositorySearchBlock,
  /isActivating/,
  "repository search must remain enabled while activation is pending"
);
assert.doesNotMatch(
  previousPageButton,
  /isActivating/,
  "previous page control must remain enabled while activation is pending"
);
assert.doesNotMatch(
  nextPageButton,
  /isActivating/,
  "next page control must remain enabled while activation is pending"
);
assert.match(
  repositoryRowButton,
  /disabled=\{isRepositoryActivating \|\| !isWorkspaceOwner\}/,
  "only the row currently activating should be disabled by activation state"
);

console.log("active Board UI boundary tests passed");
