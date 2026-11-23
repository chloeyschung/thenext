import "server-only";
import { sql } from "@vercel/postgres";
import type { RankedCandidate } from "@/types/domain";

export const CACHE_SECONDS = 600;
export const LEASE_SECONDS = 180;
export const TMAP_CAP = 8;
export const TMAP_SCOPE = "tmap:summary";

export interface ProtectionStore {
  reserve(scope?: string): Promise<boolean>;
  read(room: string, fingerprint: string): Promise<RankedCandidate[] | null>;
  acquire(room: string, fingerprint: string, owner: string): Promise<boolean>;
  isOwner(room: string, owner: string): Promise<boolean>;
  publish(room: string, fingerprint: string, owner: string, value: RankedCandidate[]): Promise<boolean>;
  release(room: string, owner: string): Promise<void>;
}

/** PostgreSQL evaluates the UPDATE predicate again under its row lock after contention.
 * Missing quota rows bootstrap EXHAUSTED: unknown prior usage must never become free budget.
 * No refund, including HTTP errors, timeouts, malformed responses and process crashes.
 */
export const protectionStore: ProtectionStore = {
  async reserve(scope = TMAP_SCOPE) {
    await sql`INSERT INTO api_quota_windows (scope, reservations)
      VALUES (${scope}, array_fill(clock_timestamp(), ARRAY[8])) ON CONFLICT DO NOTHING`;
    const result = await sql`UPDATE api_quota_windows SET reservations =
      ARRAY(SELECT stamp FROM unnest(reservations) stamp WHERE stamp > clock_timestamp() - interval '24 hours') || clock_timestamp()
      WHERE scope = ${scope} AND cardinality(ARRAY(
        SELECT stamp FROM unnest(reservations) stamp WHERE stamp > clock_timestamp() - interval '24 hours'
      )) < 8 RETURNING scope`;
    return result.rowCount === 1;
  },
  async read(room, fingerprint) {
    const result = await sql`SELECT payload FROM calculation_cache
      WHERE room_key=${room} AND fingerprint=${fingerprint} AND cache_until > clock_timestamp()`;
    return result.rows[0]?.payload ?? null;
  },
  async acquire(room, fingerprint, owner) {
    const result = await sql`INSERT INTO calculation_cache (room_key, owner, lease_until)
      VALUES (${room}, ${owner}, clock_timestamp() + interval '180 seconds')
      ON CONFLICT (room_key) DO UPDATE SET owner=EXCLUDED.owner, lease_until=EXCLUDED.lease_until,
        payload=NULL, cache_until=NULL, fingerprint=NULL
      WHERE (calculation_cache.owner IS NULL OR calculation_cache.lease_until <= clock_timestamp())
        AND NOT (calculation_cache.fingerprint IS NOT DISTINCT FROM ${fingerprint}
          AND calculation_cache.cache_until IS NOT NULL AND calculation_cache.cache_until > clock_timestamp())
      RETURNING room_key`;
    return result.rowCount === 1;
  },
  async isOwner(room, owner) {
    // An outbound request must have at least 10 seconds left; bounded fetches use 8 seconds.
    const result = await sql`SELECT room_key FROM calculation_cache WHERE room_key=${room}
      AND owner=${owner} AND lease_until > clock_timestamp() + interval '10 seconds'`;
    return result.rowCount === 1;
  },
  async publish(room, fingerprint, owner, value) {
    const result = await sql`UPDATE calculation_cache SET fingerprint=${fingerprint}, payload=${JSON.stringify(value)}::jsonb,
      cache_until=clock_timestamp() + interval '600 seconds', owner=NULL, lease_until=NULL
      WHERE room_key=${room} AND owner=${owner} AND lease_until > clock_timestamp() RETURNING room_key`;
    return result.rowCount === 1;
  },
  async release(room, owner) {
    await sql`UPDATE calculation_cache SET owner=NULL, lease_until=NULL WHERE room_key=${room} AND owner=${owner}`;
  },
};
