import { readFile } from 'node:fs/promises';
import { createPool } from '@vercel/postgres';
if (process.env.ALLOW_PROTECTION_SCHEMA !== '1') throw new Error('Explicit additive schema opt-in required');
const pool = createPool({ connectionString: process.env.POSTGRES_URL });
const client = await pool.connect();
try {
  const before = await client.query('SELECT (SELECT count(*) FROM rooms) AS rooms, (SELECT count(*) FROM participants) AS participants');
  await client.query('BEGIN');
  await client.query(await readFile(new URL('./protections.sql', import.meta.url), 'utf8'));
  await client.query('COMMIT');
  const columns = await client.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('api_quota_windows','calculation_cache') ORDER BY table_name,ordinal_position");
  const quota = await client.query("SELECT scope,cardinality(reservations) AS reserved, max(stamp)+interval '24 hours' AS initial_block_until FROM api_quota_windows, unnest(reservations) stamp WHERE scope='tmap:summary' GROUP BY scope,reservations");
  const after = await client.query('SELECT (SELECT count(*) FROM rooms) AS rooms, (SELECT count(*) FROM participants) AS participants');
  const constraints = await client.query("SELECT table_name,constraint_type FROM information_schema.table_constraints WHERE table_schema='public' AND table_name IN ('api_quota_windows','calculation_cache') ORDER BY table_name,constraint_type");
  const operationalCounts = await client.query('SELECT (SELECT count(*) FROM api_quota_windows) AS quotas, (SELECT count(*) FROM calculation_cache) AS caches');
  console.log(JSON.stringify({ before: before.rows, after: after.rows, columns: columns.rows, constraints: constraints.rows, quota: quota.rows, operationalCounts: operationalCounts.rows }));
} catch (error) {
  await client.query('ROLLBACK');
  console.error(JSON.stringify({ failed: true, kind: error?.code ?? error?.name }));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
