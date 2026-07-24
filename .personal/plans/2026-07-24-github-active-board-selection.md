# GitHub Active Board Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate the GitHub settings browsing repository/ProjectV2 pair from the server-confirmed active Board source.

**Architecture:** `GithubPanel` owns a browsing pair and `GithubActiveBoardSource | null` independently. Pure selection helpers cover default browsing, exact active-pair comparison, and default activation results; layout and project components receive explicit browsing and active props.

**Tech Stack:** TypeScript 6, React 19, Next.js 16, Node.js assert-based domain tests

## Global Constraints

- Base: `dev`; branch: `fix/1757-github-active-board-selection`.
- New tests live under `apps/frontend/src/features/github-integration/`.
- Do not change API contracts, DB schema, App Server, or Frontend common areas.
- Preserve #1743 default ProjectV2 activation after repository selection.
- While activation is pending, allow browsing another repository but do not start a second automatic activation.
- Source/full sync must not mutate browsing or active state.
- Run each new test in RED before production edits, then rerun it in GREEN.

## File Map

- Create `apps/frontend/src/features/github-integration/active-board-browsing-separation.test.mjs`.
- Modify `utils/github-project-selection.ts` for pure browsing/active helpers.
- Modify `api/client.ts` so active PUT returns `GithubActiveBoardSource`.
- Modify `components/github-panel.tsx` for state ownership and async transitions.
- Modify `components/github-connect-layout.tsx` for prop boundaries.
- Modify `components/github-connect-project.tsx` for active-source rendering.
- Modify `components/github-connect-repositories.tsx` to permit browsing during activation.
- Update related tests in the same feature directory and the GitHub Integration domain aggregator.

---

### Task 1: Selection helpers and API client type

**Files:**
- Create: `apps/frontend/src/features/github-integration/active-board-browsing-separation.test.mjs`
- Modify: `apps/frontend/src/features/github-integration/utils/github-project-selection.ts`
- Modify: `apps/frontend/src/features/github-integration/api/client.ts`

**Interfaces:**
- Produces `resolveGithubBrowsingSelection(input): GithubBoardSelection`.
- Produces `isGithubActiveBoardProject(input): boolean`.
- Produces `activateDefaultGithubBoardForRepository(input): Promise<GithubActiveBoardSource | null>`.

- [ ] **Step 1: Write failing utility tests**

```js
const {
  activateDefaultGithubBoardForRepository,
  isGithubActiveBoardProject,
  resolveGithubBrowsingSelection
} = await import(new URL("./utils/github-project-selection.ts", import.meta.url));

assert.deepEqual(resolveGithubBrowsingSelection({
  repositories: [{ id: "repo-active" }],
  projects: [{ id: "project-active", repositoryIds: ["repo-active"] }],
  activeBoardSource
}), { repositoryId: "repo-active", projectV2Id: "project-active" });

assert.deepEqual(resolveGithubBrowsingSelection({
  repositories: [{ id: "repo-active" }],
  projects: [{ id: "project-active", repositoryIds: ["repo-active"] }],
  activeBoardSource,
  preferredRepositoryId: "",
  preferredProjectV2Id: ""
}), { repositoryId: "", projectV2Id: "" });

assert.equal(isGithubActiveBoardProject({
  activeBoardSource,
  repositoryId: "repo-active",
  projectV2Id: "project-active"
}), true);

const result = await activateDefaultGithubBoardForRepository({
  projects: [{ id: "project-next", repositoryIds: ["repo-next"] }],
  repositoryId: "repo-next",
  activate: async () => nextActiveBoardSource
});
assert.deepEqual(result, nextActiveBoardSource);
```

- [ ] **Step 2: Verify RED**

Run: `cd apps/frontend && node --experimental-strip-types src/features/github-integration/active-board-browsing-separation.test.mjs`

Expected: FAIL because the browsing resolver and exact active-pair helper do not exist.

- [ ] **Step 3: Implement the minimal helper boundary**

