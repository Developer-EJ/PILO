CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================
-- PILO Final Hybrid Schema
-- Base: pilo-core-schema.sql
-- Added/changed: PILO CanvasBoard/CanvasShape/CanvasConnection,
-- PR review graph, common system tables, planning ownership.
-- ============================================================

-- ============================================================
-- 동현. Auth / Workspace
-- ============================================================

CREATE TABLE users (
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

CREATE TABLE oauth_accounts (
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

CREATE TABLE auth_sessions (
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

CREATE TABLE workspaces (
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

CREATE TABLE workspace_members (
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

CREATE TABLE workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email CITEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  token_hash TEXT NOT NULL UNIQUE,
  invited_by_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
  accepted_by_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_invites_role_check CHECK (role IN ('member', 'viewer'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_invites_active_email
  ON workspace_invites(workspace_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE dashboard_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
  layout JSONB NOT NULL DEFAULT '{}'::jsonb,
  hidden_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, member_id)
);

-- ============================================================
-- 주형. Task / GitHub / Progress
-- ============================================================

CREATE TABLE milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title VARCHAR(220) NOT NULL,
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT milestones_status_check CHECK (status IN ('planned', 'in_progress', 'done')),
  CONSTRAINT milestones_date_range_check CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  title VARCHAR(240) NOT NULL,
  description TEXT,
  assignee_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'todo',
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  due_date DATE,
  created_by_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT tasks_status_check CHECK (status IN ('todo', 'in_progress', 'in_review', 'done', 'blocked')),
  CONSTRAINT tasks_priority_check CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
);

CREATE TABLE task_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title VARCHAR(240) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'todo',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT task_checklist_items_status_check CHECK (status IN ('todo', 'done', 'skipped')),
  UNIQUE (task_id, sort_order)
);

CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE task_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  before_value JSONB,
  after_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT task_dependencies_not_self_check CHECK (task_id <> depends_on_task_id),
  UNIQUE (task_id, depends_on_task_id)
);

CREATE TABLE github_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL DEFAULT 'github_app',
  installation_id VARCHAR(255),
  github_account_login VARCHAR(255),
  scopes TEXT[] NOT NULL DEFAULT '{}',
  state_nonce VARCHAR(128) UNIQUE,
  connected_by_member_id UUID,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT github_connections_connected_by_member_fk FOREIGN KEY (workspace_id, connected_by_member_id) REFERENCES workspace_members(workspace_id, id),
  CONSTRAINT github_connections_provider_check CHECK (provider IN ('github_app', 'oauth'))
);

CREATE UNIQUE INDEX github_connections_active_installation_id_unique
  ON github_connections (installation_id)
  WHERE installation_id IS NOT NULL AND revoked_at IS NULL;

CREATE TABLE github_repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  github_connection_id UUID REFERENCES github_connections(id) ON DELETE SET NULL,
  owner VARCHAR(255) NOT NULL,
  repo_name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  installation_id VARCHAR(255),
  default_branch VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, owner, repo_name)
);

CREATE TABLE github_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES github_repositories(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title VARCHAR(300) NOT NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'open',
  url TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT github_issues_state_check CHECK (state IN ('open', 'closed')),
  UNIQUE (repository_id, number)
);

CREATE TABLE github_issue_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES github_issues(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (issue_id, name)
);

CREATE TABLE task_github_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  issue_id UUID NOT NULL REFERENCES github_issues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, issue_id)
);

CREATE TABLE pull_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES github_repositories(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title VARCHAR(300) NOT NULL,
  author_login VARCHAR(255),
  state VARCHAR(30) NOT NULL DEFAULT 'open',
  branch VARCHAR(255),
  base_branch VARCHAR(255),
  url TEXT NOT NULL,
  changed_files_count INTEGER NOT NULL DEFAULT 0,
  additions INTEGER NOT NULL DEFAULT 0,
  deletions INTEGER NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ,
  merged_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pull_requests_state_check CHECK (state IN ('open', 'review_requested', 'changes_requested', 'merged', 'closed')),
  UNIQUE (repository_id, number)
);

