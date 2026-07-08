-- Meeting reminder MVP tables.

BEGIN;

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  room_key VARCHAR(100) NOT NULL DEFAULT 'MAIN_MEETING_ROOM',
  livekit_room_name VARCHAR(255) NOT NULL,
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ended_by_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  livekit_identity VARCHAR(255) NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, user_id)
);

CREATE TABLE meeting_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  message TEXT NOT NULL,
  is_sent BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_meeting_reminders_sent_state
    CHECK (
      (is_sent = false AND sent_at IS NULL)
      OR is_sent = true
    )
);

CREATE INDEX idx_meeting_reminders_workspace_remind_at
  ON meeting_reminders (workspace_id, remind_at);

CREATE INDEX idx_meeting_reminders_user_remind_at
  ON meeting_reminders (user_id, remind_at);

CREATE INDEX idx_meeting_reminders_pending
  ON meeting_reminders (remind_at)
  WHERE is_sent = false;

CREATE TRIGGER trg_meeting_reminders_updated_at
BEFORE UPDATE ON meeting_reminders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

COMMIT;
