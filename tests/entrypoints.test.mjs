import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import { NextResponse } from 'next/server.js';
import { protectedResults } from '../src/lib/protections/results.ts';

const nativeRequire = createRequire(import.meta.url);
// Execute actual route/page bodies with offline module dependencies and TSX transpilation.
function load(file, deps) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(source, { exports, require: (id) => id in deps ? deps[id] : nativeRequire(id) });
  return exports;
}
const people = [
  { id: 'a', name: 'A', addressLabel: 'x', lat: 37, lng: 127, transportMode: 'car' },
  { id: 'b', name: 'B', addressLabel: 'y', lat: 38, lng: 128, transportMode: 'transit' },
];

test('API and server page execute the same protected pipeline; cached estimates and busy/DB errors surface', async () => {
  let cache = null;
  let owner = null;
  let computations = 0;
  let busy = false;
  let down = false;
  const store = {
    async read() { if (down) throw Error('offline DB failure'); return cache; },
    async acquire(_r, _f, token) { if (busy) return false; owner = token; return true; },
    async isOwner(_r, token) { return token === owner; },
    async publish(_r, _f, token, data) { if (token !== owner) return false; cache = data; return true; },
    async release() { owner = null; },
  };
  const compute = async () => { computations++; return [{ name: '역', lat: 37, lng: 127, source: 'station', etas: [{ participantId: 'b', participantName: 'B', transportMode: 'transit', minutes: 30, estimated: true, estimateReason: 'quota' }], maxMinutes: 30, totalMinutes: 30 }]; };
  const deps = {
    '@/lib/midpoint/compute': { computeMidpoint: () => { throw Error('Unprotected pipeline invoked'); } },
    '@/lib/db/queries': { getRoomBySlug: async () => ({ id: 'shared-room' }), listParticipants: async () => people },
    '@/lib/protections/results': { protectedResults: (room, participants) => protectedResults(room, participants, { store, compute }) },
    '@/components/CandidateCard': { CandidateCard: 'candidate-card' },
    '@/components/KakaoMap': { KakaoMap: 'kakao-map' },
    'next/link': { default: 'a' },
    'next/navigation': { notFound: () => { throw Error('404'); } },
    'next/server': { NextResponse },
  };
  const route = load('../src/app/api/rooms/[slug]/results/route.ts', deps);
  const page = load('../src/app/room/[slug]/results/page.tsx', deps);
  const params = Promise.resolve({ slug: 'room' });
  const response = await route.GET(new Request('http://localhost/api'), { params });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, 'ready');
  assert.match(data.message, /호출.*한도/);
  assert.equal(data.candidates[0].etas[0].estimated, true);
  assert.equal(data.candidates[0].etas[0].estimateReason, 'quota');
  const tree = await page.default({ params });
  assert.match(JSON.stringify(tree), /호출.*한도/);
  assert.equal(computations, 1, 'page must use the API-populated shared cache');
  cache = null; busy = true;
  assert.equal((await route.GET(new Request('http://localhost/api'), { params })).status, 409);
  assert.match(JSON.stringify(await page.default({ params })), /계산 중/);
  down = true;
  assert.equal((await route.GET(new Request('http://localhost/api'), { params })).status, 503);
  assert.match(JSON.stringify(await page.default({ params })), /사용할 수 없/);
  assert.equal(computations, 1);
});
