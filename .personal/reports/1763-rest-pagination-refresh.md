# 1763 REST pagination token refresh

## RED

Command:

```powershell
cd apps/app-server
node scripts\github-integration\github-app-client.test.mjs
```

Output excerpt:

```text
AssertionError [ERR_ASSERTION]: installation repositories page 2 must start with refreshed T1
+ actual - expected

  [
    'Bearer rest-pagination-token-1',
    'Bearer rest-pagination-token-2',
+   'Bearer rest-pagination-token-1',
    'Bearer rest-pagination-token-2'
  ]
```

Interpretation: after first-page 401 recovery, the next REST page still starts with the stale T0 token instead of the refreshed T1 token.

## GREEN

Commands:

```powershell
cd apps/app-server
npm run build
node scripts\github-integration\github-app-client.test.mjs
npm run lint
npm run format:check
cd ..\..
git diff --check
git diff --name-only
```

Results:

```text
npm run build: exit 0
node scripts\github-integration\github-app-client.test.mjs: exit 0
npm run lint: exit 0
npm run format:check: exit 0
git diff --check: exit 0
git diff --name-only:
apps/app-server/scripts/github-integration/github-app-client.test.mjs
apps/app-server/src/modules/github-integration/github-app.client.ts
```

Implementation note: REST pagination now reuses one installation-token retry context per paginated operation, and `fetchJsonWithToken` updates that context when a 401 refresh succeeds. The next page therefore starts with the refreshed token instead of retrying from the stale token.
## Review

Fast reviewer result: no findings. Residual risk noted by reviewer: the new regression focuses on T1 success during pagination; T1 second-401/error mapping remains covered by the existing `fetchJsonWithToken` tests.

## Resume Verification

After interruption, verified preserved staged state and reran finite-timeout commands:

```text
git status --short: staged only the three owned files, no unstaged tracked changes
git diff --cached --name-only:
.personal/reports/1763-rest-pagination-refresh.md
apps/app-server/scripts/github-integration/github-app-client.test.mjs
apps/app-server/src/modules/github-integration/github-app.client.ts
npm run build: exit 0
node scripts\github-integration\github-app-client.test.mjs: exit 0
npm run lint: exit 0
npm run format:check: exit 0
git diff --check: exit 0
```
