BEGIN;

ALTER TABLE public.workspaces
  ADD COLUMN deletion_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN deletion_requested_by_user_id UUID
    REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT workspaces_deletion_status_check
    CHECK (deletion_status IN ('active', 'deleting')),
  ADD CONSTRAINT workspaces_deletion_state_check
    CHECK (
      (deletion_status = 'active'
        AND deletion_requested_at IS NULL
        AND deletion_requested_by_user_id IS NULL)
      OR
      (deletion_status = 'deleting'
        AND deletion_requested_at IS NOT NULL)
    );

CREATE INDEX idx_workspaces_deletion_status
  ON public.workspaces(deletion_status)
  WHERE deletion_status = 'deleting';

CREATE TABLE public.workspace_deletion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  requested_by_user_id UUID
    REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'cleaning',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT workspace_deletion_jobs_status_check
    CHECK (status = 'cleaning')
);

CREATE TABLE public.workspace_deletion_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deletion_job_id UUID NOT NULL
    REFERENCES public.workspace_deletion_jobs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  object_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claim_token UUID,
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT workspace_deletion_targets_job_object_unique
    UNIQUE (deletion_job_id, object_key),
  CONSTRAINT workspace_deletion_targets_type_check
    CHECK (
      target_type = btrim(target_type)
      AND octet_length(target_type) BETWEEN 1 AND 80
    ),
  CONSTRAINT workspace_deletion_targets_object_key_check
    CHECK (
      object_key = btrim(object_key)
      AND octet_length(object_key) BETWEEN 1 AND 1000
    ),
  CONSTRAINT workspace_deletion_targets_status_check
    CHECK (status IN ('pending', 'processing', 'completed')),
  CONSTRAINT workspace_deletion_targets_attempt_count_check
    CHECK (attempt_count >= 0),
  CONSTRAINT workspace_deletion_targets_error_code_check
    CHECK (
      last_error_code IS NULL
      OR octet_length(last_error_code) BETWEEN 1 AND 80
    ),
  CONSTRAINT workspace_deletion_targets_processing_state_check
    CHECK (
      (status = 'pending'
        AND claim_token IS NULL
        AND claimed_at IS NULL
        AND completed_at IS NULL)
      OR
      (status = 'processing'
        AND claim_token IS NOT NULL
        AND claimed_at IS NOT NULL
        AND completed_at IS NULL)
      OR
      (status = 'completed'
        AND claim_token IS NULL
        AND claimed_at IS NULL
        AND completed_at IS NOT NULL)
    )
);

CREATE INDEX idx_workspace_deletion_targets_pending_attempt
  ON public.workspace_deletion_targets(next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX idx_workspace_deletion_targets_processing_claimed_at
  ON public.workspace_deletion_targets(claimed_at)
  WHERE status = 'processing';

CREATE INDEX idx_workspace_deletion_targets_job_status
  ON public.workspace_deletion_targets(deletion_job_id, status);

CREATE TRIGGER trg_workspace_deletion_jobs_updated_at
BEFORE UPDATE ON public.workspace_deletion_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_workspace_deletion_targets_updated_at
BEFORE UPDATE ON public.workspace_deletion_targets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.workspace_deletion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_deletion_targets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.workspace_deletion_jobs
  FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public.workspace_deletion_targets
  FROM anon, authenticated, service_role;

COMMENT ON TABLE public.workspace_deletion_jobs IS
  'Durable Workspace deletion lifecycle. The Workspace row remains until every external object target is deleted.';
COMMENT ON TABLE public.workspace_deletion_targets IS
  'Private retry state for Workspace-owned external objects. Object keys must never be copied to API responses, Activity Log metadata, or application logs.';

CREATE OR REPLACE FUNCTION public.enforce_active_workspace_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_deletion_status TEXT;
BEGIN
  SELECT workspace.deletion_status
    INTO current_deletion_status
    FROM public.workspaces AS workspace
    WHERE workspace.id = NEW.workspace_id
    FOR SHARE;

  IF current_deletion_status = 'deleting' THEN
    RAISE EXCEPTION 'Workspace deletion is in progress'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  workspace_table RECORD;
BEGIN
  FOR workspace_table IN
    SELECT columns.table_schema, columns.table_name
    FROM information_schema.columns
    JOIN information_schema.tables
      ON information_schema.tables.table_schema = columns.table_schema
     AND information_schema.tables.table_name = columns.table_name
    WHERE columns.table_schema = 'public'
      AND columns.column_name = 'workspace_id'
      AND information_schema.tables.table_type = 'BASE TABLE'
      AND columns.table_name NOT IN (
        'workspace_deletion_jobs',
        'workspace_deletion_targets'
      )
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.enforce_active_workspace_write()',
      'trg_' || workspace_table.table_name || '_active_workspace_write',
      workspace_table.table_schema,
      workspace_table.table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_active_meeting_recording_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_deletion_status TEXT;
BEGIN
  SELECT workspace.deletion_status
    INTO current_deletion_status
    FROM public.meetings AS meeting
    JOIN public.workspaces AS workspace
      ON workspace.id = meeting.workspace_id
    WHERE meeting.id = NEW.meeting_id
    FOR SHARE OF workspace;

  IF current_deletion_status = 'deleting' THEN
    RAISE EXCEPTION 'Workspace deletion is in progress'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_meeting_recordings_active_workspace_write
BEFORE INSERT OR UPDATE ON public.meeting_recordings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_active_meeting_recording_write();

CREATE OR REPLACE FUNCTION public.enforce_workspace_deletion_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.deletion_status = 'deleting'
     AND NEW.deletion_status = 'deleting' THEN
    RAISE EXCEPTION 'Workspace deletion is in progress'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workspaces_deletion_state
BEFORE UPDATE ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.enforce_workspace_deletion_state();

CREATE OR REPLACE FUNCTION public.enforce_workspace_deletion_finalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.deletion_status <> 'deleting'
     OR COALESCE(
       current_setting('pilo.workspace_deletion_finalize', true),
       ''
     ) <> 'on' THEN
    RAISE EXCEPTION 'Workspace hard delete requires completed external cleanup'
      USING ERRCODE = '55000';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_workspaces_deletion_finalize
BEFORE DELETE ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.enforce_workspace_deletion_finalize();

COMMIT;
