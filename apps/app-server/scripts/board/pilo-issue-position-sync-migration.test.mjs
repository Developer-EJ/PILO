import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../../../../db/migrations/106_fix_pilo_issue_hydration_position_offset.sql",
    import.meta.url
  ),
  "utf8"
);

assert.match(
  migration,
  /CREATE OR REPLACE FUNCTION public\.refresh_pilo_issues_from_github\(\s*p_board_id BIGINT\s*\)/,
  "Migration 106 must replace the Board issue hydration function"
);
assert.match(
  migration,
  /LANGUAGE plpgsql\s+SET search_path = public, pg_temp;/,
  "Migration 106 must preserve the hardened function-local search_path"
);
assert.match(
  migration,
  /pg_advisory_xact_lock\(\s*hashtextextended\(/,
  "Same-board hydrations must be serialized with a transaction advisory lock"
);

const positionOffset = migration.match(/WITH position_offset AS \([\s\S]*?\)\s*UPDATE pilo_issues pi/)?.[0];
assert.ok(positionOffset, "Migration 106 must move cached positions into a temporary high band");
assert.match(
  positionOffset,
  /COUNT\(\*\)/,
  "The temporary offset must account for the incoming source item count"
);
assert.match(
  positionOffset,
  /MAX\(pi\.position\)/,
  "The temporary offset must account for existing cached positions"
);
assert.match(
  positionOffset,
  /GREATEST\(/,
  "The temporary offset must be above both existing and incoming position ranges"
);
assert.doesNotMatch(
  positionOffset,
  /COALESCE\(MAX\(pi\.position\),\s*0\)\s*\+\s*1/,
  "The unsafe existing-position-only offset must not be reused"
);
assert.match(
  migration,
  /ROW_NUMBER\(\) OVER \(\s*PARTITION BY positioned_source_items\.column_id\s*ORDER BY positioned_source_items\.remote_position ASC NULLS LAST,[\s\S]*?\) - 1 AS item_position/,
  "Final positions must remain dense per column in the established source order"
);
