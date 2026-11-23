import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addParticipantSchema } from '../src/lib/validation.ts';
const legacy = { name: '검증', addressLabel: '출발', lat: 37.5, lng: 127, transportMode: 'transit' };

test('return inputs default to origin/mode and reject partial or invalid destinations', () => {
  const parsed = addParticipantSchema.parse(legacy);
  assert.equal(parsed.homeAddressLabel, legacy.addressLabel);
  assert.equal(parsed.homeLat, legacy.lat);
  assert.equal(parsed.homeLng, legacy.lng);
  assert.equal(parsed.returnTransportMode, legacy.transportMode);
  const home = { homeAddressLabel: '귀가', homeLat: 37.6, homeLng: 127.1, returnTransportMode: 'car' };
  assert.deepEqual(addParticipantSchema.parse({ ...legacy, ...home }), { ...legacy, ...home });
  for (const patch of [{ homeLat: 37.6 }, { homeAddressLabel: ' ' }, { ...home, homeLat: 90 }, { ...home, homeLng: 0 }, { returnTransportMode: 'walk' }, { ...home, homeLng: null }]) {
    assert.equal(addParticipantSchema.safeParse({ ...legacy, ...patch }).success, false);
  }
});

test('pipeline routes origin → candidate → home with independent modes and ranks roundtrip minimax', async (t) => {
  const { protectionStore } = await import('../src/lib/protections/store.ts');
  const { computeMidpoint } = await import('../src/lib/midpoint/compute.ts');
  process.env.TMAP_APP_KEY = 'offline'; process.env.KAKAO_REST_API_KEY = 'offline';
  t.mock.method(protectionStore, 'reserve', async () => true);
  const legs = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const target = new URL(url);
    if (target.hostname === 'dapi.kakao.com') return Response.json({ documents: [
      { place_name: 'A역', x: '127.01', y: '37.51' },
      { place_name: 'B역', x: '127.02', y: '37.52' },
      { place_name: 'C역', x: '127.03', y: '37.53' },
    ] });
    if (target.hostname === 'apis.openapi.sk.com') {
      const body = JSON.parse(options.body); legs.push(['transit', body]);
      assert.equal(body.startY, '37.5'); assert.equal(body.endY.startsWith('37.5'), true);
      return Response.json({ metaData: { plan: { itineraries: [{ totalTime: 600 }] } } });
    }
    assert.equal(target.hostname, 'apis-navi.kakaomobility.com');
    legs.push(['car', Object.fromEntries(target.searchParams)]);
    assert.equal(target.searchParams.get('destination'), '127.1,37.6');
    const origin = target.searchParams.get('origin');
    const duration = origin.startsWith('127.01,') ? 5400 : origin.startsWith('127.02,') ? 1200 : 1800;
    return Response.json({ routes: [{ result_code: 0, summary: { duration } }] });
  });
  const p = { ...legacy, id: 'a', homeAddressLabel: '귀가', homeLat: 37.6, homeLng: 127.1, returnTransportMode: 'car' };
  const result = await computeMidpoint([p]);
  assert.deepEqual(result.map(c => c.name), ['B역', 'C역', 'A역']);
  assert.equal(legs.length, 6);
  const eta = result[0].etas[0];
  assert.equal(eta.outbound.minutes, 10); assert.equal(eta.homeward.minutes, 20);
  assert.equal(eta.homeward.transportMode, 'car');
  assert.equal(eta.minutes, 30); assert.equal(eta.estimated, false);
  assert.equal(result[0].maxMinutes, 30);
});

test('legacy nullable home resolves to origin and return fields invalidate cached fingerprints', async () => {
  const { homewardPlan } = await import('../src/lib/homeward.ts');
  assert.deepEqual(homewardPlan({ ...legacy, homeAddressLabel: null, homeLat: null, homeLng: null, returnTransportMode: null }), {
    homeAddressLabel: '출발', homeLat: 37.5, homeLng: 127, returnTransportMode: 'transit',
  });
  const { calculationFingerprint } = await import('../src/lib/protections/results.ts');
  const base = { ...legacy, id: 'a' };
  const fp = calculationFingerprint([base], 'tmap');
  for (const patch of [{ homeAddressLabel: '다른집' }, { homeLat: 37.6 }, { homeLng: 127.1 }, { returnTransportMode: 'car' }]) {
    assert.notEqual(calculationFingerprint([{ ...base, ...patch }], 'tmap'), fp);
  }
});

test('each leg retains its own estimate reason without contaminating successful or failed sibling legs', async (t) => {
  const { computeMidpoint } = await import('../src/lib/midpoint/compute.ts');
  const { protectedResults } = await import('../src/lib/protections/results.ts');
  const { protectionStore } = await import('../src/lib/protections/store.ts');
  process.env.TMAP_APP_KEY = 'offline'; process.env.KAKAO_REST_API_KEY = 'offline';
  let reservations = 0;
  t.mock.method(protectionStore, 'reserve', async () => ++reservations === 1);
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).includes('dapi.kakao.com')) return Response.json({ documents: [{ place_name: '단일역', x: '127.01', y: '37.51' }] });
    return Response.json({ metaData: { plan: { itineraries: [{ totalTime: 600 }] } } });
  });
  let cached;
  const store = { read: async () => cached ?? null, acquire: async () => true, isOwner: async () => true, publish: async (_r, _f, _o, value) => { cached = value; return true; }, release: async () => {} };
  const first = await protectedResults('r', [{ ...legacy, id: 'a' }], { store, compute: computeMidpoint });
  const eta = first.candidates[0].etas[0];
  assert.equal(eta.outbound.estimated, false);
  assert.equal(eta.outbound.estimateReason, undefined);
  assert.equal(eta.homeward.estimated, true);
  assert.equal(eta.homeward.estimateReason, 'quota');
  assert.equal(eta.estimated, true); assert.equal(eta.estimateReason, 'quota');
  const hit = await protectedResults('r', [{ ...legacy, id: 'a' }], { store, compute: computeMidpoint });
  assert.equal(hit.status, 'cached'); assert.deepEqual(hit.candidates, first.candidates);
  assert.match(hit.message, /한도/);
  t.mock.method(protectionStore, 'reserve', async () => { throw Error('offline DB down'); });
  const down = await computeMidpoint([{ ...legacy, id: 'a', transportMode: 'car', returnTransportMode: 'transit' }]);
  assert.equal(down[0].etas[0].homeward.estimateReason, 'protection-unavailable');
  assert.equal(down[0].etas[0].outbound.estimateReason, 'route-unavailable');
});

