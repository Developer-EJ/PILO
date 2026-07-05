import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const controller = await readSource("../src/app.controller.ts");
const databaseService = await readSource("../src/database/database.service.ts");
const main = await readSource("../src/main.ts");
const service = await readSource("../src/app.service.ts");
const appModule = await readSource("../src/app.module.ts");
const authGuard = await readSource("../src/common/auth.guard.ts");
const sessionService = await readSource("../src/common/session.service.ts");
const calendarController = await readSource(
  "../src/modules/calendar/calendar.controller.ts"
);
const calendarModule = await readSource("../src/modules/calendar/calendar.module.ts");
const calendarService = await readSource("../src/modules/calendar/calendar.service.ts");
const prReviewController = await readSource(
  "../src/modules/pr-review/pr-review.controller.ts"
);
const prReviewGithubDependencyService = await readSource(
  "../src/modules/pr-review/pr-review-github-dependency.service.ts"
);
const prReviewModule = await readSource(
  "../src/modules/pr-review/pr-review.module.ts"
);
const prReviewService = await readSource(
  "../src/modules/pr-review/pr-review.service.ts"
);
const userController = await readSource("../src/modules/user/user.controller.ts");
const workspaceController = await readSource(
  "../src/modules/workspace/workspace.controller.ts"
);
const workspaceService = await readSource("../src/modules/workspace/workspace.service.ts");

assert.match(main, /setGlobalPrefix\("api\/v1"\)/);
assert.match(controller, /@Get\("health"\)/);
assert.match(service, /pilo-app-server/);
assert.match(service, /status: "ok"/);
assert.match(appModule, /UserModule/);
assert.match(appModule, /WorkspaceModule/);
assert.match(appModule, /CalendarModule/);
assert.match(appModule, /PrReviewModule/);
assert.match(calendarModule, /WorkspaceModule/);
assert.match(prReviewModule, /CommonModule/);
assert.match(prReviewModule, /DatabaseModule/);
assert.match(prReviewModule, /WorkspaceModule/);
assert.match(prReviewModule, /GithubIntegrationModule/);
assert.match(prReviewModule, /PrReviewController/);
assert.match(prReviewModule, /PrReviewService/);
assert.match(prReviewModule, /PrReviewGithubDependencyService/);
assert.match(prReviewController, /@Controller\("workspaces\/:workspaceId\/github"\)/);
assert.match(prReviewController, /@UseGuards\(AuthGuard\)/);
assert.match(prReviewController, /@Post\("pull-requests\/:pullRequestId\/review-sessions"\)/);
assert.match(prReviewController, /@Get\("review-sessions\/:reviewSessionId"\)/);
assert.match(prReviewController, /@Patch\("review-sessions\/:reviewSessionId"\)/);
assert.match(prReviewController, /@Delete\("review-sessions\/:reviewSessionId"\)/);
assert.match(prReviewController, /apiResponse/);
assert.match(prReviewGithubDependencyService, /GithubIntegrationService/);
assert.match(prReviewGithubDependencyService, /getCurrentUserGithubOAuthStatus/);
assert.match(prReviewGithubDependencyService, /getPullRequestDetail/);
assert.match(prReviewGithubDependencyService, /getPullRequestChangedFiles/);
assert.match(prReviewGithubDependencyService, /getPullRequestConflictStatus/);
assert.match(prReviewGithubDependencyService, /Deterministic PR Review stub/);
assert.match(prReviewGithubDependencyService, /createStubChangedFile/);
assert.match(prReviewGithubDependencyService, /checkedAt: "1970-01-01T00:00:00.000Z"/);
assert.match(prReviewService, /apiContract: "docs\/api\/pr-review-api.md"/);
assert.match(prReviewService, /assertWorkspaceAccess/);
assert.match(prReviewService, /github_pull_requests/);
assert.match(prReviewService, /pr_review_sessions/);
assert.match(prReviewService, /review_files/);
assert.match(prReviewService, /review_flows/);
assert.match(prReviewService, /review_flow_files/);
assert.match(prReviewService, /inFlightSessionCreations/);
assert.match(prReviewService, /transaction/);
assert.match(prReviewService, /Pull request not found in workspace/);
assert.match(prReviewService, /PR 변경 파일 리뷰/);
assert.match(databaseService, /DatabaseTransaction/);
assert.match(databaseService, /async transaction/);
assert.match(databaseService, /BEGIN/);
assert.match(databaseService, /COMMIT/);
assert.match(databaseService, /ROLLBACK/);
assert.match(calendarController, /@Controller\("workspaces\/:workspaceId\/calendar\/events"\)/);
assert.match(calendarController, /@UseGuards\(AuthGuard\)/);
assert.match(calendarController, /@Get\(\)/);
assert.match(calendarController, /@Get\(":eventId"\)/);
assert.match(calendarController, /@Post\(\)/);
assert.match(calendarController, /@Patch\(":eventId"\)/);
assert.match(calendarController, /@Delete\(":eventId"\)/);
assert.match(calendarService, /apiContract: "docs\/api\/calendar-api.md"/);
assert.match(calendarService, /assertWorkspaceAccess/);
assert.match(calendarService, /calendar_events/);
assert.match(calendarService, /createdByUser/);
assert.match(calendarService, /addOneHour/);
assert.match(calendarService, /const endTime = shouldNormalizeEndTime\s*\?\s*null/);
assert.match(userController, /@Controller\("me"\)/);
assert.match(userController, /@UseGuards\(AuthGuard\)/);
assert.match(authGuard, /SessionService/);
assert.doesNotMatch(authGuard, /UUID_PATTERN/);
assert.match(sessionService, /user_sessions/);
assert.match(sessionService, /token_hash = \$1/);
assert.match(sessionService, /revoked_at IS NULL/);
assert.match(sessionService, /expires_at > now\(\)/);
assert.match(workspaceController, /@Controller\("workspaces"\)/);
assert.match(workspaceController, /@Get\(\)/);
assert.match(workspaceController, /@Post\(\)/);
assert.match(workspaceController, /@Get\(":workspaceId"\)/);
assert.match(workspaceService, /WHERE owner_user_id = \$1/);
assert.match(workspaceService, /ORDER BY created_at ASC/);
assert.match(workspaceService, /assertWorkspaceAccess/);

await import("./calendar/test.mjs");
