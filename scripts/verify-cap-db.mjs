// Explicit opt-in; owned synthetic quota scope only, never provider traffic.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool } from '@vercel/postgres';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { protectionStore as store } from '../src/lib/protections/store.ts';
if (process.env.ALLOW_PROTECTION_DB_TEST !== '1') throw Error('Explicit DB opt-in required');
const pool = createPool({ connectionString: process.env.POSTGRES_URL });
const scope = `test-cap500:${randomUUID()}`;
const saved = process.env.TMAP_ROLLING_24H_CAP;
const count = async () => (await pool.query('SELECT cardinality(reservations) AS n FROM api_quota_windows WHERE scope=$1', [scope])).rows[0].n;
const seed = async (n) => pool.query('INSERT INTO api_quota_windows(scope,reservations) VALUES($1,array_fill(clock_timestamp(),ARRAY[$2::int])) ON CONFLICT(scope) DO UPDATE SET reservations=EXCLUDED.reservations', [scope,n]);
try {
  process.env.TMAP_ROLLING_24H_CAP = '500';
  await seed(499);
  const boundary = await Promise.all(Array.from({length:24}, () => store.reserve(scope)));
  assert.equal(boundary.filter(Boolean).length, 1, 'only reservation 500 may pass');
  assert.equal(await count(),500);
  await seed(8);
  const before = (await pool.query('SELECT reservations::text AS stamps FROM api_quota_windows WHERE scope=$1',[scope])).rows[0].stamps;
  assert.equal(await store.reserve(scope),true,'old saturated eight must admit remaining budget');
  assert.equal(await count(),9);
  const preserved = await pool.query('SELECT reservations[1:8]::text AS stamps FROM api_quota_windows WHERE scope=$1',[scope]);
  assert.equal(preserved.rows[0].stamps,before);
  process.env.TMAP_ROLLING_24H_CAP='8';
  assert.equal(await store.reserve(scope),false,'lower limit must not reset consumption');
  process.env.TMAP_ROLLING_24H_CAP='500';
  await seed(492);
  const worker = `import {protectionStore as s} from './src/lib/protections/store.ts'; console.log(JSON.stringify((await Promise.all(Array.from({length:6},()=>s.reserve(process.env.TEST_QUOTA_SCOPE)))).filter(Boolean).length));`;
  const outputs = await Promise.all(Array.from({length:4},()=>promisify(execFile)(process.execPath,['--conditions=react-server','--import','./tests/register.mjs','--input-type=module','-e',worker],{cwd:process.cwd(),env:{...process.env,TEST_QUOTA_SCOPE:scope},timeout:30000})));
  assert.equal(outputs.reduce((n,x)=>n+JSON.parse(x.stdout.trim()),0),8);
  assert.equal(await count(),500);
  await pool.query('DELETE FROM api_quota_windows WHERE scope=$1',[scope]);
  assert.equal(await store.reserve(scope),false,'unknown usage bootstraps exhausted at configured cap');
  assert.equal(await count(),500);
  console.log(JSON.stringify({cap:500,boundaryAdmitted:1,processes:4,concurrentAdmitted:8,oldEightPreserved:true,loweringDoesNotReset:true,unknownUsageExhausted:true,providerRequests:0}));
} finally {
  if(saved===undefined) delete process.env.TMAP_ROLLING_24H_CAP; else process.env.TMAP_ROLLING_24H_CAP=saved;
  await pool.query('DELETE FROM api_quota_windows WHERE scope=$1',[scope]);
  assert.equal(Number((await pool.query('SELECT count(*) AS n FROM api_quota_windows WHERE scope=$1',[scope])).rows[0].n),0);
  console.log('Owned cap-test scope cleanup read back: 0');
  await pool.end();
}
