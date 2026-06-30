ALTER TABLE code_review_rooms
  DROP CONSTRAINT IF EXISTS code_review_rooms_pull_request_id_fkey;

ALTER TABLE pull_request_analyses
  DROP CONSTRAINT IF EXISTS pull_request_analyses_pull_request_id_fkey;

ALTER TABLE review_graphs
  DROP CONSTRAINT IF EXISTS review_graphs_pull_request_id_fkey;

ALTER TABLE code_review_rooms
  ADD COLUMN IF NOT EXISTS pull_request_snapshot JSONB;
