CREATE TABLE IF NOT EXISTS pull_request_analyses (
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
  error_trace JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pull_request_analyses_risk_level_check CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT pull_request_analyses_status_check CHECK (analysis_status IN ('pending', 'running', 'succeeded', 'failed')),
  CONSTRAINT pull_request_analyses_counts_check CHECK (ok_count >= 0 AND discuss_count >= 0 AND risk_count >= 0),
  CONSTRAINT pull_request_analyses_pull_request_id_key UNIQUE (pull_request_id)
);

ALTER TABLE pull_request_analyses
  ADD COLUMN IF NOT EXISTS error_trace JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_pull_request_analyses_pr_id
  ON pull_request_analyses(pull_request_id);
