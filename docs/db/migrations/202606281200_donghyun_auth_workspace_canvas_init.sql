CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Donghyun owned Auth / Workspace / Canvas baseline.
-- This migration is idempotent so it can be applied after the local full schema
-- or against an empty development database for isolated owner work.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  avatar_url TEXT,
  global_role VARCHAR(20) NOT NULL DEFAULT 'user',
  email_verified_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT users_global_role_check CHECK (global_role IN ('user', 'admin'))
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  provider_email CITEXT,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  token_type VARCHAR(80),
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT oauth_accounts_provider_check CHECK (provider IN ('google', 'github')),
  UNIQUE (user_id, provider),
  UNIQUE (provider, provider_user_id)
);

ALTER TABLE IF EXISTS oauth_accounts
  ADD COLUMN IF NOT EXISTS token_type VARCHAR(80);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  token_hash_algorithm VARCHAR(40) NOT NULL DEFAULT 'hmac-sha256',
  secret_version VARCHAR(80) NOT NULL DEFAULT 'v1',
  user_agent TEXT,
  ip_address INET,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS auth_sessions
  ADD COLUMN IF NOT EXISTS token_hash_algorithm VARCHAR(40) NOT NULL DEFAULT 'hmac-sha256',
  ADD COLUMN IF NOT EXISTS secret_version VARCHAR(80) NOT NULL DEFAULT 'v1';

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  description TEXT,
  type VARCHAR(40) NOT NULL DEFAULT 'other',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT workspaces_type_check CHECK (type IN ('side_project', 'bootcamp', 'university', 'hackathon', 'other')),
  CONSTRAINT workspaces_status_check CHECK (status IN ('active', 'archived')),
  CONSTRAINT workspaces_date_range_check CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  display_name VARCHAR(120),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_members_role_check CHECK (role IN ('owner', 'member', 'viewer')),
  UNIQUE (workspace_id, user_id),
  UNIQUE (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email CITEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  token_hash TEXT NOT NULL UNIQUE,
  invited_by_member_id UUID NOT NULL,
  accepted_by_member_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_invites_role_check CHECK (role IN ('member', 'viewer')),
  CONSTRAINT workspace_invites_invited_by_member_fk FOREIGN KEY (workspace_id, invited_by_member_id) REFERENCES workspace_members(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT workspace_invites_accepted_by_member_fk FOREIGN KEY (workspace_id, accepted_by_member_id) REFERENCES workspace_members(workspace_id, id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_invites_active_email
  ON workspace_invites(workspace_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS dashboard_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id UUID NOT NULL,
  layout JSONB NOT NULL DEFAULT '{}'::jsonb,
  hidden_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dashboard_preferences_member_fk FOREIGN KEY (workspace_id, member_id) REFERENCES workspace_members(workspace_id, id) ON DELETE CASCADE,
  UNIQUE (workspace_id, member_id)
);

CREATE TABLE IF NOT EXISTS canvas_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  board_type VARCHAR(80) NOT NULL DEFAULT 'workspace',
  created_by_member_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT canvas_boards_created_by_member_fk FOREIGN KEY (workspace_id, created_by_member_id) REFERENCES workspace_members(workspace_id, id) ON DELETE SET NULL,
  UNIQUE (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS canvas_shapes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_board_id UUID NOT NULL REFERENCES canvas_boards(id) ON DELETE CASCADE,
  shape_type VARCHAR(30) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id UUID NOT NULL,
  display_title VARCHAR(220) NOT NULL,
  width NUMERIC(10, 2) NOT NULL DEFAULT 280,
  height NUMERIC(10, 2) NOT NULL DEFAULT 160,
  color VARCHAR(40),
  is_collapsed BOOLEAN NOT NULL DEFAULT false,
  z_index INTEGER NOT NULL DEFAULT 0,
  created_by_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT canvas_shapes_type_check CHECK (shape_type IN ('task', 'meeting_report', 'pull_request', 'github_issue', 'document', 'file', 'code', 'decision', 'risk')),
  CONSTRAINT canvas_shapes_entity_type_check CHECK (entity_type IN ('task', 'meeting_report', 'pull_request', 'github_issue', 'document', 'file', 'code', 'decision', 'risk')),
  UNIQUE (canvas_board_id, id),
  UNIQUE (canvas_board_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS canvas_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_board_id UUID NOT NULL REFERENCES canvas_boards(id) ON DELETE CASCADE,
  source_shape_id UUID NOT NULL,
  target_shape_id UUID NOT NULL,
  connection_type VARCHAR(30) NOT NULL DEFAULT 'related_to',
  label VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT canvas_connections_type_check CHECK (connection_type IN ('related_to', 'created_from', 'blocks', 'references', 'implements', 'reviews')),
  CONSTRAINT canvas_connections_not_self_check CHECK (source_shape_id <> target_shape_id),
  CONSTRAINT canvas_connections_source_same_board_fk FOREIGN KEY (canvas_board_id, source_shape_id) REFERENCES canvas_shapes(canvas_board_id, id) ON DELETE CASCADE,
  CONSTRAINT canvas_connections_target_same_board_fk FOREIGN KEY (canvas_board_id, target_shape_id) REFERENCES canvas_shapes(canvas_board_id, id) ON DELETE CASCADE,
  UNIQUE (canvas_board_id, source_shape_id, target_shape_id, connection_type)
);

CREATE TABLE IF NOT EXISTS canvas_node_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_shape_id UUID NOT NULL REFERENCES canvas_shapes(id) ON DELETE CASCADE,
  x NUMERIC(12, 2) NOT NULL DEFAULT 0,
  y NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (canvas_shape_id)
);

CREATE TABLE IF NOT EXISTS canvas_view_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_board_id UUID NOT NULL REFERENCES canvas_boards(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id UUID NOT NULL,
  zoom NUMERIC(5, 2) NOT NULL DEFAULT 1,
  viewport_x NUMERIC(12, 2) NOT NULL DEFAULT 0,
  viewport_y NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT canvas_view_settings_zoom_check CHECK (zoom > 0),
  CONSTRAINT canvas_view_settings_board_workspace_fk FOREIGN KEY (workspace_id, canvas_board_id) REFERENCES canvas_boards(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT canvas_view_settings_member_fk FOREIGN KEY (workspace_id, member_id) REFERENCES workspace_members(workspace_id, id) ON DELETE CASCADE,
  UNIQUE (workspace_id, canvas_board_id, member_id)
);

CREATE TABLE IF NOT EXISTS canvas_filter_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_board_id UUID NOT NULL REFERENCES canvas_boards(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id UUID NOT NULL,
  enabled_entity_types TEXT[] NOT NULL DEFAULT '{}',
  assignee_member_id UUID,
  show_delayed_only BOOLEAN NOT NULL DEFAULT false,
  show_risk_only BOOLEAN NOT NULL DEFAULT false,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT canvas_filter_settings_board_workspace_fk FOREIGN KEY (workspace_id, canvas_board_id) REFERENCES canvas_boards(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT canvas_filter_settings_member_fk FOREIGN KEY (workspace_id, member_id) REFERENCES workspace_members(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT canvas_filter_settings_assignee_member_fk FOREIGN KEY (workspace_id, assignee_member_id) REFERENCES workspace_members(workspace_id, id) ON DELETE SET NULL,
  UNIQUE (workspace_id, canvas_board_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_canvas_boards_workspace_id ON canvas_boards(workspace_id);
CREATE INDEX IF NOT EXISTS idx_canvas_shapes_board_id ON canvas_shapes(canvas_board_id);
CREATE INDEX IF NOT EXISTS idx_canvas_shapes_entity ON canvas_shapes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_canvas_connections_board_id ON canvas_connections(canvas_board_id);
CREATE INDEX IF NOT EXISTS idx_canvas_node_positions_shape_id ON canvas_node_positions(canvas_shape_id);
CREATE INDEX IF NOT EXISTS idx_canvas_view_settings_board_member ON canvas_view_settings(canvas_board_id, member_id);
CREATE INDEX IF NOT EXISTS idx_canvas_filter_settings_board_member ON canvas_filter_settings(canvas_board_id, member_id);
