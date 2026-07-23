BEGIN;

CREATE TABLE public.outer_transaction_marker (
  id INTEGER PRIMARY KEY
);

COMMIT;