CREATE TABLE task_pull_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  pull_request_id UUID NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, pull_request_id)
);

CREATE TABLE progress_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  total_tasks INTEGER NOT NULL DEFAULT 0,
  done_tasks INTEGER NOT NULL DEFAULT 0,
  blocked_tasks INTEGER NOT NULL DEFAULT 0,
  review_tasks INTEGER NOT NULL DEFAULT 0,
  delayed_tasks INTEGER NOT NULL DEFAULT 0,
  progress_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT progress_snapshots_counts_check CHECK (
    total_tasks >= 0
    AND done_tasks >= 0
    AND blocked_tasks >= 0
    AND review_tasks >= 0
    AND delayed_tasks >= 0
    AND progress_rate >= 0
    AND progress_rate <= 100
  )
);

-- ============================================================
-- 동현. Canvas
-- ============================================================

CREATE TABLE canvas_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  board_type VARCHAR(80) NOT NULL DEFAULT 'workspace',
  created_by_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE canvas_shapes (
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
  UNIQUE (canvas_board_id, id),
  UNIQUE (canvas_board_id, entity_type, entity_id)
);

CREATE TABLE canvas_connections (
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

CREATE TABLE canvas_node_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_shape_id UUID NOT NULL REFERENCES canvas_shapes(id) ON DELETE CASCADE,
  x NUMERIC(12, 2) NOT NULL DEFAULT 0,
  y NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (canvas_shape_id)
);

CREATE TABLE canvas_view_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_board_id UUID NOT NULL REFERENCES canvas_boards(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
  zoom NUMERIC(5, 2) NOT NULL DEFAULT 1,
  viewport_x NUMERIC(12, 2) NOT NULL DEFAULT 0,
  viewport_y NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT canvas_view_settings_zoom_check CHECK (zoom > 0),
  UNIQUE (canvas_board_id, member_id)
);

CREATE TABLE canvas_filter_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_board_id UUID NOT NULL REFERENCES canvas_boards(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
  enabled_entity_types TEXT[] NOT NULL DEFAULT '{}',
  assignee_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  show_delayed_only BOOLEAN NOT NULL DEFAULT false,
  show_risk_only BOOLEAN NOT NULL DEFAULT false,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (canvas_board_id, member_id)
);

-- ============================================================
-- 진호. Meeting / Voice / Report
-- ============================================================

CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  canvas_board_id UUID REFERENCES canvas_boards(id) ON DELETE SET NULL,
  title VARCHAR(220) NOT NULL,
  purpose TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_by_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meetings_status_check CHECK (status IN ('scheduled', 'in_progress', 'ended', 'report_generated')),
  CONSTRAINT meetings_time_range_check CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
  role VARCHAR(80),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  CONSTRAINT meeting_participants_time_range_check CHECK (left_at IS NULL OR left_at >= joined_at),
  UNIQUE (meeting_id, member_id)
);

CREATE TABLE meeting_agendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  title VARCHAR(240) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meeting_agendas_status_check CHECK (status IN ('open', 'done', 'skipped')),
  UNIQUE (meeting_id, sort_order)
);

CREATE TABLE meeting_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  author_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE voice_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  livekit_room_name VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT voice_rooms_status_check CHECK (status IN ('active', 'inactive', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_rooms_livekit_room_name
  ON voice_rooms(livekit_room_name)
  WHERE livekit_room_name IS NOT NULL;

CREATE TABLE voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_room_id UUID NOT NULL REFERENCES voice_rooms(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  recording_status VARCHAR(30) NOT NULL DEFAULT 'not_recording',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT voice_sessions_recording_status_check CHECK (recording_status IN ('not_recording', 'recording', 'processing', 'completed', 'failed')),
  CONSTRAINT voice_sessions_time_range_check CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  speaker_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'text',
  body TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT transcript_segments_source_check CHECK (source IN ('text', 'stt')),
  CONSTRAINT transcript_segments_time_range_check CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE meeting_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  created_by_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meeting_id)
);

CREATE TABLE meeting_report_open_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES meeting_reports(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_id, sort_order)
);

