// Contrat chiffré du moteur de calcul : valeurs vérifiées à la main (voir commentaires).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseText } from '../src/domain/importers';
import { runLedger, computePositions, computeSummary, xirr, fxRate, dailySeries, pairTransfers, txCategory } from '../src/domain/calc';
import type { Tx } from '../src/domain/types';

const fx = (f: string) => readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

function load(...files: string[]): Tx[] {
  const all: Tx[] = [];
  let n = 0;
  for (const f of files) for (const t of parseText(fx(f))!.txs) all.push({ ...t, id: 'tx' + n++ });
  return all;
}

const PRICES: Record<string, number> = { BTC: 100000, ETH: 3000, SOL: 150, GRT: 0.2, BNB: 600 };
const quote = (a: string) => (PRICES[a] ? { usd: PRICES[a], change24h: 0.01 } : null);

test('PRU, plus-values réalisées, conversion, transfert rapproché (Coinbase + Binance)', () => {
  const txs = load('coinbase_2025.csv', 'binance_ledger.csv');
  const led = runLedger(txs, {});
  const pos = computePositions(led, quote);
  const by = (a: string) => pos.find((p) => p.asset === a)!;

  // BTC : 0,01 à 610 $ + 0,01 à 810 $ → 0,02 pour 1 420 $ ; vente de 0,005 (coût 355) ; conversion de 0,005 (coût 355) ;
  // envoi de 0,01 (coût 710) vers Binance où 0,0099 arrivent : 702,90 $ suivent les jetons, 7,10 $ de frais de réseau.
  close(by('BTC').qty, 0.0099);
  close(by('BTC').cost, 702.9);
  close(by('BTC').realized, 140 + 95); // (495 − 355) + (450 − 355)
  assert.deepEqual(Object.keys(by('BTC').platforms), ['Binance']);

  // ETH : 0,2 (450 $, conversion) + 0,01 staking (30 $) + 0,1 achetés 200 € (taux de secours 1,10 → 220 $)
  close(by('ETH').qty, 0.31);
  close(by('ETH').cost, 700);
  close(by('ETH').income, 30);

  // SOL : 10 achetés 1 000 USDT, 0,01 SOL de frais, + 0,02 d'intérêts sans prix dans l'export :
  // valorisés au prix de l'achat de la semaine précédente (100 $) → 2 $
  close(by('SOL').qty, 10.01);
  close(by('SOL').cost, 1002);
  close(by('SOL').pru, 1002 / 10.01);

  const s = computeSummary(led, pos, txs.length, '2025-12-31');
  close(s.fiatSpent, 610 + 810 + 220);
  close(s.fiatReceived, 495);
  close(s.unmatchedIn, 1000); // 1 000 USDT déposés sans envoi correspondant
  close(s.capital, 1640 - 495 + 1000);
  close(s.realized, 235);
  close(s.income, 33.5); // 30 $ ETH + 1,50 $ GRT + 2 $ SOL estimés
  close(s.fees, 10 + 10 + 5 + 7.1 + 1); // 1 $ = 0,01 SOL sur un achat de 10 SOL à 1 000 $
  const value = 0.0099 * 100000 + 0.31 * 3000 + 10.01 * 150 + 10 * 0.2 + 0.0005 * 600;
  close(s.value, value);
  close(s.gain, value - 2145);
  // SHIB converti en BNB sans jamais avoir été acquis : historique incomplet signalé
  assert.ok(s.warnings.some((w) => w.startsWith('SHIB')));
});

test('identité : gain = latente + réalisée + revenus − frais perdus', () => {
  const txs = load('coinbase_2025.csv');
  const led = runLedger(txs, {});
  const pos = computePositions(led, quote);
  const s = computeSummary(led, pos, txs.length, '2025-12-31');
  // sans le dépôt Binance, l'envoi de BTC sort du portefeuille au coût de 710 $
  close(s.unmatchedOut, 710);
  close(s.gain, s.unrealized + s.realized + s.income);
});

test('échange crypto ↔ crypto sans valeur connue : coût reporté, aucune plus-value', () => {
  const txs: Tx[] = [
    { id: 'a', date: '2025-01-01T00:00:00Z', kind: 'trade', outLeg: { asset: 'USD', qty: 1000 }, inLeg: { asset: 'ETH', qty: 1 }, platform: 'X' },
    { id: 'b', date: '2025-02-01T00:00:00Z', kind: 'trade', outLeg: { asset: 'ETH', qty: 0.5 }, inLeg: { asset: 'LINK', qty: 100 }, platform: 'X' },
  ];
  const led = runLedger(txs, {});
  const pos = computePositions(led, () => null);
  const link = pos.find((p) => p.asset === 'LINK')!;
  close(link.cost, 500);
  assert.equal(link.costEstimated, true);
  close(pos.find((p) => p.asset === 'ETH')!.realized, 0);
  assert.equal(led.info.get('b')!.estimated, true);
});

