-- Create the SQLtoERD durable operation log and realtime delivery outbox.
-- Existing sessions remain on the snapshot write protocol. A later activation
-- flow may atomically switch a ready session to operations_v1.

BEGIN;

ALTER TABLE public.sql_erd_sessions
  ADD COLUMN write_protocol TEXT NOT NULL DEFAULT 'snapshot',
  ADD COLUMN latest_op_seq BIGINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT sql_erd_sessions_write_protocol_check
    CHECK (write_protocol IN ('snapshot', 'operations_v1')),
  ADD CONSTRAINT sql_erd_sessions_latest_op_seq_non_negative_check
    CHECK (latest_op_seq >= 0);

CREATE TABLE public.sql_erd_session_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  workspace_id UUID NOT NULL
    REFERENCES public.workspaces(id) ON DELETE CASCADE,

  session_id UUID NOT NULL
    REFERENCES public.sql_erd_sessions(id) ON DELETE CASCADE,

  actor_user_id UUID NOT NULL
    REFERENCES public.users(id) ON DELETE RESTRICT,

  operation_type TEXT NOT NULL,
  op_seq BIGINT NOT NULL,
  client_operation_id TEXT NOT NULL,

  base_revision INTEGER NOT NULL,
  applied_on_revision INTEGER NOT NULL,
  result_revision INTEGER NOT NULL,
  payload JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sql_erd_session_operations_type_check
    CHECK (operation_type IN ('layout_patch')),
  CONSTRAINT sql_erd_session_operations_op_seq_positive_check
    CHECK (op_seq > 0),
  CONSTRAINT sql_erd_session_operations_client_operation_id_check
    CHECK (
      client_operation_id = btrim(client_operation_id)
      AND char_length(client_operation_id) BETWEEN 1 AND 128
    ),
  CONSTRAINT sql_erd_session_operations_base_revision_positive_check
    CHECK (base_revision > 0),
  CONSTRAINT sql_erd_session_operations_applied_on_revision_positive_check
    CHECK (applied_on_revision > 0),
  CONSTRAINT sql_erd_session_operations_result_revision_check
    CHECK (result_revision = applied_on_revision + 1),
  CONSTRAINT sql_erd_session_operations_payload_object_check
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT sql_erd_session_operations_payload_size_check
    CHECK (octet_length(payload::text) <= 1048576),
  CONSTRAINT unique_sql_erd_session_operation_seq
    UNIQUE (session_id, op_seq),
  CONSTRAINT unique_sql_erd_session_operation_client_retry
    UNIQUE (session_id, actor_user_id, client_operation_id)
);

CREATE INDEX idx_sql_erd_session_operations_session_op_seq
  ON public.sql_erd_session_operations(session_id, op_seq);

CREATE INDEX idx_sql_erd_session_operations_workspace_session
  ON public.sql_erd_session_operations(workspace_id, session_id);

CREATE TABLE public.sql_erd_session_operation_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  operation_id UUID NOT NULL UNIQUE
    REFERENCES public.sql_erd_session_operations(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  claim_token UUID,
  claimed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  error_code TEXT,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sql_erd_session_operation_outbox_status_check
    CHECK (status IN ('pending', 'publishing', 'delivered')),
  CONSTRAINT sql_erd_session_operation_outbox_attempt_count_check
    CHECK (attempt_count >= 0),
  CONSTRAINT sql_erd_session_operation_outbox_error_code_check
    CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 80),
  CONSTRAINT sql_erd_session_operation_outbox_error_message_check
    CHECK (error_message IS NULL OR char_length(error_message) <= 1000),
  CONSTRAINT sql_erd_session_operation_outbox_delivery_state_check
    CHECK (
      (status = 'pending' AND claim_token IS NULL AND claimed_at IS NULL AND delivered_at IS NULL)
      OR (status = 'publishing' AND claim_token IS NOT NULL AND claimed_at IS NOT NULL AND delivered_at IS NULL)
      OR (status = 'delivered' AND claim_token IS NULL AND claimed_at IS NULL AND delivered_at IS NOT NULL)
    )
);

CREATE INDEX idx_sql_erd_operation_outbox_pending_attempt
  ON public.sql_erd_session_operation_outbox(next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX idx_sql_erd_operation_outbox_publishing_claimed_at
  ON public.sql_erd_session_operation_outbox(claimed_at)
  WHERE status = 'publishing';

CREATE TRIGGER trg_sql_erd_session_operation_outbox_updated_at
BEFORE UPDATE ON public.sql_erd_session_operation_outbox
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.sql_erd_session_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sql_erd_session_operation_outbox ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.sql_erd_sessions.write_protocol IS
  'snapshot keeps the legacy full-session PATCH path. operations_v1 rejects legacy durable writes and uses the SQLtoERD operation API.';

COMMENT ON COLUMN public.sql_erd_sessions.latest_op_seq IS
  'Last committed sql_erd_session_operations.op_seq. Writers lock the session row and increment it with the operation, snapshot update, and outbox intent.';

COMMENT ON TABLE public.sql_erd_session_operations IS
  'Durable, ordered SQLtoERD layout operations. Socket.IO delivery is at-least-once and does not define ordering.';

COMMENT ON COLUMN public.sql_erd_session_operations.client_operation_id IS
  'Stable client idempotency key for retried operation requests from one actor.';

COMMENT ON COLUMN public.sql_erd_session_operations.payload IS
  'Validated layout_patch command payload. Add, update, and delete commands are explicit so an empty value is never interpreted as deletion.';

COMMENT ON TABLE public.sql_erd_session_operation_outbox IS
  'Transactional SQLtoERD operation broadcast intents. Publishers reclaim publishing rows after their lease expires and retry until delivered.';

COMMIT;