CREATE TABLE meeting_report_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES meeting_reports(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meeting_report_risks_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  UNIQUE (report_id, sort_order)
);

CREATE TABLE meeting_report_next_agendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES meeting_reports(id) ON DELETE CASCADE,
  title VARCHAR(240) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_id, sort_order)
);

CREATE TABLE meeting_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES meeting_reports(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'decided',
  linked_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meeting_decisions_status_check CHECK (status IN ('decided', 'pending', 'reopened'))
);

CREATE TABLE meeting_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES meeting_reports(id) ON DELETE CASCADE,
  title VARCHAR(240) NOT NULL,
  description TEXT,
  assignee_suggestion_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  due_date_suggestion DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  converted_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meeting_action_items_status_check CHECK (status IN ('draft', 'approved', 'converted', 'rejected'))
);

-- ============================================================
-- 은재. Code Review / PR Analysis
-- ============================================================

CREATE TABLE code_review_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  pull_request_id UUID NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_by_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT code_review_rooms_status_check CHECK (status IN ('open', 'reviewing', 'completed', 'archived')),
  UNIQUE (pull_request_id)
);

CREATE TABLE pull_request_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pull_request_id UUID NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  purpose_summary TEXT,
  impact_summary TEXT,
  test_recommendation TEXT,
  risk_level VARCHAR(20) NOT NULL DEFAULT 'low',
  analysis_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ok_count INTEGER NOT NULL DEFAULT 0,
  discuss_count INTEGER NOT NULL DEFAULT 0,
  risk_count INTEGER NOT NULL DEFAULT 0,
  conclusion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pull_request_analyses_risk_level_check CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT pull_request_analyses_status_check CHECK (analysis_status IN ('pending', 'running', 'succeeded', 'failed')),
  CONSTRAINT pull_request_analyses_counts_check CHECK (ok_count >= 0 AND discuss_count >= 0 AND risk_count >= 0),
  UNIQUE (pull_request_id)
);

CREATE TABLE review_graphs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES pull_request_analyses(id) ON DELETE CASCADE,
  summary TEXT,
  review_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (analysis_id)
);

CREATE TABLE changed_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES pull_request_analyses(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  change_type VARCHAR(20) NOT NULL,
  additions INTEGER NOT NULL DEFAULT 0,
  deletions INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT changed_files_change_type_check CHECK (change_type IN ('added', 'modified', 'deleted', 'renamed')),
  CONSTRAINT changed_files_counts_check CHECK (additions >= 0 AND deletions >= 0),
  UNIQUE (analysis_id, file_path)
);

CREATE TABLE changed_functions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_file_id UUID NOT NULL REFERENCES changed_files(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  change_type VARCHAR(20) NOT NULL,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT changed_functions_change_type_check CHECK (change_type IN ('added', 'modified', 'deleted'))
);

CREATE TABLE review_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_id UUID NOT NULL REFERENCES review_graphs(id) ON DELETE CASCADE,
  changed_file_id UUID REFERENCES changed_files(id) ON DELETE SET NULL,
  changed_function_id UUID REFERENCES changed_functions(id) ON DELETE SET NULL,
  node_type VARCHAR(30) NOT NULL,
  label VARCHAR(255) NOT NULL,
  file_path TEXT,
  symbol VARCHAR(255),
  role TEXT,
  reason TEXT,
  risk_level VARCHAR(20) NOT NULL DEFAULT 'low',
  position JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_nodes_type_check CHECK (node_type IN ('file', 'function', 'api', 'route', 'schema', 'config', 'risk', 'impact')),
  CONSTRAINT review_nodes_risk_level_check CHECK (risk_level IN ('low', 'medium', 'high', 'critical'))
);

CREATE TABLE node_review_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES review_nodes(id) ON DELETE CASCADE,
  reviewer_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'unknown',
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT node_review_states_status_check CHECK (status IN ('ok', 'discuss', 'unknown')),
  UNIQUE (node_id, reviewer_member_id)
);

