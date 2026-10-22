// Cas relevés sur de vrais exports (anonymisés) : Coinbase 2026 et Binance « Historique des transactions » en français.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseText, parseRows } from '../src/domain/importers';
import { runLedger } from '../src/domain/calc';
import type { Tx } from '../src/domain/types';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const ids = (t: Omit<Tx, 'id'>[]) => t.map((x, i) => ({ ...x, id: 'r' + i })) as Tx[];

const CB = `Transactions

ID,Timestamp,Transaction Type,Asset,Quantity Transacted,Price Currency,Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes,Sender Address,Recipient Address
a1,2026-09-02 21:54:44 UTC,Deposit,EUR,500,USD,$1.1588,$579.43,$579.43,$0.00,Deposit from Bank,,
a2,2026-09-02 21:56:32 UTC,Buy,USDC,576.544211,USD,$1.00007,$576.58802,$579.43464,$2.84662,Bought 576.544211 USDC for 579.43464 USD using Portefeuille EUR,,
a3,2026-09-03 10:00:00 UTC,Advanced Trade Buy,BTC,0.00242424,USD,$82500.00,$200.00,$200.50,$0.50,Bought 0.00242424 BTC for 200.50 USDC on BTC-USDC at 82500 USDC/BTC,,
a4,2026-09-04 10:00:00 UTC,Advanced Trade Sell,BTC,-0.00121212,USD,$90000.00,-$109.09,-$108.82,$0.27,Sold 0.00121212 BTC for 108.82 USDC on BTC-USDC at 90000 USDC/BTC,,
a5,2026-09-05 10:00:00 UTC,Advanced Trade Buy,BTC,0.0015,USD,$76000.00,$114.00,$115.00,$1.00,Bought 0.0015 BTC for 100 EUR on BTC-EUR at 66000 EUR/BTC,,
a6,2026-09-06 16:42:34 UTC,Convert,ETH,0.004783856,USD,$2447.61,$11.709,$11.929,$0.22,Converted 0.00015413 BTC to 0.004783856 ETH,,
a7,2026-09-06 16:42:34 UTC,Convert,BTC,-0.00015413,USD,$77396.90,$11.929,$11.929,$0.00,Converted 0.00015413 BTC to 0.004783856 ETH,,
a8,2026-09-07 17:51:02 UTC,Subscription,BTC,-0.00008986,USD,$63894.15,-$5.74,-$5.74,$0.00,,,
a9,2026-09-08 14:16:53 UTC,Retail Simple Price Improvement,EURC,0.016469,USD,$1.137,$0.01873,$0.01873,$0.00,,,
`;

test('Coinbase 2026 : USDC, EUR, conversion sur deux lignes, abonnement', () => {
  const r = parseText(CB)!;
  assert.deepEqual(r.unknown, {});
  const buy = r.txs.find((t) => t.note?.includes('200.50 USDC'))!;
  close(buy.outLeg!.qty, 200); // sous-total en USDC
  assert.equal(buy.fee!.asset, 'USDC'); close(buy.fee!.qty, 0.5);
  const eur = r.txs.find((t) => t.outLeg?.asset === 'EUR')!;
  close(eur.outLeg!.qty + eur.fee!.qty, 100); // les 100 € de la note = sous-total + frais
  assert.equal(r.txs.filter((t) => t.note?.startsWith('Converted')).length, 1); // une seule conversion, pas deux
  assert.equal(r.txs.find((t) => t.note?.startsWith('Converted'))!.feeUsd, 0.22);
  assert.equal(r.txs.find((t) => t.kind === 'fee')!.fee!.asset, 'BTC');
  assert.equal(r.txs.find((t) => t.inLeg?.asset === 'EURC')!.kind, 'income');
  // soldes : USDC = 576,544211 − 200,50 + 108,82
  const led = runLedger(ids(r.txs), {});
  close(led.assets.get('USDC')!.qty, 576.544211 - 200.5 + 108.82);
  close(led.assets.get('BTC')!.qty, 0.00242424 - 0.00121212 + 0.0015 - 0.00015413 - 0.00008986);
});

