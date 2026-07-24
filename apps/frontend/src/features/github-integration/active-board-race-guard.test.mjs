import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const selectionModule = await import(
  new URL("./utils/github-project-selection.ts", import.meta.url)
);
let revisionModule = null;
let revisionImportError = null;
try {
  revisionModule = await import(
    new URL("./utils/github-active-board-revision.ts", import.meta.url)
  );
} catch (error) {
  revisionImportError = error;
}
const panel = await readFile(
  new URL("./components/github-panel.tsx", import.meta.url),
  "utf8"
);

assert.equal(
  typeof selectionModule.shouldApplyGithubBrowsingResult,
  "function",
  "GitHub browsing result attribution must live in a tested pure helper"
);
assert.equal(
  selectionModule.shouldApplyGithubBrowsingResult({
    currentRepositoryId: "repository-a",
    requestedRepositoryId: "repository-a"
  }),
  true,
  "a repository A result may update repository A browsing state"
);
assert.equal(
  selectionModule.shouldApplyGithubBrowsingResult({
    currentRepositoryId: "repository-b",
    requestedRepositoryId: "repository-a"
  }),
  false,
  "a repository A result must not update repository B browsing state"
);
assert.equal(
  typeof selectionModule.shouldApplyGithubWorkspaceResult,
  "function",
  "GitHub workspace result attribution must live in a tested pure helper"
);
assert.equal(
  selectionModule.shouldApplyGithubWorkspaceResult({
    currentWorkspaceId: "workspace-a",
    requestedWorkspaceId: "workspace-a",
    responseWorkspaceId: "workspace-a"
  }),
  true,
  "a workspace A result may update workspace A state"
);
assert.equal(
  selectionModule.shouldApplyGithubWorkspaceResult({
    currentWorkspaceId: "workspace-b",
    requestedWorkspaceId: "workspace-a",
    responseWorkspaceId: "workspace-a"
  }),
  false,
  "a workspace A result must not update workspace B state"
);
assert.equal(
  selectionModule.shouldApplyGithubWorkspaceResult({
    currentWorkspaceId: "workspace-a",
    requestedWorkspaceId: "workspace-a",
    responseWorkspaceId: "workspace-b"
  }),
  false,
  "a workspace B response must not update a workspace A request"
);
assert.equal(
  typeof selectionModule.getWorkspaceScopedGithubActiveBoardSource,
  "function",
  "visible active Board source must live in a tested pure helper"
);
{
  const source = {
    workspaceId: "workspace-a",
    repository: { id: "repository-a" },
    project: { id: "project-a" }
  };
  assert.equal(
    selectionModule.getWorkspaceScopedGithubActiveBoardSource({
      activeBoardSource: source,
      workspaceId: "workspace-a"
    }),
    source,
    "an active Board source from the current workspace must remain visible"
  );
  assert.equal(
    selectionModule.getWorkspaceScopedGithubActiveBoardSource({
      activeBoardSource: source,
      workspaceId: "workspace-b"
    }),
    null,
    "an active Board source from an old workspace must not remain visible"
  );
}
assert.equal(
  typeof selectionModule.shouldApplyGithubRepositoryRequestResult,
  "function",
  "repository request attribution must live in a tested pure helper"
);
assert.equal(
  selectionModule.shouldApplyGithubRepositoryRequestResult({
    currentWorkspaceId: "workspace-a",
    requestedWorkspaceId: "workspace-a",
    currentRepositoryId: "repository-a",
    requestedRepositoryId: "repository-a"
  }),
  true,
  "a repository request may write UI state only in the original workspace and repository"
);
assert.equal(
  selectionModule.shouldApplyGithubRepositoryRequestResult({
    currentWorkspaceId: "workspace-b",
    requestedWorkspaceId: "workspace-a",
    currentRepositoryId: "repository-a",
    requestedRepositoryId: "repository-a"
  }),
  false,
  "a repository request from an old workspace must not write current UI state"
);
assert.equal(
  selectionModule.shouldApplyGithubRepositoryRequestResult({
    currentWorkspaceId: "workspace-a",
    requestedWorkspaceId: "workspace-a",
    currentRepositoryId: "repository-b",
    requestedRepositoryId: "repository-a"
  }),
  false,
  "a repository request from an old repository must not write current UI state"
);

assert.equal(
  revisionImportError,
  null,
  "active Board revision guard module must exist"
);
assert.equal(
  typeof revisionModule?.createGithubActiveBoardRevisionGuard,
  "function",
  "active Board revision guard must expose a tested factory"
);
{
  const revisionGuard = revisionModule.createGithubActiveBoardRevisionGuard();
  const staleSnapshotRevision = revisionGuard.captureSnapshot();
  revisionGuard.recordActivation();
  assert.equal(
    revisionGuard.isSnapshotCurrent(staleSnapshotRevision),
    false,
    "a snapshot captured before a successful activation must not apply active source"
  );
  const freshSnapshotRevision = revisionGuard.captureSnapshot();
  assert.equal(
    revisionGuard.isSnapshotCurrent(freshSnapshotRevision),
    true,
    "a snapshot captured after the latest activation may apply active source"
  );
}

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