CREATE TABLE review_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES code_review_rooms(id) ON DELETE CASCADE,
  author_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  node_id UUID REFERENCES review_nodes(id) ON DELETE SET NULL,
  changed_file_id UUID REFERENCES changed_files(id) ON DELETE SET NULL,
  changed_function_id UUID REFERENCES changed_functions(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE review_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES pull_request_analyses(id) ON DELETE CASCADE,
  node_id UUID REFERENCES review_nodes(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_questions_priority_check CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
);

CREATE TABLE review_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES pull_request_analyses(id) ON DELETE CASCADE,
  node_id UUID REFERENCES review_nodes(id) ON DELETE SET NULL,
  type VARCHAR(100) NOT NULL,
  level VARCHAR(20) NOT NULL DEFAULT 'medium',
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_risks_level_check CHECK (level IN ('low', 'medium', 'high', 'critical'))
);

CREATE TABLE review_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES pull_request_analyses(id) ON DELETE CASCADE,
  checklist_type VARCHAR(20) NOT NULL DEFAULT 'review',
  title VARCHAR(240) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'todo',
  checked_by_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  checked_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_checklist_items_type_check CHECK (checklist_type IN ('review', 'merge')),
  CONSTRAINT review_checklist_items_status_check CHECK (status IN ('todo', 'done', 'skipped')),
  UNIQUE (analysis_id, checklist_type, sort_order)
);

-- ============================================================
-- 세인. Agent / Planning
-- ============================================================

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  domain VARCHAR(40) NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agents_domain_check CHECK (domain IN ('task', 'github', 'meeting', 'review', 'planning', 'orchestrator'))
);

CREATE TABLE agent_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type VARCHAR(120) NOT NULL,
  version VARCHAR(40) NOT NULL DEFAULT 'v1',
  input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, type, version)
);

CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES agent_workflows(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  actor_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_runs_status_check CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'requires_confirmation')),
  CONSTRAINT agent_runs_time_range_check CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at)
);

CREATE TABLE agent_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_name VARCHAR(160) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_run_steps_status_check CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  CONSTRAINT agent_run_steps_time_range_check CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at)
);

CREATE TABLE agent_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  context_type VARCHAR(40) NOT NULL,
  ref_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_contexts_type_check CHECK (context_type IN ('workspace', 'task', 'meeting_report', 'pull_request', 'review_analysis', 'freeform'))
);

CREATE TABLE agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  type VARCHAR(80) NOT NULL,
  source VARCHAR(40) NOT NULL,
  requires_confirmation BOOLEAN NOT NULL DEFAULT true,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  confirmed_by_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_actions_type_check CHECK (type IN (
    'task.create.draft',
    'task.update.status',
    'github.issue.create',
    'meeting.report.generate',
    'review.analysis.generate',
    'planning.approve'
  )),
  CONSTRAINT agent_actions_source_check CHECK (source IN ('meeting', 'task', 'github', 'review', 'planning', 'orchestrator')),
  CONSTRAINT agent_actions_status_check CHECK (status IN ('draft', 'waiting_confirmation', 'confirmed', 'executed', 'rejected', 'failed'))
);

CREATE TABLE agent_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_id UUID REFERENCES agent_run_steps(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE project_plan_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  goal TEXT,
  target_user TEXT,
  problem TEXT,
  duration TEXT,
  output_goal TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_by_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT project_plan_drafts_status_check CHECK (status IN ('draft', 'reviewing', 'approved', 'rejected'))
);

CREATE TABLE team_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
  experience_tags TEXT[] NOT NULL DEFAULT '{}',
  preferred_role VARCHAR(100),
  available_time VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_member_id)
);

CREATE TABLE plan_tech_stack_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_plan_draft_id UUID NOT NULL REFERENCES project_plan_drafts(id) ON DELETE CASCADE,
  frontend TEXT,
  backend TEXT,
  database_name TEXT,
  ai TEXT,
  deploy TEXT,
  reason TEXT,
  difficulty VARCHAR(80),
  alternatives JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_plan_draft_id)
);

