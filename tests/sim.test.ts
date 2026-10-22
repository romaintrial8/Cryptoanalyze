import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dcaBacktest, projection } from '../src/domain/sim';

test('DCA : 3 achats de 100 $ à 100, 50 et 200 $', () => {
  const h: [string, number][] = [['2026-08-01', 100], ['2026-09-01', 50], ['2026-10-01', 200]];
  const r = dcaBacktest(h, 100, 3, '2026-10-01')!;
  assert.equal(r.buys, 3);
  assert.equal(r.invested, 300);
  const units = 1 + 2 + 0.5;
  assert.ok(Math.abs(r.units - units) < 1e-9);
  assert.ok(Math.abs(r.value - units * 200) < 1e-9);
  assert.ok(Math.abs(r.avgPrice - 300 / units) < 1e-9);
  assert.ok(Math.abs(r.lumpValue - 600) < 1e-9); // 300 $ à 100 $ → 3 unités → 600 $
});

test('projection : sans versement, 10 %/an pendant 2 ans', () => {
  const p = projection(1000, 0, 2, 0.1);
  assert.ok(Math.abs(p[2].value - 1210) < 1e-6);
  assert.equal(p[2].deposited, 1000);
});