const activateProjectStart = panel.indexOf(
  "async function handleActivateProjectV2"
);
const startSyncStart = panel.indexOf(
  "async function handleStartGithubSyncRun",
  activateProjectStart
);
assert.ok(activateProjectStart >= 0 && startSyncStart > activateProjectStart);
const activateProjectHandler = panel.slice(activateProjectStart, startSyncStart);

const snapshotLoaderStart = panel.indexOf(
  "async function loadGithubIntegrationSnapshot"
);
const refreshStart = panel.indexOf(
  "function handleRefreshGithubIntegration",
  snapshotLoaderStart
);
assert.ok(snapshotLoaderStart >= 0 && refreshStart > snapshotLoaderStart);
const snapshotLoader = panel.slice(snapshotLoaderStart, refreshStart);

const applyActivatedStart = panel.indexOf(
  "function applyActivatedGithubBoardSource"
);
assert.ok(
  applyActivatedStart >= 0,
  "successful Board activation must use one shared apply boundary"
);
const applyActivatedEnd = panel.indexOf(
  "async function handleSelectRepository",
  applyActivatedStart
);
assert.ok(applyActivatedEnd > applyActivatedStart);
const applyActivatedBoardSource = panel.slice(
  applyActivatedStart,
  applyActivatedEnd
);

