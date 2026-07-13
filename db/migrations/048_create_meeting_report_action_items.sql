BEGIN;

CREATE TABLE public.meeting_report_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_report_id UUID NOT NULL REFERENCES public.meeting_reports(id) ON DELETE CASCADE,
  source_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL,
  assignee_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  updated_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  dismissed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT meeting_report_action_items_report_source_unique
    UNIQUE (meeting_report_id, source_index),
  CONSTRAINT meeting_report_action_items_source_index_check
    CHECK (source_index >= 0),
  CONSTRAINT meeting_report_action_items_title_check
    CHECK (title = btrim(title) AND octet_length(title) BETWEEN 1 AND 500),
  CONSTRAINT meeting_report_action_items_description_check
    CHECK (description = btrim(description) AND octet_length(description) BETWEEN 1 AND 5000),
  CONSTRAINT meeting_report_action_items_priority_check
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  CONSTRAINT meeting_report_action_items_status_check
    CHECK (status IN ('PENDING', 'APPROVED', 'DISMISSED')),
  CONSTRAINT meeting_report_action_items_terminal_audit_check
    CHECK (
      (status = 'PENDING'
        AND approved_by_user_id IS NULL AND approved_at IS NULL
        AND dismissed_by_user_id IS NULL AND dismissed_at IS NULL)
      OR (status = 'APPROVED'
        AND approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL
        AND dismissed_by_user_id IS NULL AND dismissed_at IS NULL)
      OR (status = 'DISMISSED'
        AND approved_by_user_id IS NULL AND approved_at IS NULL
        AND dismissed_by_user_id IS NOT NULL AND dismissed_at IS NOT NULL)
    )
);

CREATE INDEX idx_meeting_report_action_items_report_status
  ON public.meeting_report_action_items (meeting_report_id, status, source_index);

CREATE TRIGGER trg_meeting_report_action_items_updated_at
BEFORE UPDATE ON public.meeting_report_action_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.meeting_report_action_items (
  meeting_report_id,
  source_index,
  title,
  description,
  priority
)
SELECT
  reports.id,
  candidates.ordinality - 1,
  btrim(candidates.value->>'title'),
  COALESCE(NULLIF(btrim(candidates.value->>'description'), ''), '상세 내용 없음'),
  CASE candidates.value->>'priority'
    WHEN 'LOW' THEN 'LOW'
    WHEN 'HIGH' THEN 'HIGH'
    ELSE 'MEDIUM'
  END
FROM public.meeting_reports AS reports
CROSS JOIN LATERAL jsonb_array_elements(reports.action_item_candidates)
  WITH ORDINALITY AS candidates(value, ordinality)
WHERE jsonb_typeof(candidates.value) = 'object'
  AND NULLIF(btrim(candidates.value->>'title'), '') IS NOT NULL
ON CONFLICT (meeting_report_id, source_index) DO NOTHING;

ALTER TABLE public.meeting_report_action_items ENABLE ROW LEVEL SECURITY;

COMMIT;
