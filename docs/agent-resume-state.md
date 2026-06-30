# Agent Resume State

Last updated: 2026-06-30
Branch: `codex/mvp-multiagent-snapshot`
Do not work on `dev` directly.

## User Request

The user wants PILO MVP work to continue through a safe multi-agent workflow.
If the desktop app is restarted and the user asks to restart or continue in
Korean, continue from this file plus the latest git log on this branch.

## Completed In Current Handoff Commit

- Added GitHub App repository/PR sync backend:
  `POST /api/workspaces/:workspaceId/github/repositories/sync`
- Added frontend GitHub sync client/button without silent fixture fallback.
- Added injectable STT provider boundary with local default and OpenAI provider.
- Added ai-worker HTTP endpoint:
  `POST /workflows/review/run`
- Hardened Review analysis fallback so API-mode failures do not look like
  fixture-backed success.
- Added `docs/contracts/github-runtime-sync-v1.md` because the older
  `docs/contracts/github.md` table still contains mojibake and an outdated
  deferred row for repository sync.

## Verification Already Run

- `apps/app-server`: `npm.cmd test` passed, 340 tests.
- `apps/app-server`: `npm.cmd run build` passed.
- `apps/app-server`: `npm.cmd run lint` passed.
- `apps/frontend`: `npm.cmd test` passed, 41 tests.
- `apps/frontend`: `npm.cmd run lint` passed.
- `apps/frontend`: `npm.cmd run build` passed.
- `apps/ai-worker`: `.\\.venv\\Scripts\\python.exe -m pytest tests/test_health.py tests/test_review_workflow.py` passed, 7 tests.
- `git diff --check` passed.

## Next P0 Work

1. Connect app-server Review analysis request to the ai-worker endpoint or a
   queue-backed worker path.
2. Feed real GitHub changed files/diff data into Review changed-files storage.
3. Verify GitHub sync against real `GITHUB_APP_ID`,
   `GITHUB_APP_PRIVATE_KEY`, and an installation.
4. Verify OpenAI STT with `PILO_STT_PROVIDER=openai` and `OPENAI_API_KEY`.
5. Decide whether GitHub pagination and stale repo/PR cleanup are required for
   MVP or can remain a known limitation.

## Known Limitations

- GitHub sync handles the first `per_page=100` page only.
- GitHub sync does not delete or mark stale repositories/PRs.
- Review analysis still creates a pending root; app-server does not yet call
  ai-worker automatically.
- ai-worker endpoint is deterministic, not OpenAI-backed.
- STT defaults to local text unless OpenAI mode and key are configured.