assert.match(
  selectRepositoryHandler,
  /shouldApplyGithubBrowsingResult\(\{[\s\S]{0,160}currentRepositoryId: browsingRepositoryIdRef\.current,[\s\S]{0,160}requestedRepositoryId: repositoryId/,
  "default activation must attribute async browsing writes to the requested repository"
);
assert.match(
  selectRepositoryHandler,
  /if \([\s\S]{0,220}currentWorkspaceIdRef\.current === requestedWorkspaceId[\s\S]{0,260}shouldApplyGithubBrowsingResult\([\s\S]{0,260}setBrowsingProjectV2Id\(source\.projectV2Id\)/,
  "default activation must write browsing ProjectV2 only when the requested repository is still being browsed"
);
assert.match(
  selectRepositoryHandler,
  /if \(shouldApplyGithubBrowsingResult\([\s\S]{0,360}projects,[\s\S]{0,80}projectsTotal: projects\.length/,
  "default activation must write discovered ProjectV2 snapshot only when the requested repository is still being browsed"
);
assert.match(
  selectRepositoryHandler,
  /applyActivatedGithubBoardSource\(\s*activatedSource,\s*requestedWorkspaceId\s*\)/,
  "default activation success must still update the active Board source even after browsing moved elsewhere"
);
assert.match(
  selectRepositoryHandler,
  /const requestedWorkspaceId = workspaceId[\s\S]{0,1800}activateWorkspaceBoardSource\(\s*requestedWorkspaceId/,
  "default activation must capture the requested workspace and use it for the PUT"
);
assert.match(
  selectRepositoryHandler,
  /snapshotRequestGateRef\.current\.invalidate\(\)[\s\S]{0,1800}activateWorkspaceBoardSource/,
  "default activation must invalidate pre-existing snapshot requests before the PUT"
);
assert.doesNotMatch(
  selectRepositoryHandler.match(/catch \(error\) \{[\s\S]*?\n    \}/)?.[0] ?? "",
  /applyActivatedGithubBoardSource|setActiveBoardSource/,
  "failed default activation must not apply a new active Board source"
);
assert.match(
  activateProjectHandler,
  /const requestedWorkspaceId = workspaceId[\s\S]{0,700}activateWorkspaceBoardSource\(\s*requestedWorkspaceId,/,
  "manual activation must capture the requested workspace and use it for the PUT"
);
assert.match(
  activateProjectHandler,
  /applyActivatedGithubBoardSource\(\s*activatedSource,\s*requestedWorkspaceId\s*\)/,
  "manual activation success must use the shared active Board apply boundary"
);
assert.match(
  activateProjectHandler,
  /snapshotRequestGateRef\.current\.invalidate\(\)[\s\S]{0,1800}activateWorkspaceBoardSource/,
  "manual activation must invalidate pre-existing snapshot requests before the PUT"
);
assert.doesNotMatch(
  activateProjectHandler.match(/catch \(error\) \{[\s\S]*?\n    \}/)?.[0] ?? "",
  /applyActivatedGithubBoardSource|setActiveBoardSource/,
  "failed manual activation must not apply a new active Board source"
);
assert.match(
  applyActivatedBoardSource,
  /requestedWorkspaceId: string/,
  "active Board apply boundary must receive the requested workspace"
);
assert.match(
  applyActivatedBoardSource,
  /shouldApplyGithubWorkspaceResult\(\{[\s\S]{0,260}currentWorkspaceId: currentWorkspaceIdRef\.current,[\s\S]{0,260}requestedWorkspaceId,[\s\S]{0,260}responseWorkspaceId: activatedSource\.workspaceId/,
  "active Board apply boundary must attribute the result before recording revision"
);
assert.ok(
  applyActivatedBoardSource.indexOf("shouldApplyGithubWorkspaceResult") >= 0 &&
    applyActivatedBoardSource.indexOf("shouldApplyGithubWorkspaceResult") <
      applyActivatedBoardSource.indexOf("activeBoardRevisionGuardRef.current.recordActivation()"),
  "active Board apply boundary must guard workspace before recording revision"
);
assert.match(
  applyActivatedBoardSource,
  /activeBoardRevisionGuardRef\.current\.recordActivation\(\)[\s\S]{0,160}setActiveBoardSource\(activatedSource\)[\s\S]{0,80}return true/,
  "successful PUT responses must record active Board revision before setting active Board source"
);
assert.doesNotMatch(
  applyActivatedBoardSource,
  /snapshotRequestGateRef\.current\.invalidate\(\)/,
  "successful PUT responses must not invalidate the whole snapshot loader gate"
);
assert.match(
  selectRepositoryHandler,
  /const didApplyActivatedSource = applyActivatedGithubBoardSource\(\s*activatedSource,\s*requestedWorkspaceId\s*\)[\s\S]{0,120}if \(!didApplyActivatedSource\) \{[\s\S]{0,80}return;/,
  "stale default activation success must return before writing current workspace UI"
);
assert.match(
  activateProjectHandler,
  /const didApplyActivatedSource = applyActivatedGithubBoardSource\(\s*activatedSource,\s*requestedWorkspaceId\s*\)[\s\S]{0,120}if \(!didApplyActivatedSource\) \{[\s\S]{0,80}return;/,
  "stale manual activation success must return before writing current workspace UI"
);
assert.match(
  selectRepositoryHandler.match(/catch \(error\) \{[\s\S]*?\n    \}/)?.[0] ?? "",
  /shouldApplyGithubRepositoryRequestResult\(\{[\s\S]{0,260}currentWorkspaceId: currentWorkspaceIdRef\.current,[\s\S]{0,260}requestedWorkspaceId,[\s\S]{0,260}currentRepositoryId: browsingRepositoryIdRef\.current,[\s\S]{0,260}requestedRepositoryId: repositoryId/,
  "old workspace or repository default activation failure must not write actionError into the current browsing context"
);
assert.match(
  activateProjectHandler.match(/catch \(error\) \{[\s\S]*?\n    \}/)?.[0] ?? "",
  /if \(currentWorkspaceIdRef\.current === requestedWorkspaceId\) \{[\s\S]{0,120}setActionError\(getErrorMessage\(error\)\)/,
  "old workspace manual activation failure must not write actionError into the current workspace"
);
assert.doesNotMatch(
  snapshotLoader.match(/catch \(error\) \{[\s\S]*?\n    \}/)?.[0] ?? "",
  /setActiveBoardSource\(null\)/,
  "snapshot load failures must not clear the previously confirmed active Board source"
);
assert.match(
  snapshotLoader,
  /if \(!workspaceId\) \{[\s\S]*?setActiveBoardSource\(null\)/,
  "workspace reset must still clear active Board source as a scoped reset"
);
assert.match(
  snapshotLoader,
  /const activeBoardSnapshotRevision =\s*activeBoardRevisionGuardRef\.current\.captureSnapshot\(\)/,
  "snapshot loading must capture the active Board revision at request start"
);
assert.match(
  snapshotLoader,
  /if \(\s*activeBoardRevisionGuardRef\.current\.isSnapshotCurrent\(\s*activeBoardSnapshotRevision\s*\)\s*\) \{[\s\S]{0,160}setActiveBoardSource\(activeBoardSource\)/,
  "successful snapshot GETs may apply active Board source only when its active revision is current"
);
assert.match(
  snapshotLoader,
  /setSnapshot\(\(current\) => \(\{[\s\S]*?setPanelStatus\("ready"\)/,
  "stale active source must not prevent the snapshot loader from applying list state and reaching ready"
);
assert.match(
  panel,
  /const visibleActiveBoardSource = getWorkspaceScopedGithubActiveBoardSource\(\{[\s\S]{0,160}activeBoardSource,[\s\S]{0,160}workspaceId/,
  "the rendered active Board source must be scoped to the current workspace"
);
assert.match(
  panel,
  /activeBoardSource=\{visibleActiveBoardSource\}/,
  "the layout must receive the workspace-scoped visible active Board source"
);

console.log("active Board race guard tests passed");
