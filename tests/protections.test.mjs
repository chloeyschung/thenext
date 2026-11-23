import assert from 'node:assert/strict';
import { test } from 'node:test';

const people = [
  { id: 'a', name: 'A', addressLabel: 'one', lat: 37, lng: 127, transportMode: 'transit' },
  { id: 'b', name: 'B', addressLabel: 'two', lat: 38, lng: 128, transportMode: 'car' },
];

test('fingerprint includes exact identities, origins, modes, labels and provider', async () => {
  const { calculationFingerprint } = await import('../src/lib/protections/results.ts');
  const base = calculationFingerprint(people, 'tmap');
  assert.equal(base, calculationFingerprint([...people].reverse(), 'tmap'));
  for (const patch of [{ id: 'x' }, { name: 'other' }, { addressLabel: 'new' }, { lat: 37.0000001 }, { lng: 127.0000001 }, { transportMode: 'car' }]) {
    assert.notEqual(base, calculationFingerprint([{ ...people[0], ...patch }, people[1]], 'tmap'));
  }
  assert.notEqual(base, calculationFingerprint(people, 'odsay'));
});

function memoryStore() {
  let row;
  let now = 0;
  return {
    advance(ms) { now += ms; },
    async reserve() { return true; },
    async read(room, fp) { return row?.room === room && row.fp === fp && row.until > now ? row.value : null; },
    async acquire(room, fp, owner) {
      if (row?.owner && row.lease > now) return false;
      if (await this.read(room, fp)) return false;
      row = { room, owner, lease: now + 180000 }; return true;
    },
    async isOwner(room, owner) { return row?.room === room && row.owner === owner && row.lease > now + 10000; },
    async publish(room, fp, owner, value) {
      if (row?.room !== room || row.owner !== owner || row.lease <= now) return false;
      row = { room, fp, value, until: now + 600000 }; return true;
    },
    async release(room, owner) { if (row?.room === room && row.owner === owner) row.owner = null; },
  };
}

const result = [{ name: 'station', lat: 37, lng: 127, source: 'station', etas: [{ participantId: 'a', participantName: 'A', transportMode: 'transit', minutes: 20, estimated: false }], maxMinutes: 20, totalMinutes: 20 }];

test('shared pipeline cache prevents all repeated computation; exact changes and TTL invalidate', async () => {
  const { protectedResults } = await import('../src/lib/protections/results.ts');
  const store = memoryStore();
  let computations = 0;
  const compute = async () => { computations++; return result; };
  const get = (p = people) => protectedResults('room', p, { store, compute });
  assert.equal((await get()).status, 'ready');
  assert.equal((await get()).status, 'cached');
  assert.equal(computations, 1);
  await get([{ ...people[0], lat: 37.1 }, people[1]]);
  assert.equal(computations, 2);
  store.advance(600001);
  await get([{ ...people[0], lat: 37.1 }, people[1]]);
  assert.equal(computations, 3);
});

test('same-room concurrent computation returns busy immediately, even with changed participants', async () => {
  const { protectedResults } = await import('../src/lib/protections/results.ts');
  const store = memoryStore();
  let finish;
  let started;
  const signal = new Promise((r) => { started = r; });
  const first = protectedResults('room', people, { store, compute: async () => { started(); return new Promise((r) => { finish = r; }); } });
  await signal;
  let unexpected = 0;
  const second = await protectedResults('room', [{ ...people[0], name: 'changed' }, people[1]], { store, compute: async () => { unexpected++; return result; } });
  assert.equal(second.status, 'busy');
  assert.equal(unexpected, 0);
  finish(result);
  assert.equal((await first).status, 'ready');
});

test('stale owner cannot publish or release a successor; DB failure does not compute', async () => {
  const { protectedResults } = await import('../src/lib/protections/results.ts');
  const store = memoryStore();
  let finish;
  let started;
  const signal = new Promise((r) => { started = r; });
  const first = protectedResults('room', people, { store, compute: async () => { started(); return new Promise((r) => { finish = r; }); } });
  await signal;
  store.advance(180001);
  assert.equal((await protectedResults('room', people, { store, compute: async () => result })).status, 'ready');
  finish([]);
  assert.equal((await first).status, 'busy');
  assert.deepEqual((await protectedResults('room', people, { store, compute: async () => { throw Error('must not run'); } })).candidates, result);
  assert.equal((await protectedResults('bad', people, { store: { ...store, read: async () => { throw Error('db'); } }, compute: async () => { throw Error('no external work'); } })).status, 'unavailable');
});

test('quota-denied estimates stay labeled on cache hits; expired owners cannot send outbound fetch', async (t) => {
  const { protectedResults } = await import('../src/lib/protections/results.ts');
  const { protectionStore } = await import('../src/lib/protections/store.ts');
  const { guardedFetch } = await import('../src/lib/protections/execution.ts');
  const store = memoryStore();
  const saved = process.env.TMAP_APP_KEY;
  process.env.TMAP_APP_KEY = 'offline-test';
  t.mock.method(protectionStore, 'reserve', async () => false);
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw Error('must not fetch'); });
  const { getTransitMinutes } = await import('../src/lib/tmap/transit.ts');
  const computed = await protectedResults('room', people, { store, compute: async () => {
    assert.equal(await getTransitMinutes(people[0], people[1]), null);
    return [{ ...result[0], etas: [{ ...result[0].etas[0], estimated: true }] }];
  } });
  assert.equal(computed.candidates[0].etas[0].estimateReason, 'quota');
  const hit = await protectedResults('room', people, { store, compute: async () => { throw Error('cache miss'); } });
  assert.equal(hit.status, 'cached');
  assert.equal(hit.candidates[0].etas[0].estimated, true);
  assert.equal(hit.candidates[0].etas[0].estimateReason, 'quota');
  assert.equal(fetch.mock.callCount(), 0);
  await protectedResults('expired', people, { store, compute: async () => {
    store.advance(180001);
    await assert.rejects(guardedFetch('https://offline.invalid'));
    return result;
  } });
  assert.equal(fetch.mock.callCount(), 0);
  if (saved === undefined) delete process.env.TMAP_APP_KEY; else process.env.TMAP_APP_KEY = saved;
});

test('Drizzle schema retains additive protection tables for future push', async () => {
  const { apiQuotaWindows, calculationCache } = await import('../src/lib/db/schema.ts');
  assert.ok(apiQuotaWindows, 'quota schema missing');
  assert.ok(calculationCache, 'cache schema missing');
});

export { people };