```ts
export type GithubBoardSelection = {
  repositoryId: string;
  projectV2Id: string;
};

export function isGithubActiveBoardProject({
  activeBoardSource,
  repositoryId,
  projectV2Id
}: ActiveBoardProjectInput): boolean {
  return activeBoardSource?.repository.id === repositoryId &&
    activeBoardSource.project.id === projectV2Id;
}

export async function activateDefaultGithubBoardForRepository(
  input: ActivateDefaultGithubBoardInput
): Promise<GithubActiveBoardSource | null> {
  const projectV2Id = selectProjectV2IdForRepository(input);
  if (!projectV2Id) return null;
  return input.activate({ repositoryId: input.repositoryId, projectV2Id });
}
```

Rename the existing active resolver to `resolveGithubBrowsingSelection`. Change the active PUT client generic to `GithubActiveBoardSource`.

- [ ] **Step 4: Verify GREEN**

Run the new test again; expected PASS.

- [ ] **Step 5: Commit Task 1 using the repository convention and `(#1757)` suffix**

---

### Task 2: Panel browsing/active state and async race

**Files:**
- Modify: `components/github-panel.tsx`
- Modify: `active-board-selection-persistence.test.mjs`
- Modify: `repository-default-board-activation.test.mjs`
- Modify: `repository-scoped-sync.test.mjs`
- Modify: `project-v2-selection.test.mjs`
- Modify: `github-manual-sync.test.mjs`
- Modify: `active-board-browsing-separation.test.mjs`

**Interfaces:**
- Consumes Task 1 helpers.
- Produces independent `activeBoardSource`, `browsingRepositoryId`, and `browsingProjectV2Id` state.

- [ ] **Step 1: Add failing panel-source assertions**

```js
assert.match(panel, /useState<GithubActiveBoardSource \| null>\(null\)/);
assert.match(panel, /const \[browsingRepositoryId,/);
assert.match(panel, /const \[browsingProjectV2Id,/);
assert.match(snapshotLoader, /setActiveBoardSource\(activeBoardSource\)/);
assert.match(repositoryHandler, /setBrowsingRepositoryId\(repositoryId\)/);
assert.match(repositoryHandler, /setBrowsingProjectV2Id\(nextProjectV2Id\)/);
assert.match(repositoryHandler, /setActiveBoardSource\(activatedSource\)/);
assert.match(manualActivationHandler, /const requestedRepositoryId = browsingRepositoryId/);
assert.match(manualActivationHandler, /setActiveBoardSource\(activatedSource\)/);
assert.match(syncHandler, /body\.repositoryId = browsingRepositoryId/);
assert.match(syncHandler, /body\.projectV2Id = browsingProjectV2Id/);
assert.doesNotMatch(syncHandler, /setActiveBoardSource|setBrowsingRepositoryId|setBrowsingProjectV2Id/);
```

- [ ] **Step 2: Verify RED**

Run the new test plus `active-board-selection-persistence.test.mjs`; expected FAIL on the single selected state.

- [ ] **Step 3: Implement minimal panel transitions**

```ts
const [activeBoardSource, setActiveBoardSource] =
  useState<GithubActiveBoardSource | null>(null);
const [browsingRepositoryId, setBrowsingRepositoryId] = useState("");
const [browsingProjectV2Id, setBrowsingProjectV2Id] = useState("");
const browsingRepositoryIdRef = useRef("");
const browsingProjectV2IdRef = useRef("");
```

The snapshot GET always updates `activeBoardSource`. It uses active as the browsing default only on first workspace entry; explicit empty/preserved refs win on search, paging, and refresh.

Repository selection commits browsing repository/projects before automatic PUT. If the activation lock is already held, it stops after browsing. A successful automatic or manual PUT stores only the returned active source. A failure leaves active state untouched. Manual activation captures the requested repository before `await` and never overwrites later browsing.

- [ ] **Step 4: Verify GREEN**

Run the new test and the five updated domain tests listed in Files; expected PASS.

- [ ] **Step 5: Commit Task 2 using the repository convention and `(#1757)` suffix**

---

### Task 3: UI prop boundary and active rendering

**Files:**
- Modify: `components/github-connect-layout.tsx`
- Modify: `components/github-connect-project.tsx`
- Modify: `components/github-connect-repositories.tsx`
- Modify: `github-settings-redesign.test.mjs`
- Modify: `repository-default-board-activation.test.mjs`
- Modify: `active-board-browsing-separation.test.mjs`