test('additive nullable DB home columns and legacy/new row normalization preserve participants', async () => {
  const { getTableConfig } = await import('drizzle-orm/pg-core');
  const { participants } = await import('../src/lib/db/schema.ts');
  const columns = getTableConfig(participants).columns;
  for (const name of ['home_address_label', 'home_lat', 'home_lng', 'return_transport_mode']) {
    const column = columns.find(c => c.name === name);
    assert.ok(column, name); assert.equal(column.notNull, false);
  }
  const { toParticipant } = await import('../src/lib/db/queries.ts');
  const row = { ...legacy, id: 'a', homeAddressLabel: null, homeLat: null, homeLng: null, returnTransportMode: null };
  assert.equal(toParticipant(row).homeLat, row.lat);
  assert.equal(toParticipant(row).returnTransportMode, row.transportMode);
  const explicit = { ...row, homeAddressLabel: '귀가', homeLat: 37.6, homeLng: 127.1, returnTransportMode: 'car' };
  const mapped = toParticipant(explicit);
  assert.equal(mapped.homeAddressLabel, '귀가'); assert.equal(mapped.homeLat, 37.6);
  assert.equal(mapped.homeLng, 127.1); assert.equal(mapped.returnTransportMode, 'car');
});

test('candidate search center includes both origins and home destinations', async (t) => {
  const { computeMidpoint } = await import('../src/lib/midpoint/compute.ts');
  delete process.env.TMAP_APP_KEY; process.env.KAKAO_REST_API_KEY = 'offline';
  let center;
  t.mock.method(globalThis, 'fetch', async url => {
    const target = new URL(url);
    assert.equal(target.hostname, 'dapi.kakao.com');
    center = { lat: Number(target.searchParams.get('y')), lng: Number(target.searchParams.get('x')) };
    return Response.json({ documents: [{ place_name: 'A역', x: '127', y: '37.5' }, { place_name: 'B역', x: '127.01', y: '37.51' }, { place_name: 'C역', x: '127.02', y: '37.52' }] });
  });
  await computeMidpoint([{ ...legacy, id: 'a', homeAddressLabel: '집', homeLat: 37.7, homeLng: 127.2 }]);
  assert.ok(Math.abs(center.lat - 37.6) < 0.000001); assert.ok(Math.abs(center.lng - 127.1) < 0.000001);
});

test('ranking minimizes worst personal roundtrip rather than outbound or group sum, then group total on ties', async () => {
  const { rankCandidates } = await import('../src/lib/midpoint/score.ts');
  const make = (name, minutes) => ({ candidate: { name }, etas: minutes.map((m, i) => ({ participantId: String(i), minutes: m })) });
  const ranked = rankCandidates([make('outbound-fast-home-slow', [100, 10]), make('fair', [60, 60]), make('tie-winner', [60, 50])], 3);
  assert.deepEqual(ranked.map(c => c.name), ['tie-winner', 'fair', 'outbound-fast-home-slow']);
  assert.deepEqual(ranked.map(c => [c.maxMinutes, c.totalMinutes]), [[60, 110], [60, 120], [100, 110]]);
});

test('100 possible roundtrip legs retain concurrency five and shared reservation gate limits offline HTTP to eight', async (t) => {
  const { computeMidpoint } = await import('../src/lib/midpoint/compute.ts');
  const { protectionStore } = await import('../src/lib/protections/store.ts');
  process.env.TMAP_APP_KEY = 'offline'; process.env.KAKAO_REST_API_KEY = 'offline';
  let attempts = 0; let active = 0; let peak = 0; let requests = 0;
  t.mock.method(protectionStore, 'reserve', async () => ++attempts <= 8);
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).includes('dapi.kakao.com')) return Response.json({ documents: Array.from({ length: 5 }, (_, i) => ({ place_name: `예산${i}역`, x: String(127 + i / 100), y: String(37.5 + i / 100) })) });
    assert.equal(String(url), 'https://apis.openapi.sk.com/transit/routes/sub');
    requests++; active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2)); active--;
    return Response.json({ metaData: { plan: { itineraries: [{ totalTime: 600 }] } } });
  });
  const ranked = await computeMidpoint(Array.from({ length: 10 }, (_, i) => ({ ...legacy, id: String(i) })));
  assert.equal(attempts, 100); assert.equal(requests, 8); assert.ok(peak <= 5);
  assert.equal(ranked.length, 3);
  for (const candidate of ranked) for (const eta of candidate.etas) {
    assert.equal(eta.minutes, eta.outbound.minutes + eta.homeward.minutes);
    assert.equal(eta.estimated, eta.outbound.estimated || eta.homeward.estimated);
  }
});
