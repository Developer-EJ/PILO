CREATE OR REPLACE FUNCTION public.hydrate_pilo_board_from_github(
  p_project_v2_id UUID,
  p_repository_id UUID
)
RETURNS BIGINT AS $$
DECLARE
  v_board_id BIGINT;
BEGIN
  INSERT INTO boards (
    name,
    workspace_id,
    repository_id,
    project_v2_id,
    status_field_id,
    last_sync_status,
    last_synced_at
  )
  SELECT
    gp.title,
    gp.workspace_id,
    gr.id AS repository_id,
    gp.id AS project_v2_id,
    sf.id AS status_field_id,
    'success'::github_sync_status,
    now()
  FROM github_projects_v2 gp
  JOIN github_project_v2_repositories gpr
    ON gpr.project_v2_id = gp.id
  JOIN github_repositories gr
    ON gr.id = gpr.repository_id
  LEFT JOIN github_project_v2_fields sf
    ON sf.project_v2_id = gp.id
   AND sf.is_status_field = true
  WHERE gp.id = p_project_v2_id
    AND gr.id = p_repository_id
    AND gp.workspace_id = gr.workspace_id
  ON CONFLICT (project_v2_id, repository_id)
  DO UPDATE SET
    name = EXCLUDED.name,
    workspace_id = EXCLUDED.workspace_id,
    status_field_id = EXCLUDED.status_field_id,
    last_sync_status = EXCLUDED.last_sync_status,
    last_synced_at = EXCLUDED.last_synced_at,
    updated_at = now()
  RETURNING id INTO v_board_id;

  WITH current_status_options AS (
    SELECT
      o.id AS option_id,
      o.github_option_id,
      o.option_name,
      o.normalized_name,
      o.color,
      ROW_NUMBER() OVER (
        ORDER BY COALESCE(o.position, 0) ASC, o.github_option_id ASC, o.id ASC
      )::integer AS target_position
    FROM boards b
    JOIN github_project_v2_fields sf
      ON sf.id = b.status_field_id
    JOIN github_project_v2_field_options o
      ON o.field_id = sf.id
    WHERE b.id = v_board_id
  )
  DELETE FROM board_columns stale_col
  USING boards b
  WHERE stale_col.board_id = b.id
    AND b.id = v_board_id
    AND stale_col.status_option_github_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM current_status_options
      WHERE current_status_options.github_option_id = stale_col.status_option_github_id
    );

  WITH ranked_unmapped AS (
    SELECT
      id,
      ROW_NUMBER() OVER (ORDER BY position ASC, id ASC) AS rn
    FROM board_columns
    WHERE board_id = v_board_id
      AND status_option_github_id IS NULL
      AND normalized_name = 'unmapped'
  )
  DELETE FROM board_columns duplicate_unmapped
  USING ranked_unmapped
  WHERE duplicate_unmapped.id = ranked_unmapped.id
    AND ranked_unmapped.rn > 1;

  WITH current_status_options AS (
    SELECT
      o.id AS option_id,
      o.github_option_id,
      o.option_name,
      o.normalized_name,
      o.color,
      ROW_NUMBER() OVER (
        ORDER BY COALESCE(o.position, 0) ASC, o.github_option_id ASC, o.id ASC
      )::integer AS target_position
    FROM boards b
    JOIN github_project_v2_fields sf
      ON sf.id = b.status_field_id
    JOIN github_project_v2_field_options o
      ON o.field_id = sf.id
    WHERE b.id = v_board_id
  ),
  position_offset AS (
    SELECT COALESCE(MAX(position), 0) + COUNT(*) + 1 AS offset_value
    FROM board_columns
    WHERE board_id = v_board_id
  ),
  target_columns AS (
    SELECT
      current_status_options.*,
      position_offset.offset_value
    FROM current_status_options
    CROSS JOIN position_offset
  )
  UPDATE board_columns existing_col
  SET
    status_option_id = target_columns.option_id,
    name = target_columns.option_name,
    position = target_columns.target_position + target_columns.offset_value,
    color = target_columns.color,
    normalized_name = target_columns.normalized_name,
    updated_at = now()
  FROM target_columns
  WHERE existing_col.board_id = v_board_id
    AND existing_col.status_option_github_id = target_columns.github_option_id;

  WITH current_status_option_count AS (
    SELECT COUNT(*)::integer AS total
    FROM boards b
    JOIN github_project_v2_fields sf
      ON sf.id = b.status_field_id
    JOIN github_project_v2_field_options o
      ON o.field_id = sf.id
    WHERE b.id = v_board_id
  ),
  position_offset AS (
    SELECT COALESCE(MAX(position), 0) + COUNT(*) + 1 AS offset_value
    FROM board_columns
    WHERE board_id = v_board_id
  )
  UPDATE board_columns unmapped_col
  SET
    position = position_offset.offset_value + current_status_option_count.total + 1,
    name = 'Unmapped',
    color = '#8a93a6',
    updated_at = now()
  FROM position_offset
  CROSS JOIN current_status_option_count
  WHERE unmapped_col.board_id = v_board_id
    AND unmapped_col.status_option_github_id IS NULL
    AND unmapped_col.normalized_name = 'unmapped';

  WITH current_status_options AS (
    SELECT
      o.id AS option_id,
      o.github_option_id,
      o.option_name,
      o.normalized_name,
      o.color,
      ROW_NUMBER() OVER (
        ORDER BY COALESCE(o.position, 0) ASC, o.github_option_id ASC, o.id ASC
      )::integer AS target_position
    FROM boards b
    JOIN github_project_v2_fields sf
      ON sf.id = b.status_field_id
    JOIN github_project_v2_field_options o
      ON o.field_id = sf.id
    WHERE b.id = v_board_id
  )
  INSERT INTO board_columns (
    board_id,
    name,
    position,
    color,
    status_option_id,
    status_option_github_id,
    normalized_name
  )
  SELECT
    v_board_id,
    current_status_options.option_name,
    current_status_options.target_position,
    current_status_options.color,
    current_status_options.option_id,
    current_status_options.github_option_id,
    current_status_options.normalized_name
  FROM current_status_options
  WHERE NOT EXISTS (
    SELECT 1
    FROM board_columns existing_col
    WHERE existing_col.board_id = v_board_id
      AND existing_col.status_option_github_id = current_status_options.github_option_id
  )
    AND NOT EXISTS (
      SELECT 1
      FROM board_columns existing_col
      WHERE existing_col.board_id = v_board_id
        AND existing_col.status_option_id = current_status_options.option_id
    );

  WITH current_status_options AS (
    SELECT
      o.id AS option_id,
      o.github_option_id,
      ROW_NUMBER() OVER (
        ORDER BY COALESCE(o.position, 0) ASC, o.github_option_id ASC, o.id ASC
      )::integer AS target_position
    FROM boards b
    JOIN github_project_v2_fields sf
      ON sf.id = b.status_field_id
    JOIN github_project_v2_field_options o
      ON o.field_id = sf.id
    WHERE b.id = v_board_id
  ),
  target_columns AS (
    SELECT current_status_options.*
    FROM current_status_options
  ),
  finalize_existing_columns AS (
    SELECT
      existing_col.id,
      target_columns.target_position
    FROM board_columns existing_col
    JOIN target_columns
      ON target_columns.github_option_id = existing_col.status_option_github_id
    WHERE existing_col.board_id = v_board_id
  )
  UPDATE board_columns existing_col
  SET
    position = finalize_existing_columns.target_position,
    updated_at = now()
  FROM finalize_existing_columns
  WHERE existing_col.id = finalize_existing_columns.id;

  WITH current_status_options AS (
    SELECT o.id
    FROM boards b
    JOIN github_project_v2_fields sf
      ON sf.id = b.status_field_id
    JOIN github_project_v2_field_options o
      ON o.field_id = sf.id
    WHERE b.id = v_board_id
  ),
  unmapped_target AS (
    SELECT COALESCE((SELECT COUNT(*) FROM current_status_options), 0) + 1 AS position
  )
  INSERT INTO board_columns (
    board_id,
    name,
    position,
    color,
    normalized_name
  )
  SELECT
    v_board_id,
    'Unmapped',
    CASE
      WHEN unmapped_target.position = 1 THEN 0
      ELSE unmapped_target.position
    END,
    '#8a93a6',
    'unmapped'
  FROM unmapped_target
  WHERE NOT EXISTS (
    SELECT 1
    FROM board_columns bc
    WHERE bc.board_id = v_board_id
      AND bc.status_option_github_id IS NULL
      AND bc.normalized_name = 'unmapped'
  );

  WITH current_status_options AS (
    SELECT o.id
    FROM boards b
    JOIN github_project_v2_fields sf
      ON sf.id = b.status_field_id
    JOIN github_project_v2_field_options o
      ON o.field_id = sf.id
    WHERE b.id = v_board_id
  ),
  unmapped_target AS (
    SELECT COALESCE((SELECT COUNT(*) FROM current_status_options), 0) + 1 AS position
  )
  UPDATE board_columns unmapped_col
  SET
    name = 'Unmapped',
    position = CASE
      WHEN unmapped_target.position = 1 THEN 0
      ELSE unmapped_target.position
    END,
    color = '#8a93a6',
    updated_at = now()
  FROM unmapped_target
  WHERE unmapped_col.board_id = v_board_id
    AND unmapped_col.status_option_github_id IS NULL
    AND unmapped_col.normalized_name = 'unmapped';

  PERFORM refresh_pilo_issues_from_github(v_board_id);

  RETURN v_board_id;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;
