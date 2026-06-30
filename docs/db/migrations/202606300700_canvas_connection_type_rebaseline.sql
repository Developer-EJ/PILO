-- Align Canvas connection types with the public fixture/API values used by the MVP.

ALTER TABLE canvas_connections
  DROP CONSTRAINT IF EXISTS canvas_connections_type_check;

ALTER TABLE canvas_connections
  ADD CONSTRAINT canvas_connections_type_check
  CHECK (
    connection_type IN (
      'related_to',
      'created_from',
      'blocks',
      'references',
      'implements',
      'implemented_by',
      'reviews'
    )
  );
