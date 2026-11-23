// Opt-in controlled DB integration; all transit/provider fetches are forbidden.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool } from '@vercel/postgres';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

if (process.env.ALLOW_PROTECTION_DB_TEST !== '1') throw new Error('Explicit DB test opt-in required');
const pool = createPool({ connectionString: process.env.POSTGRES_URL });
const key = `test-protections:${randomUUID()}`;
let store;
try {
  ({ protectionStore: store } = await import('../src/lib/protections/store.ts'));
  await pool.query('INSERT INTO api_quota_windows (scope, reservations) VALUES ($1, ARRAY[]::timestamptz[])', [key]);
  const slots = await Promise.all(Array.from({ length: 24 }, () => store.reserve(key)));
  assert.equal(slots.filter(Boolean).length, 8);
  let rows = await pool.query('SELECT cardinality(reservations) AS count FROM api_quota_windows WHERE scope=$1', [key]);
  assert.equal(rows.rows[0].count, 8);
  // A rolling window expires each counted reservation, not a timezone guess.
  await pool.query("UPDATE api_quota_windows SET reservations=array_fill(clock_timestamp()-interval '24 hours 1 second',ARRAY[8]) WHERE scope=$1", [key]);
  assert.equal(await store.reserve(key), true);
  rows = await pool.query('SELECT cardinality(reservations) AS count FROM api_quota_windows WHERE scope=$1', [key]);
  assert.equal(rows.rows[0].count, 1);
  assert.equal(await store.acquire(key, 'fp', 'old'), true);
  assert.equal(await store.acquire(key, 'changed', 'new'), false);
  await pool.query("UPDATE calculation_cache SET lease_until=clock_timestamp()-interval '1 second' WHERE room_key=$1", [key]);
  assert.equal(await store.acquire(key, 'changed', 'new'), true);
  assert.equal(await store.isOwner(key, 'old'), false);
  assert.equal(await store.publish(key, 'fp', 'old', []), false);
  await store.release(key, 'old');
  assert.equal(await store.isOwner(key, 'new'), true);
  assert.equal(await store.publish(key, 'changed', 'new', []), true);
  assert.deepEqual(await store.read(key, 'changed'), []);
  assert.equal(await store.read(key, 'fp'), null);
  assert.equal(await store.acquire(key, 'changed', 'third'), false);
  await pool.query("UPDATE calculation_cache SET cache_until=clock_timestamp()-interval '1 second' WHERE room_key=$1", [key]);
  assert.equal(await store.read(key, 'changed'), null);
  assert.equal(await store.acquire(key, 'changed', 'third'), true);
  // Four independent Node processes contend against the same production SQL implementation.
  await pool.query('UPDATE api_quota_windows SET reservations=ARRAY[]::timestamptz[] WHERE scope=$1', [key]);
  const worker = `import { protectionStore as s } from './src/lib/protections/store.ts'; const outcomes=await Promise.all(Array.from({length:6},()=>s.reserve(process.env.TEST_QUOTA_SCOPE))); console.log(JSON.stringify(outcomes.filter(Boolean).length));`;
  const processes = await Promise.all(Array.from({ length: 4 }, () => exec(process.execPath,
    ['--conditions=react-server', '--import', './tests/register.mjs', '--input-type=module', '-e', worker],
    { cwd: process.cwd(), env: { ...process.env, TEST_QUOTA_SCOPE: key }, timeout: 30000 })));
  assert.equal(processes.reduce((sum, child) => sum + JSON.parse(child.stdout.trim()), 0), 8);
  rows = await pool.query('SELECT cardinality(reservations) AS count FROM api_quota_windows WHERE scope=$1', [key]);
  assert.equal(rows.rows[0].count, 8);

  // The real TMAP adapter counts successful and failed offline HTTP attempts in Neon.
  await pool.query('UPDATE api_quota_windows SET reservations=ARRAY[]::timestamptz[] WHERE scope=$1', [key]);
  const originalReserve = store.reserve;
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.TMAP_APP_KEY;
  const originalKakao = process.env.KAKAO_REST_API_KEY;
  const originalProvider = process.env.TRANSIT_PROVIDER;
  const databaseHost = new URL(process.env.POSTGRES_URL).hostname.replace('-pooler', '');
  // Neon serverless transforms the endpoint label to api.<region>; see installed driver's transformHost.
  const databaseApiHost = databaseHost.replace(/^[^.]+\./, 'api.');
  const isDatabaseRequest = (url) => [databaseHost, databaseApiHost].includes(new URL(String(url)).hostname.replace('-pooler', ''));
  let stubbedRequests = 0;
  try {
    store.reserve = () => originalReserve(key);
    process.env.TRANSIT_PROVIDER = 'tmap';
    globalThis.fetch = async (url, init) => {
      if (isDatabaseRequest(url)) return originalFetch(url, init);
      assert.equal(String(url), 'https://apis.openapi.sk.com/transit/routes/sub');
      stubbedRequests++;
      if (stubbedRequests === 1) return Response.json({ metaData: { plan: { itineraries: [{ totalTime: 1800 }] } } });
      throw new Error('Offline network failure');
    };
    const { getTransitMinutes } = await import('../src/lib/tmap/transit.ts');
    const origin = { lat: 37, lng: 127 }, destination = { lat: 38, lng: 128 };
    delete process.env.TMAP_APP_KEY;
    assert.equal(await getTransitMinutes(origin, destination), null);
    process.env.TMAP_APP_KEY = 'offline-test-key';
    assert.equal(await getTransitMinutes(origin, destination), 30);
    assert.equal(await getTransitMinutes(origin, destination), null);
    rows = await pool.query('SELECT cardinality(reservations) AS count FROM api_quota_windows WHERE scope=$1', [key]);
    assert.equal(rows.rows[0].count, 2);
    await pool.query('UPDATE api_quota_windows SET reservations=array_fill(clock_timestamp(),ARRAY[8]) WHERE scope=$1', [key]);
    assert.equal(await getTransitMinutes(origin, destination), null);
    assert.equal(stubbedRequests, 2);

    // Exercise actual candidate + transit/car pipeline with Neon cache/lock, offline HTTP only.
    await store.release(key, 'third');
    const owners = Array.from({ length: 12 }, () => randomUUID());
    const locks = await Promise.all(owners.map((token) => store.acquire(key, 'same-input', token)));
    assert.equal(locks.filter(Boolean).length, 1);
    const winner = owners[locks.findIndex(Boolean)];
    assert.equal(await store.isOwner(key, winner), true);
    await store.release(key, winner);
    const { protectedResults } = await import('../src/lib/protections/results.ts');
    const { calculationFingerprint } = await import('../src/lib/protections/results.ts');
    let localCalls = 0, carCalls = 0;
    process.env.KAKAO_REST_API_KEY = 'offline-kakao';
    globalThis.fetch = async (url, init) => {
      if (isDatabaseRequest(url)) return originalFetch(url, init);
      if (String(url).startsWith('https://dapi.kakao.com/')) {
        localCalls++;
        return Response.json({ documents: [1, 2, 3].map((n) => ({ place_name: `station${n}`, x: String(127 + n / 100), y: String(37 + n / 100) })) });
      }
      if (String(url).startsWith('https://apis-navi.kakaomobility.com/')) {
        carCalls++;
        return Response.json({ routes: [{ result_code: 0, summary: { duration: 1200 } }] });
      }
      throw Error('TMAP must be denied, all real network forbidden');
    };
    const participants = [
      { ...origin, id: 'a', name: 'A', addressLabel: 'x', transportMode: 'transit' },
      { ...destination, id: 'b', name: 'B', addressLabel: 'y', transportMode: 'car' },
    ];
    const first = await protectedResults(key, participants);
    assert.equal(first.status, 'ready');
    assert.equal(first.candidates[0].etas[0].estimateReason, 'quota');
    assert.equal(first.candidates[0].etas[1].estimated, false);
    assert.equal((await protectedResults(key, participants)).status, 'cached');
    assert.equal(localCalls, 1); assert.equal(carCalls, 3);
    assert.deepEqual(await store.read(key, calculationFingerprint(participants, 'tmap')), first.candidates);
    console.log(JSON.stringify({ offlinePipeline: 'passed', localStubCalls: localCalls, carStubCalls: carCalls, transitFetches: 0, repeatFetches: 0 }));
  } finally {
    store.reserve = originalReserve;
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TMAP_APP_KEY; else process.env.TMAP_APP_KEY = originalKey;
    if (originalKakao === undefined) delete process.env.KAKAO_REST_API_KEY; else process.env.KAKAO_REST_API_KEY = originalKakao;
    if (originalProvider === undefined) delete process.env.TRANSIT_PROVIDER; else process.env.TRANSIT_PROVIDER = originalProvider;
  }
  console.log(JSON.stringify({ concurrentReservations: 24, admitted: 8, processes: 4, processAdmitted: 8, realErrorCounting: 'passed', rollingExpiry: 'passed', cacheTTL: 'passed', staleOwnerFencing: 'passed', actualProviderRequests: 0 }));
  await pool.query('DELETE FROM api_quota_windows WHERE scope=$1', [key]);
  assert.equal(await store.reserve(key), false, 'unknown prior usage must bootstrap exhausted');
  rows = await pool.query('SELECT cardinality(reservations) AS count FROM api_quota_windows WHERE scope=$1', [key]);
  assert.equal(rows.rows[0].count, 8);
  console.log('Unknown-usage bootstrap read back: 8 reserved, no fetch');
} catch (error) {
  console.error(JSON.stringify({ failed: true, kind: error?.code ?? error?.name ?? 'Error', assertionLine: error?.stack?.split('\n').find((line) => line.includes('verify-protections-db.mjs')), actual: typeof error.actual === 'string' || typeof error.actual === 'number' ? error.actual : undefined, expected: typeof error.expected === 'string' || typeof error.expected === 'number' ? error.expected : undefined }));
  process.exitCode = 1;
} finally {
  if (store) {
    await pool.query('DELETE FROM calculation_cache WHERE room_key=$1', [key]);
    await pool.query('DELETE FROM api_quota_windows WHERE scope=$1', [key]);
    const check = await pool.query('SELECT (SELECT count(*) FROM calculation_cache WHERE room_key=$1)+(SELECT count(*) FROM api_quota_windows WHERE scope=$1) AS remaining', [key]);
    assert.equal(Number(check.rows[0].remaining), 0);
    console.log('Owned scratch rows removed and read back: 0');
  }
  await pool.end();
}
