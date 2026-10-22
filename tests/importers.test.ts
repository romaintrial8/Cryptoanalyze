import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseText, parseCsv, parseAmount, parseDate, amountWithAsset, GENERIC_HEADER } from '../src/domain/importers';

const fx = (f: string) => readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');

test('outils : montants, dates, CSV', () => {
  assert.equal(parseAmount('$1,234.56'), 1234.56);
  assert.equal(parseAmount('-$12.00'), -12);
  assert.equal(parseAmount('1.2E-7'), 1.2e-7);
  assert.equal(parseAmount('0,5'), 0.5);
  assert.equal(parseAmount('1,000'), 1000);
  assert.equal(parseAmount('1 234,5'), 1234.5);
  assert.ok(isNaN(parseAmount('')));
  assert.equal(parseDate('2025-01-01 15:00:00 UTC'), '2025-01-01T15:00:00Z');
  assert.equal(parseDate('2023-01-10T14:00:00Z'), '2023-01-10T14:00:00Z');
  assert.equal(parseDate('2025-01-01T12:00:00+02:00'), '2025-01-01T10:00:00Z');
  assert.equal(parseDate('25-07-01 10:00:00'), '2025-07-01T10:00:00Z');
  assert.equal(parseDate('45658'), '2025-01-01T00:00:00Z'); // numéro de série Excel
  assert.equal(parseDate('07/09/2026 14:05'), '2026-09-07T14:05:00Z');
  assert.deepEqual(amountWithAsset('0.00100000BTC'), { qty: 0.001, asset: 'BTC' });
  assert.deepEqual(parseCsv('a;b\n"x;1";2\n'), [['a', 'b'], ['x;1', '2']]);
});

test('Coinbase (format 2024+)', () => {
  const r = parseText(fx('coinbase_2025.csv'))!;
  assert.equal(r.platform, 'Coinbase');
  assert.equal(r.rows, 10);
  assert.equal(r.ignored, 1); // Retail Staking Transfer
  assert.deepEqual(r.unknown, { 'Mystery Type': 1 });
  const kinds = r.txs.map((t) => t.kind);
  assert.deepEqual(kinds, ['cash_in', 'trade', 'trade', 'trade', 'trade', 'transfer_out', 'income', 'income']);
  const buy = r.txs[1];
  assert.deepEqual(buy.inLeg, { asset: 'BTC', qty: 0.01 });
  assert.deepEqual(buy.outLeg, { asset: 'USD', qty: 600 });
  assert.deepEqual(buy.fee, { asset: 'USD', qty: 10 });
  assert.equal(buy.usd, 600);
  const sell = r.txs[3];
  assert.deepEqual(sell.outLeg, { asset: 'BTC', qty: 0.005 });
  assert.deepEqual(sell.inLeg, { asset: 'USD', qty: 500 });
  const conv = r.txs[4];
  assert.deepEqual(conv.inLeg, { asset: 'ETH', qty: 0.2 });
  assert.equal(conv.usd, 450);
  assert.equal(r.txs[7].incomeType, 'reward');
  // empreintes uniques
  assert.equal(new Set(r.txs.map((t) => t.key)).size, r.txs.length);
});

test('Coinbase (ancien format, Advanced Trade en USDC)', () => {
  const r = parseText(fx('coinbase_old.csv'))!;
  assert.equal(r.txs.length, 3);
  const adv = r.txs[1];
  assert.deepEqual(adv.outLeg, { asset: 'USDC', qty: 40 });
  assert.deepEqual(adv.fee, { asset: 'USDC', qty: 0.24 });
  assert.equal(adv.usd, 40);
  assert.equal(r.txs[2].kind, 'income');
});

