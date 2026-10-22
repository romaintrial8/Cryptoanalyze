import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseText, parseRows } from '../src/domain/importers';
import { toCsv } from '../src/domain/exporters';
import { readXlsx } from '../src/data/files';
import type { Tx } from '../src/domain/types';

const fx = (f: string) => readFileSync(new URL('./fixtures/' + f, import.meta.url));

test('export CSV → import : opérations identiques', () => {
  const src = [...parseText(fx('coinbase_2025.csv').toString())!.txs, ...parseText(fx('binance_ledger.csv').toString())!.txs].map((t, i) => ({ ...t, id: 'x' + i })) as Tx[];
  const back = parseText(toCsv(src))!;
  assert.equal(back.txs.length, src.length);
  const strip = (t: Partial<Tx>) => JSON.stringify([t.date, t.kind, t.inLeg, t.outLeg, t.fee, t.usd, t.feeUsd, t.platform, t.incomeType, t.note]);
  const a = src.map(strip).sort(), b = back.txs.map(strip).sort();
  assert.deepEqual(b, a);
});

test('lecture d’un classeur Excel (historique des trades Binance)', async () => {
  const sheets = await readXlsx(fx('binance_trades.xlsx'));
  const r = parseRows(sheets[0])!;
  assert.equal(r.platform, 'Binance');
  assert.equal(r.txs.length, 2);
  assert.equal(r.txs[0].date, '2025-07-01T10:00:00Z');
  assert.deepEqual(r.txs[0].inLeg, { asset: 'BTC', qty: 0.001 });
});
