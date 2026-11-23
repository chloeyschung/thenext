import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTmapCap } from '../src/lib/protections/store.ts';
import { calculationFingerprint } from '../src/lib/protections/results.ts';

test('TMAP budget upgrade invalidates quota-denied cache without changing ODsay cache identity', () => {
  const saved = process.env.TMAP_ROLLING_24H_CAP;
  try {
    process.env.TMAP_ROLLING_24H_CAP = '8';
    const low = calculationFingerprint([], 'tmap');
    const odsay = calculationFingerprint([], 'odsay');
    process.env.TMAP_ROLLING_24H_CAP = '500';
    assert.notEqual(calculationFingerprint([], 'tmap'), low);
    assert.equal(calculationFingerprint([], 'odsay'), odsay);
    assert.equal(calculationFingerprint([], 'tmap'), calculationFingerprint([], 'tmap'));
  } finally {
    if (saved === undefined) delete process.env.TMAP_ROLLING_24H_CAP; else process.env.TMAP_ROLLING_24H_CAP = saved;
  }
});

test('TMAP rolling budget defaults conservatively and accepts only authorized integer range', () => {
  assert.equal(getTmapCap(undefined), 8);
  for (const invalid of ['', '0', '-1', '501', 'Infinity', '500.5', '5e2', ' 500 ']) assert.equal(getTmapCap(invalid), 8);
  assert.equal(getTmapCap('500'), 500);
  assert.equal(getTmapCap('1'), 1);
});
