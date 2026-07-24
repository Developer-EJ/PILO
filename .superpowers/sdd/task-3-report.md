# Task 3 Report: UI prop boundary and active rendering

## Summary

- Passed `activeBoardSource` from `GithubPanel` to `GithubConnectLayout` and then to `GithubConnectProject`.
- Removed the old UI active rendering path that treated browsing `selectedProjectV2Id` as active.
- Rendered the top active Board card from `activeBoardSource.project` and `activeBoardSource.repository`, before browsing repository empty states.
- Changed dialog `현재 Board` marking to use `isGithubActiveBoardProject` with active source, selected browsing repository, and row project id.
- Kept repository search and pagination enabled during activation; only the currently activating repository row is activation-disabled.

## Source Of Truth Check

`github-panel.tsx` owns `activeBoardSource` as the server-confirmed active Board source and passes it into layout. The Project UI active display now derives from that prop. `selectedProjectV2Id` remains a browsing/sync prop and is not passed as an active rendering prop.

## TDD

- RED: `node --experimental-strip-types src/features/github-integration/active-board-ui-boundary.test.mjs`
  - Failed on missing `activeBoardSource` panel-to-layout pass-through.
- Additional RED: same command failed on active-card render order while the card was still behind the browsing repository empty state.
- GREEN: same focused test passed after the prop boundary and render-order changes.

## Verification

- `node --experimental-strip-types src/features/github-integration/active-board-ui-boundary.test.mjs` -> passed
- `node --experimental-strip-types src/features/github-integration/active-board-browsing-separation.test.mjs` -> passed
- `node --experimental-strip-types src/features/github-integration/repository-default-board-activation.test.mjs` -> passed
- `node --experimental-strip-types src/features/github-integration/github-settings-redesign.test.mjs` -> passed
- `node --experimental-strip-types scripts/github-integration/test.mjs` -> passed
- `npm run lint` -> passed

## Review

Required read-only `fast_reviewer` completed with no findings. Residual risk noted by reviewer: static tests cover the boundary; browser-level manual QA of off-page active repository and activation-time browsing would add confidence.

## Scope

Changed only GitHub Integration UI and domain test files. No API, DB, app-server, or frontend common-area changes.
