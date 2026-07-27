BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

ALTER TABLE public.meeting_reports
  ADD COLUMN normalized_title TEXT
  GENERATED ALWAYS AS (
    lower(
      regexp_replace(
        btrim(COALESCE(user_title, title, '')),
        '\s+',
        ' ',
        'g'
      )
    )
  ) STORED;

CREATE INDEX idx_meeting_reports_normalized_title
  ON public.meeting_reports(normalized_title)
  WHERE normalized_title <> '';

CREATE INDEX idx_meeting_reports_normalized_title_trgm
  ON public.meeting_reports
  USING GIN (normalized_title extensions.gin_trgm_ops)
  WHERE normalized_title <> '';

CREATE INDEX idx_meetings_workspace_started_at
  ON public.meetings(workspace_id, started_at DESC, id);

COMMENT ON COLUMN public.meeting_reports.normalized_title IS
  'Generated display-title normalization used by exact and pg_trgm MeetingReport search.';

COMMIT;
