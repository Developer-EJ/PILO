# GitHub Runtime Sync Contract v1

This note overrides the older `docs/contracts/github.md` deferred row for
repository sync. The source file currently contains mojibake, so this smaller
ASCII-only contract note records the current runtime behavior without rewriting
that damaged table.

## Current Runtime API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/workspaces/:workspaceId/github/repositories/sync` | Sync repositories and pull requests from an active GitHub App installation into the GitHub read model. |

## Preconditions

- The workspace caller must be a workspace member.
- At least one active `github_connections` row must exist for the workspace.
- Active means `provider = github_app`, `installationId` is present, and
  `revokedAt` is null.
- Missing provider env fails explicitly. Runtime must not fall back to fixtures.

## Required Provider Env

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`

`GITHUB_APP_PRIVATE_KEY` may contain escaped newlines (`\n`); app-server
normalizes them before signing the GitHub App JWT.

## Responses

Success response:

```json
{
  "syncedAt": "2026-06-30T00:00:00.000Z",
  "repositories": [],
  "pullRequests": []
}
```

No active GitHub App connection:

```txt
409 Conflict
Active GitHub App connection is required before repository sync
```

## Still Deferred

- `GET /api/pull-requests/:pullRequestId/changed-files`
- `POST /api/github/webhooks`
- GitHub pagination beyond the first `per_page=100` page
- stale repository/PR deletion or archival