test('vente plus grande que le solde : plafonnée et signalée', () => {
  const txs: Tx[] = [
    { id: 'a', date: '2025-01-01T00:00:00Z', kind: 'trade', outLeg: { asset: 'USD', qty: 100 }, inLeg: { asset: 'ADA', qty: 100 }, platform: 'X' },
    { id: 'b', date: '2025-02-01T00:00:00Z', kind: 'trade', outLeg: { asset: 'ADA', qty: 150 }, inLeg: { asset: 'USD', qty: 120 }, platform: 'X' },
  ];
  const led = runLedger(txs, {});
  assert.equal(led.assets.get('ADA')!.qty, 0);
  // 100 ADA connus (coût 100) + 50 inconnus valorisés au prix de vente (40 $) : produit 120 − coût 140 → −20
  close(led.realized, -20);
  assert.equal(led.warnings.length, 1);
});

test('stablecoin dépensé sans historique : pas de plus-value fantôme', () => {
  const txs: Tx[] = [{ id: 'a', date: '2025-01-01T00:00:00Z', kind: 'trade', outLeg: { asset: 'USDC', qty: 40 }, inLeg: { asset: 'SOL', qty: 2 }, platform: 'X' }];
  const led = runLedger(txs, {});
  close(led.realized, 0);
  close(led.assets.get('SOL')!.cost, 40);
});

test('achat et envoi à la même seconde : l’achat passe d’abord', () => {
  const d = '2026-01-01T10:00:00Z';
  const txs: Tx[] = [
    { id: 'o', date: d, kind: 'transfer_out', outLeg: { asset: 'BTC', qty: 0.5 }, platform: 'A' },
    { id: 'b', date: d, kind: 'trade', outLeg: { asset: 'USD', qty: 1000 }, inLeg: { asset: 'BTC', qty: 1 }, platform: 'A' },
    { id: 'i', date: '2026-01-01T10:01:00Z', kind: 'transfer_in', inLeg: { asset: 'BTC', qty: 0.5 }, platform: 'B' },
  ];
  const led = runLedger(txs, {});
  close(led.assets.get('BTC')!.qty, 1);
  close(led.assets.get('BTC')!.cost, 1000);
  assert.equal(led.warnings.length, 0);
});

test('rapprochement des transferts : quantité et délai', () => {
  const base = { platform: 'A' } as const;
  const txs: Tx[] = [
    { ...base, id: 'o1', date: '2025-01-01T10:00:00Z', kind: 'transfer_out', outLeg: { asset: 'BTC', qty: 1 } },
    { ...base, id: 'i1', date: '2025-01-01T09:30:00Z', kind: 'transfer_in', inLeg: { asset: 'BTC', qty: 0.999 }, platform: 'B' }, // horodaté 30 min avant : accepté
    { ...base, id: 'o2', date: '2025-01-05T10:00:00Z', kind: 'transfer_out', outLeg: { asset: 'ETH', qty: 1 } },
    { ...base, id: 'i2', date: '2025-01-20T10:00:00Z', kind: 'transfer_in', inLeg: { asset: 'ETH', qty: 1 }, platform: 'B' }, // 15 jours : non rapproché
  ];
  const p = pairTransfers(txs);
  assert.equal(p.get('i1'), 'o1');
  assert.equal(p.has('i2'), false);
});

test('XIRR : 1 000 $ placés un an, 1 100 $ à la fin → 10 %', () => {
  const r = xirr([{ date: '2024-01-01', amount: -1000 }], 1100, '2024-12-31');
  assert.ok(r !== null && Math.abs(r - 0.1) < 0.002, String(r));
  assert.equal(xirr([{ date: '2024-12-20', amount: -1000 }], 1100, '2024-12-31'), null); // moins de 30 jours
});

test('taux de change : jour exact, plus proche, secours', () => {
  const t = { EUR: { '2025-01-02': 1.03, '2025-01-03': 1.04 } };
  assert.deepEqual(fxRate(t, 'EUR', '2025-01-03'), { rate: 1.04, estimated: false });
  assert.deepEqual(fxRate(t, 'EUR', '2025-01-05'), { rate: 1.04, estimated: false });
  assert.equal(fxRate({}, 'EUR', '2025-01-05')!.estimated, true);
  assert.equal(fxRate({}, 'XYZ', '2025-01-05'), null);
});

test('série quotidienne : capital et valeur', () => {
  const txs: Tx[] = [
    { id: 'a', date: '2025-01-01T12:00:00Z', kind: 'trade', outLeg: { asset: 'USD', qty: 100 }, inLeg: { asset: 'BTC', qty: 0.001 }, platform: 'X' },
  ];
  const hist = () => [['2025-01-01', 100000], ['2025-01-03', 120000]] as [string, number][];
  const s = dailySeries(txs, {}, hist, '2025-01-04');
  assert.equal(s.length, 4);
  close(s[0].capital, 100);
  close(s[1].value, 100); // 2 janvier : dernier cours connu (1er janvier)
  close(s[3].value, 120);
});

test('catégories du journal', () => {
  const t = (inA: string, outA: string) => txCategory({ id: '', date: '', platform: '', kind: 'trade', inLeg: { asset: inA, qty: 1 }, outLeg: { asset: outA, qty: 1 } });
  assert.equal(t('BTC', 'USD'), 'buy');
  assert.equal(t('BTC', 'USDT'), 'buy');
  assert.equal(t('EUR', 'ETH'), 'sell');
  assert.equal(t('ETH', 'BTC'), 'swap');
});
