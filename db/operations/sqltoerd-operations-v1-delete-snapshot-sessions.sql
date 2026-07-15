-- SQLtoERD operations_v1 cutover only. This is an operator-run template,
-- not a migration. Run it inside the approved maintenance window only after
-- the encrypted snapshot export and manifest validation have completed.
--
-- Replace expected_session_ids with the complete, lexicographically sorted
-- session ID list from the validated manifest. An empty list intentionally
-- aborts: there is nothing to delete.

BEGIN;

-- Blocks concurrent INSERT/UPDATE/DELETE on sql_erd_sessions while the
-- manifest target is checked and physically deleted.
LOCK TABLE public.sql_erd_sessions IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  expected_session_ids UUID[] := ARRAY[
    -- '00000000-0000-4000-8000-000000000000'
  ]::UUID[];
  actual_session_ids UUID[];
BEGIN
  IF cardinality(expected_session_ids) = 0 THEN
    RAISE EXCEPTION
      'Replace expected_session_ids with the validated export manifest IDs before deletion';
  END IF;

  SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::UUID[])
  INTO actual_session_ids
  FROM public.sql_erd_sessions
  WHERE write_protocol = 'snapshot'
    AND deleted_at IS NULL;

  IF actual_session_ids IS DISTINCT FROM expected_session_ids THEN
    RAISE EXCEPTION
      'Active snapshot session IDs no longer match the validated export manifest';
  END IF;
END;
$$;

WITH deleted_sessions AS (
  DELETE FROM public.sql_erd_sessions
  WHERE write_protocol = 'snapshot'
    AND deleted_at IS NULL
  RETURNING id
)
SELECT
  count(*)::INTEGER AS deleted_snapshot_session_count,
  COALESCE(array_agg(id ORDER BY id), ARRAY[]::UUID[]) AS deleted_session_ids
FROM deleted_sessions;

COMMIT;
