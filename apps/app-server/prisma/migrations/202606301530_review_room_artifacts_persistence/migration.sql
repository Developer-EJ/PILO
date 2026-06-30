CREATE TABLE IF NOT EXISTS code_review_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  pull_request_id UUID NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_by_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT code_review_rooms_status_check CHECK (status IN ('open', 'reviewing', 'completed', 'archived')),
  CONSTRAINT code_review_rooms_pull_request_id_key UNIQUE (pull_request_id)
);

CREATE TABLE IF NOT EXISTS review_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES code_review_rooms(id) ON DELETE CASCADE,
  author_member_id UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
  node_id TEXT REFERENCES review_nodes(id) ON DELETE SET NULL,
  changed_file_id UUID REFERENCES changed_files(id) ON DELETE SET NULL,
  changed_function_id UUID REFERENCES changed_functions(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_checklist_items (
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
  CONSTRAINT review_checklist_items_analysis_slot_key UNIQUE (analysis_id, checklist_type, sort_order)
);

CREATE UNIQUE INDEX IF NOT EXISTS code_review_rooms_pull_request_id_key
  ON code_review_rooms(pull_request_id);

CREATE UNIQUE INDEX IF NOT EXISTS review_checklist_items_analysis_slot_key
  ON review_checklist_items(analysis_id, checklist_type, sort_order);

CREATE INDEX IF NOT EXISTS idx_code_review_rooms_workspace_id
  ON code_review_rooms(workspace_id);

CREATE INDEX IF NOT EXISTS idx_review_comments_room_id
  ON review_comments(room_id);

CREATE INDEX IF NOT EXISTS idx_review_checklist_items_analysis_id
  ON review_checklist_items(analysis_id);
