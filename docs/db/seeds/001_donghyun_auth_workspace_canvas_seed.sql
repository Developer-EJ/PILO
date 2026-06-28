-- Local development seed for Donghyun owned Auth / Workspace / Canvas data.
-- It intentionally does not insert Task, GitHub, Meeting, Review, or Agent
-- owner records. Canvas shapes point to external entity ids through
-- entity_type/entity_id, matching the public contract boundary.

WITH seed_user AS (
  INSERT INTO users (
    id,
    email,
    name,
    avatar_url,
    global_role,
    email_verified_at,
    last_login_at
  )
  VALUES (
    '11111111-1111-4111-8111-111111111111',
    'donghyun.local@pilo.dev',
    'Donghyun Local',
    NULL,
    'user',
    '2026-06-28T00:00:00Z',
    '2026-06-28T00:00:00Z'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    avatar_url = EXCLUDED.avatar_url,
    email_verified_at = EXCLUDED.email_verified_at,
    last_login_at = EXCLUDED.last_login_at,
    updated_at = now()
  RETURNING id
),
seed_oauth_account AS (
  INSERT INTO oauth_accounts (
    id,
    user_id,
    provider,
    provider_user_id,
    provider_email,
    scopes,
    token_type,
    token_expires_at
  )
  VALUES (
    '11111111-1111-4111-8111-111111111112',
    '11111111-1111-4111-8111-111111111111',
    'google',
    'google-local-donghyun',
    'donghyun.local@pilo.dev',
    ARRAY['openid', 'email', 'profile'],
    'Bearer',
    NULL
  )
  ON CONFLICT (provider, provider_user_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    provider_email = EXCLUDED.provider_email,
    scopes = EXCLUDED.scopes,
    token_type = EXCLUDED.token_type,
    token_expires_at = EXCLUDED.token_expires_at,
    updated_at = now()
  RETURNING id
),
seed_session AS (
  INSERT INTO auth_sessions (
    id,
    user_id,
    refresh_token_hash,
    token_hash_algorithm,
    secret_version,
    user_agent,
    ip_address,
    expires_at,
    revoked_at
  )
  VALUES (
    '11111111-1111-4111-8111-111111111113',
    '11111111-1111-4111-8111-111111111111',
    'local-seed-refresh-token-hash',
    'hmac-sha256',
    'local-seed',
    'PILO local seed',
    '127.0.0.1',
    '2027-06-28T00:00:00Z',
    NULL
  )
  ON CONFLICT (refresh_token_hash) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    token_hash_algorithm = EXCLUDED.token_hash_algorithm,
    secret_version = EXCLUDED.secret_version,
    user_agent = EXCLUDED.user_agent,
    ip_address = EXCLUDED.ip_address,
    expires_at = EXCLUDED.expires_at,
    revoked_at = EXCLUDED.revoked_at,
    updated_at = now()
  RETURNING id
),
seed_workspace AS (
  INSERT INTO workspaces (
    id,
    name,
    description,
    type,
    status,
    start_date,
    end_date,
    created_by_user_id
  )
  VALUES (
    '22222222-2222-4222-8222-222222222221',
    'PILO Local Workspace',
    'Local fixture workspace for Auth, Workspace, Dashboard, and Canvas development.',
    'side_project',
    'active',
    '2026-06-28',
    NULL,
    '11111111-1111-4111-8111-111111111111'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    type = EXCLUDED.type,
    status = EXCLUDED.status,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    created_by_user_id = EXCLUDED.created_by_user_id,
    updated_at = now()
  RETURNING id
),
seed_member AS (
  INSERT INTO workspace_members (
    id,
    workspace_id,
    user_id,
    role,
    display_name
  )
  VALUES (
    '22222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222221',
    '11111111-1111-4111-8111-111111111111',
    'owner',
    'Product / Canvas'
  )
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    display_name = EXCLUDED.display_name,
    updated_at = now()
  RETURNING id
),
seed_dashboard_preferences AS (
  INSERT INTO dashboard_preferences (
    id,
    workspace_id,
    member_id,
    layout,
    hidden_sections
  )
  VALUES (
    '22222222-2222-4222-8222-222222222223',
    '22222222-2222-4222-8222-222222222221',
    '22222222-2222-4222-8222-222222222222',
    '{"sections":["today","pullRequests","agentSuggestions","meetingDecisions"],"density":"comfortable"}'::jsonb,
    '[]'::jsonb
  )
  ON CONFLICT (workspace_id, member_id) DO UPDATE SET
    layout = EXCLUDED.layout,
    hidden_sections = EXCLUDED.hidden_sections,
    updated_at = now()
  RETURNING id
),
seed_canvas_board AS (
  INSERT INTO canvas_boards (
    id,
    workspace_id,
    title,
    board_type,
    created_by_member_id
  )
  VALUES (
    '33333333-3333-4333-8333-333333333331',
    '22222222-2222-4222-8222-222222222221',
    'PILO Project Map',
    'workspace',
    '22222222-2222-4222-8222-222222222222'
  )
  ON CONFLICT (id) DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id,
    title = EXCLUDED.title,
    board_type = EXCLUDED.board_type,
    created_by_member_id = EXCLUDED.created_by_member_id,
    updated_at = now()
  RETURNING id
),
seed_canvas_shapes AS (
  INSERT INTO canvas_shapes (
    id,
    canvas_board_id,
    shape_type,
    entity_type,
    entity_id,
    display_title,
    width,
    height,
    color,
    z_index,
    created_by_member_id
  )
  VALUES
    (
      '33333333-3333-4333-8333-333333333341',
      '33333333-3333-4333-8333-333333333331',
      'meeting_report',
      'meeting_report',
      '44444444-4444-4444-8444-444444444441',
      'Kickoff meeting report',
      320,
      180,
      '#7c6ee6',
      1,
      '22222222-2222-4222-8222-222222222222'
    ),
    (
      '33333333-3333-4333-8333-333333333342',
      '33333333-3333-4333-8333-333333333331',
      'task',
      'task',
      '44444444-4444-4444-8444-444444444442',
      'Implement workspace entry',
      300,
      160,
      '#38bdf8',
      2,
      '22222222-2222-4222-8222-222222222222'
    ),
    (
      '33333333-3333-4333-8333-333333333343',
      '33333333-3333-4333-8333-333333333331',
      'github_issue',
      'github_issue',
      '44444444-4444-4444-8444-444444444443',
      'GitHub issue #47',
      280,
      150,
      '#22c55e',
      3,
      '22222222-2222-4222-8222-222222222222'
    ),
    (
      '33333333-3333-4333-8333-333333333344',
      '33333333-3333-4333-8333-333333333331',
      'pull_request',
      'pull_request',
      '44444444-4444-4444-8444-444444444444',
      'PR #47 Login shell',
      300,
      160,
      '#f59e0b',
      4,
      '22222222-2222-4222-8222-222222222222'
    ),
    (
      '33333333-3333-4333-8333-333333333345',
      '33333333-3333-4333-8333-333333333331',
      'decision',
      'decision',
      '44444444-4444-4444-8444-444444444445',
      'Use workspace_members for permissions',
      340,
      150,
      '#ef4444',
      5,
      '22222222-2222-4222-8222-222222222222'
    ),
    (
      '33333333-3333-4333-8333-333333333346',
      '33333333-3333-4333-8333-333333333331',
      'document',
      'document',
      '44444444-4444-4444-8444-444444444446',
      'Auth / Workspace contract',
      300,
      150,
      '#64748b',
      6,
      '22222222-2222-4222-8222-222222222222'
    )
  ON CONFLICT (canvas_board_id, entity_type, entity_id) DO UPDATE SET
    shape_type = EXCLUDED.shape_type,
    display_title = EXCLUDED.display_title,
    width = EXCLUDED.width,
    height = EXCLUDED.height,
    color = EXCLUDED.color,
    z_index = EXCLUDED.z_index,
    created_by_member_id = EXCLUDED.created_by_member_id,
    updated_at = now()
  RETURNING id
)
INSERT INTO canvas_node_positions (
  canvas_shape_id,
  x,
  y
)
VALUES
  ('33333333-3333-4333-8333-333333333341', -420, -120),
  ('33333333-3333-4333-8333-333333333342', 0, -60),
  ('33333333-3333-4333-8333-333333333343', 400, -120),
  ('33333333-3333-4333-8333-333333333344', 400, 160),
  ('33333333-3333-4333-8333-333333333345', -20, 220),
  ('33333333-3333-4333-8333-333333333346', -440, 180)
ON CONFLICT (canvas_shape_id) DO UPDATE SET
  x = EXCLUDED.x,
  y = EXCLUDED.y,
  updated_at = now();

INSERT INTO canvas_connections (
  id,
  canvas_board_id,
  source_shape_id,
  target_shape_id,
  connection_type,
  label
)
VALUES
  (
    '33333333-3333-4333-8333-333333333351',
    '33333333-3333-4333-8333-333333333331',
    '33333333-3333-4333-8333-333333333341',
    '33333333-3333-4333-8333-333333333342',
    'created_from',
    'action item'
  ),
  (
    '33333333-3333-4333-8333-333333333352',
    '33333333-3333-4333-8333-333333333331',
    '33333333-3333-4333-8333-333333333342',
    '33333333-3333-4333-8333-333333333343',
    'implements',
    'tracked by'
  ),
  (
    '33333333-3333-4333-8333-333333333353',
    '33333333-3333-4333-8333-333333333331',
    '33333333-3333-4333-8333-333333333342',
    '33333333-3333-4333-8333-333333333344',
    'implements',
    'delivered by'
  ),
  (
    '33333333-3333-4333-8333-333333333354',
    '33333333-3333-4333-8333-333333333331',
    '33333333-3333-4333-8333-333333333346',
    '33333333-3333-4333-8333-333333333345',
    'references',
    'contract basis'
  )
ON CONFLICT (canvas_board_id, source_shape_id, target_shape_id, connection_type) DO UPDATE SET
  label = EXCLUDED.label;

INSERT INTO canvas_view_settings (
  canvas_board_id,
  member_id,
  zoom,
  viewport_x,
  viewport_y
)
VALUES (
  '33333333-3333-4333-8333-333333333331',
  '22222222-2222-4222-8222-222222222222',
  0.9,
  -80,
  -40
)
ON CONFLICT (canvas_board_id, member_id) DO UPDATE SET
  zoom = EXCLUDED.zoom,
  viewport_x = EXCLUDED.viewport_x,
  viewport_y = EXCLUDED.viewport_y,
  updated_at = now();

INSERT INTO canvas_filter_settings (
  canvas_board_id,
  member_id,
  enabled_entity_types,
  assignee_member_id,
  show_delayed_only,
  show_risk_only,
  filters
)
VALUES (
  '33333333-3333-4333-8333-333333333331',
  '22222222-2222-4222-8222-222222222222',
  ARRAY['task', 'meeting_report', 'pull_request', 'github_issue', 'document', 'decision'],
  NULL,
  false,
  false,
  '{"source":"local-seed","mode":"workspace-map"}'::jsonb
)
ON CONFLICT (canvas_board_id, member_id) DO UPDATE SET
  enabled_entity_types = EXCLUDED.enabled_entity_types,
  assignee_member_id = EXCLUDED.assignee_member_id,
  show_delayed_only = EXCLUDED.show_delayed_only,
  show_risk_only = EXCLUDED.show_risk_only,
  filters = EXCLUDED.filters,
  updated_at = now();
