CREATE TABLE IF NOT EXISTS review_graphs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES pull_request_analyses(id) ON DELETE CASCADE,
  pull_request_id UUID REFERENCES pull_requests(id) ON DELETE CASCADE,
  summary TEXT,
  intent_summary TEXT NOT NULL DEFAULT '',
  review_strategy TEXT NOT NULL DEFAULT '',
  review_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_graphs_analysis_id_key UNIQUE (analysis_id)
);

CREATE TABLE IF NOT EXISTS review_nodes (
  id TEXT PRIMARY KEY,
  graph_id UUID NOT NULL REFERENCES review_graphs(id) ON DELETE CASCADE,
  node_type VARCHAR(30) NOT NULL,
  label VARCHAR(255) NOT NULL,
  file_path TEXT,
  function_name VARCHAR(255),
  risk_level VARCHAR(20) NOT NULL DEFAULT 'low',
  review_order INTEGER NOT NULL DEFAULT 1,
  role_summary TEXT NOT NULL DEFAULT '',
  review_reason TEXT NOT NULL DEFAULT '',
  position JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_nodes_type_check CHECK (node_type IN ('file', 'function', 'api', 'route', 'schema', 'config', 'risk', 'impact')),
  CONSTRAINT review_nodes_risk_level_check CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT review_nodes_review_order_check CHECK (review_order >= 1)
);

CREATE TABLE IF NOT EXISTS node_review_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id TEXT NOT NULL REFERENCES review_nodes(id) ON DELETE CASCADE,
  reviewer_member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'unknown',
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT node_review_states_status_check CHECK (status IN ('ok', 'discuss', 'unknown')),
  CONSTRAINT node_review_states_node_reviewer_key UNIQUE (node_id, reviewer_member_id)
);

CREATE INDEX IF NOT EXISTS idx_review_graphs_analysis_id
  ON review_graphs(analysis_id);

CREATE INDEX IF NOT EXISTS idx_review_nodes_graph_id
  ON review_nodes(graph_id);

CREATE INDEX IF NOT EXISTS idx_node_review_states_node_id
  ON node_review_states(node_id);
