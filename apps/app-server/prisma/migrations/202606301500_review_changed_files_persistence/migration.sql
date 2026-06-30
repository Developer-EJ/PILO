CREATE TABLE IF NOT EXISTS changed_files (
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
  CONSTRAINT changed_files_analysis_file_path_key UNIQUE (analysis_id, file_path)
);

CREATE TABLE IF NOT EXISTS changed_functions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_file_id UUID NOT NULL REFERENCES changed_files(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  change_type VARCHAR(20) NOT NULL,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT changed_functions_change_type_check CHECK (change_type IN ('added', 'modified', 'deleted')),
  CONSTRAINT changed_functions_file_name_key UNIQUE (changed_file_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS changed_files_analysis_file_path_key
  ON changed_files(analysis_id, file_path);

CREATE UNIQUE INDEX IF NOT EXISTS changed_functions_file_name_key
  ON changed_functions(changed_file_id, name);

CREATE INDEX IF NOT EXISTS idx_changed_files_analysis_id
  ON changed_files(analysis_id);

CREATE INDEX IF NOT EXISTS idx_changed_functions_file_id
  ON changed_functions(changed_file_id);
