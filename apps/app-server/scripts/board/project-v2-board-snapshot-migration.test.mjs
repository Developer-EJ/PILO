import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../../../../db/migrations/108_reconcile_project_v2_field_board_snapshots.sql",
    import.meta.url
  ),
  "utf8"
);

assert.doesNotMatch(migration, /\bBEGIN\s*;/i, "Migration 108 must be runner-transaction managed");
assert.doesNotMatch(migration, /\bCOMMIT\s*;/i, "Migration 108 must not commit internally");
assert.match(
  migration,
  /CREATE OR REPLACE FUNCTION public\.hydrate_pilo_board_from_github\(\s*p_project_v2_id UUID,\s*p_repository_id UUID\s*\)/,
  "Migration 108 must redefine hydrate_pilo_board_from_github(UUID, UUID)"
);
assert.match(
  migration,
  /LANGUAGE plpgsql\s+SET search_path = public, pg_temp;/,
  "Board hydration must keep the hardened function-local search_path"
);

const staleColumnDelete = migration.match(
  /DELETE FROM board_columns stale_col[\s\S]*?status_option_github_id[\s\S]*?current_status_options[\s\S]*?;/
)?.[0];
assert.ok(staleColumnDelete, "Hydration must delete stale remote Status columns by stable GitHub option identity");
assert.match(staleColumnDelete, /stale_col\.status_option_github_id IS NOT NULL/);
assert.match(staleColumnDelete, /current_status_options[\s\S]*github_option_id = stale_col\.status_option_github_id/);
assert.doesNotMatch(staleColumnDelete, /status_option_id\s+IS\s+NOT\s+NULL/i);

const reconcileColumns = migration.match(
  /WITH current_status_options AS \([\s\S]*?finalize_existing_columns AS \([\s\S]*?\)\s*UPDATE board_columns existing_col[\s\S]*?;/
)?.[0];
assert.ok(reconcileColumns, "Hydration must reconcile retained columns with a set-based two-phase update");
assert.match(reconcileColumns, /target_position/);
assert.match(reconcileColumns, /position = target_columns\.target_position \+ target_columns\.offset_value/);
assert.match(reconcileColumns, /position = finalize_existing_columns\.target_position/);
assert.match(reconcileColumns, /ORDER BY COALESCE\(o\.position, 0\) ASC/);

assert.match(
  migration,
  /WITH ranked_unmapped AS \([\s\S]*normalized_name = 'unmapped'[\s\S]*DELETE FROM board_columns duplicate_unmapped[\s\S]*ranked_unmapped\.rn > 1[\s\S]*;/,
  "Hydration must collapse duplicate local Unmapped columns"
);
assert.match(
  migration,
  /INSERT INTO board_columns \([\s\S]*'Unmapped'[\s\S]*COALESCE\(\(\s*SELECT COUNT\(\*\)[\s\S]*current_status_options/,
  "Hydration must keep one Unmapped column after the current Status options, or at position 0 when none exist"
);

const staleIndex = migration.indexOf("DELETE FROM board_columns stale_col");
const refreshIndex = migration.indexOf("PERFORM refresh_pilo_issues_from_github(v_board_id);");
assert.ok(staleIndex >= 0 && refreshIndex > staleIndex, "Issue refresh must run after stale columns are gone");
assert.match(migration, /RETURN v_board_id;/, "Hydration must keep the existing return contract");