CREATE TABLE plan_feature_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_plan_draft_id UUID NOT NULL REFERENCES project_plan_drafts(id) ON DELETE CASCADE,
  title VARCHAR(220) NOT NULL,
  description TEXT,
  scope VARCHAR(20) NOT NULL DEFAULT 'mvp',
  reason TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_feature_drafts_scope_check CHECK (scope IN ('mvp', 'should', 'could', 'excluded')),
  UNIQUE (project_plan_draft_id, sort_order)
);

CREATE TABLE role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
  role_name VARCHAR(120) NOT NULL,
  assigned_by_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE plan_role_assignment_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_plan_draft_id UUID NOT NULL REFERENCES project_plan_drafts(id) ON DELETE CASCADE,
  member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  suggested_role VARCHAR(120) NOT NULL,
  reason TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_plan_draft_id, sort_order)
);

CREATE TABLE plan_milestone_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_plan_draft_id UUID NOT NULL REFERENCES project_plan_drafts(id) ON DELETE CASCADE,
  title VARCHAR(220) NOT NULL,
  start_date DATE,
  end_date DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_milestone_drafts_date_range_check CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  UNIQUE (project_plan_draft_id, sort_order)
);

CREATE TABLE plan_risk_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_plan_draft_id UUID NOT NULL REFERENCES project_plan_drafts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_risk_notes_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  UNIQUE (project_plan_draft_id, sort_order)
);

-- ============================================================
-- Common / System
-- ============================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(240) NOT NULL,
  linked_entity_type VARCHAR(80),
  linked_entity_id UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'unread',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notifications_status_check CHECK (status IN ('unread', 'read'))
);

CREATE TABLE shared_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(80),
  url TEXT NOT NULL,
  linked_entity_type VARCHAR(80),
  linked_entity_id UUID,
  uploaded_by_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(120) NOT NULL,
  target_type VARCHAR(80) NOT NULL,
  target_id UUID,
  before_value JSONB,
  after_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes for common reads
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status ON tasks(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON tasks(assignee_member_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_github_repositories_workspace_id ON github_repositories(workspace_id);
CREATE INDEX IF NOT EXISTS idx_github_issues_repository_id ON github_issues(repository_id);
CREATE INDEX IF NOT EXISTS idx_pull_requests_repository_state ON pull_requests(repository_id, state);
CREATE INDEX IF NOT EXISTS idx_canvas_boards_workspace_id ON canvas_boards(workspace_id);
CREATE INDEX IF NOT EXISTS idx_canvas_shapes_board_id ON canvas_shapes(canvas_board_id);
CREATE INDEX IF NOT EXISTS idx_canvas_shapes_entity ON canvas_shapes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_canvas_connections_board_id ON canvas_connections(canvas_board_id);
CREATE INDEX IF NOT EXISTS idx_canvas_node_positions_shape_id ON canvas_node_positions(canvas_shape_id);
CREATE INDEX IF NOT EXISTS idx_canvas_view_settings_board_member ON canvas_view_settings(canvas_board_id, member_id);
CREATE INDEX IF NOT EXISTS idx_canvas_filter_settings_board_member ON canvas_filter_settings(canvas_board_id, member_id);
CREATE INDEX IF NOT EXISTS idx_meetings_workspace_status ON meetings(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_meeting_id ON transcript_segments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_reports_meeting_id ON meeting_reports(meeting_id);
CREATE INDEX IF NOT EXISTS idx_code_review_rooms_workspace_id ON code_review_rooms(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pull_request_analyses_pr_id ON pull_request_analyses(pull_request_id);
CREATE INDEX IF NOT EXISTS idx_review_graphs_analysis_id ON review_graphs(analysis_id);
CREATE INDEX IF NOT EXISTS idx_review_nodes_graph_id ON review_nodes(graph_id);
CREATE INDEX IF NOT EXISTS idx_changed_files_analysis_id ON changed_files(analysis_id);
CREATE INDEX IF NOT EXISTS idx_review_comments_room_id ON review_comments(room_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_status ON agent_runs(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_actions_run_status ON agent_actions(run_id, status);
CREATE INDEX IF NOT EXISTS idx_project_plan_drafts_workspace_id ON project_plan_drafts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_files_workspace_id ON shared_files(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
