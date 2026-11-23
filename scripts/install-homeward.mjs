import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPool } from '@vercel/postgres';
if (process.env.ALLOW_HOMEWARD_SCHEMA !== '1') throw Error('Explicit additive schema opt-in required');
const pool = createPool({ connectionString: process.env.POSTGRES_URL });
const client = await pool.connect();
try {
  const before = await client.query('SELECT id,room_id,name,address_label,lat,lng,transport_mode,created_at FROM participants ORDER BY id');
  const quota = await client.query('SELECT * FROM api_quota_windows ORDER BY scope');
  await client.query('BEGIN');
  await client.query(await readFile(new URL('./homeward.sql', import.meta.url), 'utf8'));
  await client.query('COMMIT');
  const after = await client.query('SELECT id,room_id,name,address_label,lat,lng,transport_mode,created_at FROM participants ORDER BY id');
  assert.deepEqual(after.rows, before.rows);
  assert.deepEqual((await client.query('SELECT * FROM api_quota_windows ORDER BY scope')).rows, quota.rows);
  const columns = await client.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='participants' AND column_name IN ('home_address_label','home_lat','home_lng','return_transport_mode') ORDER BY column_name");
  assert.equal(columns.rows.length, 4);
  assert.ok(columns.rows.every(c => c.is_nullable === 'YES'));
  console.log(JSON.stringify({ participantsPreserved: before.rows.length, quotaUnchanged: true, columns: columns.rows }));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(JSON.stringify({ failed: true, kind: error?.code ?? error?.name }));
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }
