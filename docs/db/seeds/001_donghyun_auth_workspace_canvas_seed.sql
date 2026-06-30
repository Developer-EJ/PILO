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
  SELECT
    '11111111-1111-4111-8111-111111111112',
    seed_user.id,
    'google',
    'google-local-donghyun',
    'donghyun.local@pilo.dev',
    ARRAY['openid', 'email', 'profile'],
    'Bearer',
    NULL
  FROM seed_user
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
  SELECT
    '11111111-1111-4111-8111-111111111113',
    seed_user.id,
    'local-seed-refresh-token-hash',
    'hmac-sha256',
    'local-seed',
    'PILO local seed',
    '127.0.0.1',
    '2027-06-28T00:00:00Z',
    NULL
  FROM seed_user
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
  SELECT
    '22222222-2222-4222-8222-222222222222',
    'PILO MVP',
    'AI-powered project collaboration workspace',
    'side_project',
    'active',
    '2026-06-28',
    NULL,
    seed_user.id
  FROM seed_user
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
  SELECT
    '33333333-3333-4333-8333-333333333331',
    seed_workspace.id,
    seed_user.id,
    'owner',
    'Workspace / Canvas'
  FROM seed_workspace
  CROSS JOIN seed_user
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    display_name = EXCLUDED.display_name,
    updated_at = now()
  RETURNING id, workspace_id
),
seed_dashboard_preferences AS (
  INSERT INTO dashboard_preferences (
    id,
    workspace_id,
    member_id,
    layout,
    hidden_sections
  )
  SELECT
    '22222222-2222-4222-8222-222222222223',
    seed_member.workspace_id,
    seed_member.id,
    '{"sections":["today","pullRequests","agentSuggestions","meetingDecisions"],"density":"comfortable"}'::jsonb,
    '[]'::jsonb
  FROM seed_member
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
  SELECT
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    seed_member.workspace_id,
    'Project Map',
    'project_map',
    seed_member.id
  FROM seed_member
  ON CONFLICT (id) DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id,
    title = EXCLUDED.title,
    board_type = EXCLUDED.board_type,
    created_by_member_id = EXCLUDED.created_by_member_id,
    updated_at = now()
  RETURNING id, workspace_id
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
  SELECT
    shape.id,
    seed_canvas_board.id,
    shape.shape_type,
    shape.entity_type,
    shape.entity_id,
    shape.display_title,
    shape.width,
    shape.height,
    shape.color,
    shape.z_index,
    seed_member.id
  FROM seed_canvas_board
  JOIN seed_member ON seed_member.workspace_id = seed_canvas_board.workspace_id
  CROSS JOIN (
    VALUES
      (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid,
        'task',
        'task',
        '44444444-4444-4444-8444-444444444441'::uuid,
        'Google/GitHub login flow',
        280,
        160,
        '#6d5bd6',
        1
      ),
      (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid,
        'pull_request',
        'pull_request',
        '66666666-6666-4666-8666-666666666661'::uuid,
        'PR #42 Code Review',
        300,
        172,
        '#2e9e5b',
        2
      )
  ) AS shape(id, shape_type, entity_type, entity_id, display_title, width, height, color, z_index)
  ON CONFLICT (canvas_board_id, entity_type, entity_id) DO UPDATE SET
    shape_type = EXCLUDED.shape_type,
    display_title = EXCLUDED.display_title,
    width = EXCLUDED.width,
    height = EXCLUDED.height,
    color = EXCLUDED.color,
    z_index = EXCLUDED.z_index,
    created_by_member_id = EXCLUDED.created_by_member_id,
    updated_at = now()
  RETURNING id, canvas_board_id, entity_type
),
seed_canvas_node_positions AS (
  INSERT INTO canvas_node_positions (
    canvas_shape_id,
    x,
    y
  )
  SELECT
    seed_canvas_shapes.id,
    position.x,
    position.y
  FROM seed_canvas_shapes
  JOIN (
    VALUES
      ('task', 120, 140),
      ('pull_request', 520, 220)
  ) AS position(entity_type, x, y)
    ON position.entity_type = seed_canvas_shapes.entity_type
  ON CONFLICT (canvas_shape_id) DO UPDATE SET
    x = EXCLUDED.x,
    y = EXCLUDED.y,
    updated_at = now()
  RETURNING id
),
seed_canvas_connections AS (
  INSERT INTO canvas_connections (
    id,
    canvas_board_id,
    source_shape_id,
    target_shape_id,
    connection_type,
    label
  )
  SELECT
    connection.id,
    seed_canvas_board.id,
    source_shape.id,
    target_shape.id,
    connection.connection_type,
    connection.label
  FROM seed_canvas_board
  JOIN (
    VALUES
      (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'::uuid,
        'task',
        'pull_request',
        'implemented_by',
        'Task to PR'
      )
  ) AS connection(id, source_entity_type, target_entity_type, connection_type, label)
    ON true
  JOIN seed_canvas_shapes AS source_shape
    ON source_shape.entity_type = connection.source_entity_type
  JOIN seed_canvas_shapes AS target_shape
    ON target_shape.entity_type = connection.target_entity_type
  ON CONFLICT (canvas_board_id, source_shape_id, target_shape_id, connection_type) DO UPDATE SET
    label = EXCLUDED.label
  RETURNING id
),
seed_canvas_view_settings AS (
  INSERT INTO canvas_view_settings (
    canvas_board_id,
    workspace_id,
    member_id,
    zoom,
    viewport_x,
    viewport_y
  )
  SELECT
    seed_canvas_board.id,
    seed_canvas_board.workspace_id,
    seed_member.id,
    1,
    0,
    0
  FROM seed_canvas_board
  JOIN seed_member ON seed_member.workspace_id = seed_canvas_board.workspace_id
  ON CONFLICT (workspace_id, canvas_board_id, member_id) DO UPDATE SET
    zoom = EXCLUDED.zoom,
    viewport_x = EXCLUDED.viewport_x,
    viewport_y = EXCLUDED.viewport_y,
    updated_at = now()
  RETURNING id
),
seed_canvas_filter_settings AS (
  INSERT INTO canvas_filter_settings (
    canvas_board_id,
    workspace_id,
    member_id,
    enabled_entity_types,
    assignee_member_id,
    show_delayed_only,
    show_risk_only,
    filters
  )
  SELECT
    seed_canvas_board.id,
    seed_canvas_board.workspace_id,
    seed_member.id,
    ARRAY['task', 'meeting_report', 'pull_request'],
    NULL,
    false,
    false,
    '{}'::jsonb
  FROM seed_canvas_board
  JOIN seed_member ON seed_member.workspace_id = seed_canvas_board.workspace_id
  ON CONFLICT (workspace_id, canvas_board_id, member_id) DO UPDATE SET
    enabled_entity_types = EXCLUDED.enabled_entity_types,
    assignee_member_id = EXCLUDED.assignee_member_id,
    show_delayed_only = EXCLUDED.show_delayed_only,
    show_risk_only = EXCLUDED.show_risk_only,
    filters = EXCLUDED.filters,
    updated_at = now()
  RETURNING id
)
SELECT
  seed_oauth_account.id AS oauth_account_id,
  seed_session.id AS auth_session_id,
  seed_dashboard_preferences.id AS dashboard_preferences_id,
  seed_canvas_node_positions.id AS first_node_position_id,
  seed_canvas_connections.id AS first_connection_id,
  seed_canvas_view_settings.id AS view_settings_id,
  seed_canvas_filter_settings.id AS filter_settings_id
FROM seed_oauth_account
CROSS JOIN seed_session
CROSS JOIN seed_dashboard_preferences
CROSS JOIN seed_canvas_node_positions
CROSS JOIN seed_canvas_connections
CROSS JOIN seed_canvas_view_settings
CROSS JOIN seed_canvas_filter_settings
LIMIT 1;
