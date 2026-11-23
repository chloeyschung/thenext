-- Nullable additions: existing participants resolve to origin/outbound mode in application code.
ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS home_address_label varchar(200),
  ADD COLUMN IF NOT EXISTS home_lat double precision,
  ADD COLUMN IF NOT EXISTS home_lng double precision,
  ADD COLUMN IF NOT EXISTS return_transport_mode varchar(10);
