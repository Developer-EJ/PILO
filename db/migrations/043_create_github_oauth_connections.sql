BEGIN;

CREATE TABLE github_oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('app_user', 'project_v2')),
  github_user_id BIGINT NOT NULL,
  github_login VARCHAR(255) NOT NULL,
  access_token_encrypted TEXT,
  token_scope TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_github_oauth_connections_active_user_purpose
  ON github_oauth_connections(user_id, purpose)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX uq_github_oauth_connections_active_github_account_purpose
  ON github_oauth_connections(purpose, github_user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_github_oauth_connections_user_purpose
  ON github_oauth_connections(user_id, purpose);

CREATE TRIGGER trg_github_oauth_connections_updated_at
BEFORE UPDATE ON github_oauth_connections
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE github_oauth_connections ENABLE ROW LEVEL SECURITY;

-- The legacy columns cannot prove which GitHub account issued a stored token.
-- Invalidate them rather than copying potentially mismatched credentials.
UPDATE users
SET
  github_access_token_encrypted = NULL,
  github_token_scope = NULL,
  github_revoked_at = CASE
    WHEN github_connected_at IS NOT NULL AND github_revoked_at IS NULL THEN now()
    ELSE github_revoked_at
  END,
  github_project_access_token_encrypted = NULL,
  github_project_token_scope = NULL,
  github_project_revoked_at = CASE
    WHEN github_project_connected_at IS NOT NULL AND github_project_revoked_at IS NULL THEN now()
    ELSE github_project_revoked_at
  END;

COMMIT;