// Relevé Binance exporté en Excel avec en-têtes français et colonnes vides
const H = ['', '', 'Identifiant utilisateur', 'Durée', '', 'Compte', 'Opération', '', 'Jeton', 'Change', '', 'Remarque'];
const row = (d: string, op: string, coin: string, ch: string) => ['', '', '1', d, '', 'Spot', op, '', coin, ch, '', ''];
const BN: string[][] = [
  [''], ['', '', 'Historique des transactions'], H,
  row('2023-04-02 05:08:33', 'Fiat OCBS - Add Fiat and Fees', 'EUR', '40'),
  row('2023-04-02 05:08:34', 'Buy Crypto With Card', 'USDT', '40'),
  row('2023-04-02 05:08:34', 'Buy Crypto With Card', 'EUR', '-40'),
  // plan Auto-Invest : deux débits, puis les cryptos 20 min plus tard
  row('2023-04-09 05:05:54', 'Auto-Invest Transaction', 'USDT', '-20'),
  row('2023-04-09 05:05:55', 'Auto-Invest Transaction', 'USDT', '-20'),
  row('2023-04-09 05:21:31', 'Auto-Invest Transaction', 'BTC', '0.0007117'),
  row('2023-04-09 05:22:37', 'Auto-Invest Transaction', 'ETH', '0.01076335'),
  // Earn : 0,0007 BTC placés, rendus avec intérêts
  row('2023-04-10 00:00:00', 'Simple Earn Flexible Subscription', 'BTC', '-0.0007'),
  row('2023-05-10 00:00:00', 'Simple Earn Flexible Redemption', 'BTC', '0.00070180'),
  row('2023-05-11 00:00:00', 'Gift Card Redemption', 'BUSD', '0.363'),
  // achat par carte dont les euros apparaissent 1 s après
  row('2025-07-13 21:54:02', 'Buy Crypto With Fiat', 'ETH', '0.00039209'),
  row('2025-07-13 21:54:03', 'Buy Crypto With Fiat', 'EUR', '-1'),
];

test('Binance FR (Excel) : carte, Auto-Invest décalé, intérêts Earn, carte cadeau', () => {
  const r = parseRows(BN)!;
  assert.equal(r.platform, 'Binance');
  assert.deepEqual(r.unknown, {});
  const trades = r.txs.filter((t) => t.kind === 'trade');
  assert.equal(trades.length, 4);
  const auto = trades.filter((t) => t.note === 'Auto-Invest Transaction');
  assert.deepEqual(auto.map((t) => [t.outLeg!.asset, t.outLeg!.qty, t.inLeg!.asset]), [['USDT', 20, 'BTC'], ['USDT', 20, 'ETH']]);
  const interest = r.txs.find((t) => t.note?.includes('intérêts inclus'))!;
  close(interest.inLeg!.qty, 0.0000018);
  assert.ok(r.txs.some((t) => t.kind === 'income' && t.inLeg?.asset === 'BUSD'));
  const card = trades.find((t) => t.inLeg?.asset === 'ETH' && t.outLeg?.asset === 'EUR')!;
  close(card.outLeg!.qty, 1);
  const led = runLedger(ids(r.txs), {});
  close(led.assets.get('BTC')!.qty, 0.0007117 + 0.0000018);
  close(led.assets.get('USDT')!.qty, 0);
  assert.equal(led.warnings.length, 0);
});

test('Ledger Live : réceptions rapprochées des retraits Binance, récompense, frais', () => {
  const ledger = [
    'Operation Date,Status,Currency Ticker,Operation Type,Operation Amount,Operation Fees,Operation Hash,Account Name,Account xpub,Countervalue Ticker,Countervalue at Operation Date,Countervalue at CSV Export',
    '2026-06-20T21:15:02.000Z,Confirmed,BTC,IN,0.01398,0,abc,Bitcoin 1,xpub,USD,980.5,1500',
    '2026-07-01T10:00:00.000Z,Confirmed,ATOM,REWARD,0.05,0,def,Cosmos 1,xpub,USD,0.4,0.3',
    '2026-07-02T10:00:00.000Z,Confirmed,ATOM,DELEGATE,0,0.002,ghi,Cosmos 1,xpub,USD,0,0',
    '2026-09-03T19:50:00.000Z,Confirmed,EGLD,OUT,30.7482,0.0002,jkl,MultiversX 1,xpub,USD,145,150',
    '2026-09-04T10:00:00.000Z,Failed,BTC,OUT,1,0,mno,Bitcoin 1,xpub,USD,0,0',
  ].join('\n');
  const r = parseText(ledger)!;
  assert.equal(r.platform, 'Ledger');
  assert.deepEqual(r.unknown, {});
  assert.equal(r.ignored, 1); // opération échouée
  assert.deepEqual(r.txs.map((t) => t.kind), ['transfer_in', 'income', 'fee', 'transfer_out']);
  close(r.txs[3].outLeg!.qty, 30.748);
  // retrait Binance de 0,014 BTC frais inclus → 0,01398 reçus sur Ledger : rapprochés, le coût suit
  const binance: Omit<Tx, 'id'>[] = [
    { date: '2026-06-01T10:00:00Z', kind: 'trade', outLeg: { asset: 'USDT', qty: 1400 }, inLeg: { asset: 'BTC', qty: 0.014 }, platform: 'Binance' },
    { date: '2026-06-20T21:10:44Z', kind: 'transfer_out', outLeg: { asset: 'BTC', qty: 0.014 }, platform: 'Binance' },
  ];
  const led = runLedger(ids([...binance, ...r.txs]), {});
  close(led.assets.get('BTC')!.qty, 0.01398);
  close(led.assets.get('BTC')!.platforms.Ledger, 0.01398);
  close(led.unmatchedOut, 0);
});
