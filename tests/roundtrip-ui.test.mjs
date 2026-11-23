import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import { NextResponse } from 'next/server.js';
import { addParticipantSchema } from '../src/lib/validation.ts';
const nativeRequire = createRequire(import.meta.url);
function load(file, deps = {}, globals = {}) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(source, { exports, require: (id) => id in deps ? deps[id] : nativeRequire(id), ...globals });
  return exports;
}
function elements(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node.type === 'function') return elements(node.type(node.props));
  return [node, ...elements(node.props?.children)];
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (typeof node.type === 'function') return text(node.type(node.props));
  return text(node.props?.children);
}

test('join form defaults home/mode, supports separate searchable home and independently editable return mode', async () => {
  const states = []; let cursor = 0; let sent; let pushed;
  const { JoinForm } = load('../src/components/JoinForm.tsx', {
    react: { useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], v => { states[i] = v; }]; } },
    'next/navigation': { useRouter: () => ({ push: path => { pushed = path; } }) },
    '@/components/AddressSearchInput': { AddressSearchInput: 'address-search' },
    '@/components/TransportModeToggle': { TransportModeToggle: 'transport-toggle' },
  }, { fetch: async (_url, options) => { sent = JSON.parse(options.body); return { ok: true }; } });
  const render = () => { cursor = 0; return JoinForm({ slug: 'test' }); };
  let tree = render();
  assert.match(text(tree), /귀가지/); assert.match(text(tree), /갈 때 이동수단/); assert.match(text(tree), /돌아올 때 이동수단/);
  const nodes = () => elements(tree);
  assert.equal(nodes().find(n => n.props.type === 'submit').props.disabled, true);
  nodes().find(n => n.props.type === 'text').props.onChange({ target: { value: '검증' } });
  nodes().find(n => n.type === 'address-search').props.onChange({ label: '출발', lat: 37.5, lng: 127, detail: '' });
  tree = render();
  await tree.props.onSubmit({ preventDefault() {} });
  assert.equal(sent.homeAddressLabel, '출발'); assert.equal(sent.homeLat, 37.5); assert.equal(sent.returnTransportMode, 'transit');
  assert.equal(pushed, '/room/test');
  // Reset in-flight state by mounting a fresh form, then exercise alternate destination.
  states.length = 0; tree = render();
  nodes().find(n => n.props.type === 'text').props.onChange({ target: { value: '별도' } });
  nodes().find(n => n.type === 'address-search').props.onChange({ label: '출발', lat: 37.5, lng: 127, detail: '' });
  nodes().find(n => n.props.type === 'checkbox').props.onChange({ target: { checked: false } });
  tree = render();
  assert.equal(nodes().find(n => n.props.type === 'submit').props.disabled, true);
  nodes().filter(n => n.type === 'address-search')[1].props.onChange({ label: '귀가', lat: 37.6, lng: 127.1, detail: '' });
  nodes().filter(n => n.type === 'transport-toggle')[1].props.onChange('car');
  tree = render();
  assert.equal(nodes().find(n => n.props.type === 'submit').props.disabled, false);
  await tree.props.onSubmit({ preventDefault() {} });
  assert.equal(sent.homeAddressLabel, '귀가'); assert.equal(sent.homeLng, 127.1);
  assert.equal(sent.transportMode, 'transit'); assert.equal(sent.returnTransportMode, 'car');
});

test('result card shows leg minutes, modes, reasons and accurate combined estimate', () => {
  const { CandidateCard } = load('../src/components/CandidateCard.tsx');
  const eta = { participantId: 'a', participantName: '검증', transportMode: 'car', minutes: 35, estimated: true,
    outbound: { transportMode: 'car', minutes: 10, estimated: false },
    homeward: { transportMode: 'transit', minutes: 25, estimated: true, estimateReason: 'quota' } };
  const shown = text(CandidateCard({ rank: 1, candidate: { name: '검증역', maxMinutes: 35, totalMinutes: 35, etas: [eta] } }));
  assert.match(shown, /갈 때.*10분/); assert.match(shown, /돌아올 때.*25분.*한도/);
  assert.match(shown, /합계.*35분.*추정/); assert.match(shown, /자동차/); assert.match(shown, /대중교통/);
});

test('participant POST validates and forwards every home field; legacy request normalized and room GET returns persisted fields', async () => {
  const saved = [];
  const queries = { getRoomBySlug: async () => ({ id: 'r', slug: 'test', name: null, createdAt: new Date() }),
    addParticipant: async input => { saved.push(input); return { ...input, id: 'p' }; }, listParticipants: async () => saved };
  const deps = { '@/lib/db/queries': queries, '@/lib/validation': { addParticipantSchema }, 'next/server': { NextResponse } };
  const { POST } = load('../src/app/api/rooms/[slug]/participants/route.ts', deps);
  const params = Promise.resolve({ slug: 'test' });
  const base = { name: '검증', addressLabel: '출발', lat: 37.5, lng: 127, transportMode: 'transit' };
  const home = { homeAddressLabel: '귀가', homeLat: 37.6, homeLng: 127.1, returnTransportMode: 'car' };
  const post = body => POST(new Request('https://local/api', { method: 'POST', body: JSON.stringify(body) }), { params });
  assert.equal((await post({ ...base, ...home })).status, 201);
  for (const key of Object.keys(home)) assert.equal(saved[0][key], home[key]);
  assert.equal((await post(base)).status, 201); assert.equal(saved[1].homeLat, base.lat);
  assert.equal((await post({ ...base, homeLat: 37.6 })).status, 400); assert.equal(saved.length, 2);
  const { GET } = load('../src/app/api/rooms/[slug]/route.ts', deps);
  const data = await (await GET(new Request('https://local/api'), { params })).json();
  assert.equal(data.participants[0].homeAddressLabel, home.homeAddressLabel);
  assert.equal(data.participants[0].returnTransportMode, 'car');
});

test('room lists separate home and modes and results explain roundtrip minimax without timetable prediction', async () => {
  const participant = { id: 'a', name: '검증', addressLabel: '출발', transportMode: 'car', homeAddressLabel: '귀가', returnTransportMode: 'transit' };
  const deps = { 'next/link': { default: 'a' }, 'next/navigation': { notFound: () => { throw Error('404'); } },
    '@/lib/db/queries': { getRoomBySlug: async () => ({ id: 'r', name: '검증' }), listParticipants: async () => [participant, { ...participant, id: 'b' }] },
    '@/components/ShareLink': { ShareLink: 'share' }, '@/components/KakaoMap': { KakaoMap: 'map' }, '@/components/CandidateCard': { CandidateCard: 'candidate' },
    '@/lib/protections/results': { protectedResults: async () => ({ status: 'ready', candidates: [] }) } };
  const params = Promise.resolve({ slug: 'test' });
  const room = text(await load('../src/app/room/[slug]/page.tsx', deps).default({ params }));
  assert.match(room, /갈 때.*출발/); assert.match(room, /돌아올 때.*귀가/);
  const results = text(await load('../src/app/room/[slug]/results/page.tsx', deps).default({ params }));
  assert.match(results, /왕복/); assert.match(results, /동점.*합/); assert.match(results, /실제 출발시각.*예측하지/);
});