test('Binance – historique des transactions', () => {
  const r = parseText(fx('binance_ledger.csv'))!;
  assert.equal(r.platform, 'Binance');
  assert.equal(r.ignored, 2); // souscription Simple Earn (2 lignes)
  assert.deepEqual(r.unknown, { 'Futures Weird Op': 1 });
  const trade = r.txs.find((t) => t.kind === 'trade' && t.inLeg?.asset === 'SOL')!;
  assert.deepEqual(trade.outLeg, { asset: 'USDT', qty: 1000 });
  assert.deepEqual(trade.inLeg, { asset: 'SOL', qty: 10 });
  assert.deepEqual(trade.fee, { asset: 'SOL', qty: 0.01 });
  const eth = r.txs.find((t) => t.inLeg?.asset === 'ETH')!;
  assert.deepEqual(eth.outLeg, { asset: 'EUR', qty: 200 });
  assert.deepEqual(eth.fee, { asset: 'BNB', qty: 0.0005 });
  assert.equal(r.txs.filter((t) => t.kind === 'income').length, 1);
  assert.equal(r.txs.filter((t) => t.kind === 'cash_in').length, 1);
});

test('Binance – historique des trades (2 formats)', () => {
  const a = parseText(fx('binance_trades.csv'))!;
  assert.equal(a.txs.length, 2);
  assert.deepEqual(a.txs[0].inLeg, { asset: 'BTC', qty: 0.001 });
  assert.deepEqual(a.txs[0].outLeg, { asset: 'USDT', qty: 100 });
  assert.deepEqual(a.txs[1].outLeg, { asset: 'ETH', qty: 0.05 });
  assert.deepEqual(a.txs[1].inLeg, { asset: 'BTC', qty: 0.0015 });
  const b = parseText(fx('binance_trades_v2.csv'))!;
  assert.deepEqual(b.txs[0].inLeg, { asset: 'SOL', qty: 2 });
  assert.deepEqual(b.txs[0].outLeg, { asset: 'USDC', qty: 300 });
  assert.deepEqual(b.txs[0].fee, { asset: 'SOL', qty: 0.002 });
});

test('Kraken – ledgers', () => {
  const csv = [
    '"txid","refid","time","type","subtype","aclass","asset","amount","fee","balance"',
    '"L1","R1","2025-01-01 10:00:00","deposit","","currency","ZEUR","500.0000","0.0000","500"',
    '"L2","T1","2025-01-02 10:00:00","trade","","currency","ZEUR","-300.0000","0.0000","200"',
    '"L3","T1","2025-01-02 10:00:00","trade","","currency","XXBT","0.0050000000","0.0000100000","0.005"',
    '"L4","S1","2025-01-03 10:00:00","staking","","currency","DOT.S","0.1000","0","0.1"',
    '"L5","X1","2025-01-04 10:00:00","transfer","spottostaking","currency","DOT","-5","0","0"',
  ].join('\n');
  const r = parseText(csv)!;
  assert.equal(r.platform, 'Kraken');
  const t = r.txs.find((x) => x.kind === 'trade')!;
  assert.deepEqual(t.inLeg, { asset: 'BTC', qty: 0.005 });
  assert.deepEqual(t.outLeg, { asset: 'EUR', qty: 300 });
  assert.deepEqual(t.fee, { asset: 'BTC', qty: 0.00001 });
  assert.deepEqual(r.txs.find((x) => x.kind === 'income')!.inLeg, { asset: 'DOT', qty: 0.1 });
  assert.equal(r.ignored, 1);
});

test('CSV générique : lecture', () => {
  const csv = GENERIC_HEADER.join(',') + '\n2025-03-01 10:00:00,trade,BTC,0.01,USD,900,USD,2,900,2,Ledger,,achat\n';
  const r = parseText(csv)!;
  assert.equal(r.platform, 'Ledger');
  assert.equal(r.txs[0].usd, 900);
  assert.deepEqual(r.txs[0].fee, { asset: 'USD', qty: 2 });
});

test('fichier inconnu : null', () => {
  assert.equal(parseText('foo,bar\n1,2'), null);
});
