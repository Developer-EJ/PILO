-- Local development seed for Juhyung owned GitHub read data.
-- It depends on the workspace/member created by 001_donghyun_auth_workspace_canvas_seed.sql.
-- The seed keeps reviewable PR source data available in API mode without
-- inserting Task or Code Review owner records.

WITH seed_workspace AS (
  SELECT id
  FROM workspaces
  WHERE id = '22222222-2222-4222-8222-222222222222'::uuid
),
seed_member AS (
  SELECT id, workspace_id
  FROM workspace_members
  WHERE id = '33333333-3333-4333-8333-333333333331'::uuid
    AND workspace_id = '22222222-2222-4222-8222-222222222222'::uuid
),
seed_connection AS (
  INSERT INTO github_connections (
    id,
    workspace_id,
    provider,
    installation_id,
    github_account_login,
    scopes,
    state_nonce,
    connected_by_member_id,
    connected_at,
    revoked_at
  )
  SELECT
    '55555555-5555-4555-8555-555555555500'::uuid,
    seed_workspace.id,
    'github_app',
    'local-installation-555501',
    'example',
    ARRAY['contents:read', 'issues:write', 'pull_requests:read'],
    NULL,
    seed_member.id,
    '2026-06-27T10:00:00Z',
    NULL
  FROM seed_workspace
  JOIN seed_member ON seed_member.workspace_id = seed_workspace.id
  ON CONFLICT (id) DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id,
    provider = EXCLUDED.provider,
    installation_id = EXCLUDED.installation_id,
    github_account_login = EXCLUDED.github_account_login,
    scopes = EXCLUDED.scopes,
    state_nonce = EXCLUDED.state_nonce,
    connected_by_member_id = EXCLUDED.connected_by_member_id,
    connected_at = EXCLUDED.connected_at,
    revoked_at = EXCLUDED.revoked_at,
    updated_at = now()
  RETURNING id, workspace_id, installation_id
),
seed_repository AS (
  INSERT INTO github_repositories (
    id,
    workspace_id,
    github_connection_id,
    owner,
    repo_name,
    url,
    installation_id,
    default_branch
  )
  SELECT
    '55555555-5555-4555-8555-555555555501'::uuid,
    seed_connection.workspace_id,
    seed_connection.id,
    'example',
    'pilo',
    'https://github.com/example/pilo',
    seed_connection.installation_id,
    'dev'
  FROM seed_connection
  ON CONFLICT (workspace_id, owner, repo_name) DO UPDATE SET
    github_connection_id = EXCLUDED.github_connection_id,
    url = EXCLUDED.url,
    installation_id = EXCLUDED.installation_id,
    default_branch = EXCLUDED.default_branch,
    updated_at = now()
  RETURNING id
),
seed_issue AS (
  INSERT INTO github_issues (
    id,
    repository_id,
    number,
    title,
    state,
    url,
    synced_at
  )
  SELECT
    '55555555-5555-4555-8555-555555555551'::uuid,
    seed_repository.id,
    12,
    'OAuth callback route',
    'open',
    'https://github.com/example/pilo/issues/12',
    '2026-06-27T10:00:00Z'
  FROM seed_repository
  ON CONFLICT (repository_id, number) DO UPDATE SET
    title = EXCLUDED.title,
    state = EXCLUDED.state,
    url = EXCLUDED.url,
    synced_at = EXCLUDED.synced_at,
    updated_at = now()
  RETURNING id
),
seed_issue_labels AS (
  INSERT INTO github_issue_labels (
    issue_id,
    name
  )
  SELECT
    seed_issue.id,
    label.name
  FROM seed_issue
  CROSS JOIN (
    VALUES
      ('auth'),
      ('frontend')
  ) AS label(name)
  ON CONFLICT (issue_id, name) DO NOTHING
  RETURNING id
),
seed_pull_request AS (
  INSERT INTO pull_requests (
    id,
    repository_id,
    number,
    title,
    author_login,
    state,
    branch,
    base_branch,
    url,
    changed_files_count,
    additions,
    deletions,
    opened_at,
    synced_at
  )
  SELECT
    '66666666-6666-4666-8666-666666666661'::uuid,
    seed_repository.id,
    7,
    'Add OAuth callback shell',
    'Developer-EJ',
    'review_requested',
    'feature/donghyun/auth-login',
    'dev',
    'https://github.com/example/pilo/pull/7',
    4,
    180,
    12,
    '2026-06-27T09:30:00Z',
    '2026-06-27T10:00:00Z'
  FROM seed_repository
  ON CONFLICT (repository_id, number) DO UPDATE SET
    title = EXCLUDED.title,
    author_login = EXCLUDED.author_login,
    state = EXCLUDED.state,
    branch = EXCLUDED.branch,
    base_branch = EXCLUDED.base_branch,
    url = EXCLUDED.url,
    changed_files_count = EXCLUDED.changed_files_count,
    additions = EXCLUDED.additions,
    deletions = EXCLUDED.deletions,
    opened_at = EXCLUDED.opened_at,
    synced_at = EXCLUDED.synced_at,
    updated_at = now()
  RETURNING id
)
SELECT
  seed_connection.id AS github_connection_id,
  seed_repository.id AS github_repository_id,
  seed_issue.id AS github_issue_id,
  (SELECT count(*) FROM seed_issue_labels) AS github_issue_label_count,
  seed_pull_request.id AS pull_request_id
FROM seed_connection
CROSS JOIN seed_repository
CROSS JOIN seed_issue
CROSS JOIN seed_pull_request
LIMIT 1;
