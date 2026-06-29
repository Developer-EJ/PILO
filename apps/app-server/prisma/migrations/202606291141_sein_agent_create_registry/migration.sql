CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  domain VARCHAR(40) NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agents_domain_check CHECK (domain IN ('task', 'github', 'meeting', 'review', 'planning', 'orchestrator'))
);

CREATE TABLE IF NOT EXISTS agent_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  type VARCHAR(120) NOT NULL,
  version VARCHAR(40) NOT NULL DEFAULT 'v1',
  input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_workflows_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  CONSTRAINT agent_workflows_type_version_key UNIQUE (type, version)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM agent_workflows
    GROUP BY type, version
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'agent_workflows has duplicate type/version rows; deduplicate before applying agent_workflows_type_version_key';
  END IF;
END $$;

ALTER TABLE agent_workflows
  DROP CONSTRAINT IF EXISTS agent_workflows_agent_id_type_version_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'agent_workflows'::regclass
      AND conname = 'agent_workflows_type_version_key'
  ) THEN
    ALTER TABLE agent_workflows
      ADD CONSTRAINT agent_workflows_type_version_key UNIQUE (type, version);
  END IF;
END $$;
