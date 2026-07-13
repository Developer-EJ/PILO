BEGIN;

ALTER TABLE public.meeting_report_action_items
  ADD COLUMN calendar_event_id BIGINT
    REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  ADD COLUMN calendar_event_linked_by_user_id UUID
    REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN calendar_event_linked_at TIMESTAMPTZ;

ALTER TABLE public.meeting_report_action_items
  ADD CONSTRAINT meeting_report_action_items_calendar_event_unique
    UNIQUE (calendar_event_id),
  ADD CONSTRAINT meeting_report_action_items_calendar_event_link_audit_check
    CHECK (
      (calendar_event_linked_by_user_id IS NULL OR calendar_event_linked_at IS NOT NULL)
      AND (calendar_event_id IS NULL OR calendar_event_linked_at IS NOT NULL)
    );

CREATE INDEX idx_meeting_report_action_items_calendar_event_linked_by_user
  ON public.meeting_report_action_items (calendar_event_linked_by_user_id);

COMMIT;
