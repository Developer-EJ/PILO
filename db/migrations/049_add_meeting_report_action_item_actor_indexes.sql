BEGIN;

CREATE INDEX idx_meeting_report_action_items_assignee_user_id
  ON public.meeting_report_action_items (assignee_user_id);

CREATE INDEX idx_meeting_report_action_items_updated_by_user_id
  ON public.meeting_report_action_items (updated_by_user_id);

CREATE INDEX idx_meeting_report_action_items_approved_by_user_id
  ON public.meeting_report_action_items (approved_by_user_id);

CREATE INDEX idx_meeting_report_action_items_dismissed_by_user_id
  ON public.meeting_report_action_items (dismissed_by_user_id);

COMMIT;
