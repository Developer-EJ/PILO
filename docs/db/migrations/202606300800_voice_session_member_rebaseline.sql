-- Align Voice session persistence with the runtime VoiceSessionRecord contract.

ALTER TABLE voice_sessions
  ADD COLUMN IF NOT EXISTS member_id UUID;

ALTER TABLE voice_sessions
  DROP CONSTRAINT IF EXISTS voice_sessions_member_fk;

ALTER TABLE voice_sessions
  ADD CONSTRAINT voice_sessions_member_fk
  FOREIGN KEY (member_id)
  REFERENCES workspace_members(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_voice_sessions_room_member_active
  ON voice_sessions(voice_room_id, member_id)
  WHERE ended_at IS NULL;
