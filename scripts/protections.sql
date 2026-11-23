-- Additive only. Run explicitly with .env.local; never resets existing quota rows.
CREATE TABLE IF NOT EXISTS api_quota_windows (
  scope text PRIMARY KEY,
  reservations timestamptz[] NOT NULL
);
CREATE TABLE IF NOT EXISTS calculation_cache (
  room_key text PRIMARY KEY,
  fingerprint text,
  payload jsonb,
  cache_until timestamptz,
  owner text,
  lease_until timestamptz
);
-- Unknown earlier usage (~2 probes + 5 E2E on 2026-11-23): exhaust all 8 slots
-- for 24h from installation instead of asserting an exact provider remainder.
INSERT INTO api_quota_windows (scope, reservations)
VALUES ('tmap:summary', array_fill(clock_timestamp(), ARRAY[8])) ON CONFLICT DO NOTHING;
