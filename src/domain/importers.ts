// Lecture des exports bruts des plateformes → opérations normalisées (Tx).
// Fonctions pures : reçoivent un tableau de lignes (CSV déjà découpé, ou feuille Excel lue par data/files.ts).
// Formats reconnus (détection automatique par l'en-tête) :
//  - Coinbase  : « Transaction history » (Rapports › Générer un rapport), anciens et nouveaux en-têtes
//  - Binance   : « Historique des transactions » (Wallet › Transaction History › Generate all statements)
//  - Binance   : « Historique des trades » spot (Orders › Spot Order › Trade History › Export)
//  - Kraken    : « Ledgers » (bonus)
//  - Ledger Live : historique des opérations (portefeuille matériel)
//  - CSV générique CryptoAnalyze (celui que l'app exporte) : pour toute autre plateforme ou un portefeuille
import type { IncomeType, Leg, Tx, TxKind } from './types';
import { isFiat, normSymbol } from './assets';

export type NewTx = Omit<Tx, 'id'>;

export interface ParseResult {
  format: string; // libellé lisible du format reconnu
  platform: string;
  txs: NewTx[];
  rows: number; // lignes de données lues
  ignored: number; // lignes volontairement ignorées (mouvements internes à la plateforme)
  unknown: Record<string, number>; // types d'opération non reconnus → nombre de lignes
  warnings: string[];
}

// ------------------------------------------------------------------ CSV
/** Découpe un texte CSV (guillemets, séparateur , ; ou tabulation détecté automatiquement, BOM). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const sample = src.split(/\r?\n/).slice(0, 20).join('\n');
  const count = (c: string) => (sample.match(new RegExp(c === '\t' ? '\\t' : '\\' + c, 'g')) || []).length;
  const sep = [',', ';', '\t'].map((c) => [c, count(c)] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

// ------------------------------------------------------------------ outils de lecture
/** Montant d'un export : « $1,234.56 », « -€12.00 », « 1.2E-7 », « 0,5 » → nombre (NaN si vide). */
export function parseAmount(s: string | undefined): number {
  if (s === undefined) return NaN;
  let t = String(s).trim().replace(/[\s  ]/g, '').replace(/^\((.*)\)$/, '-$1');
  t = t.replace(/[$€£¥₩₺]|USD|EUR|GBP/gi, '');
  if (t === '' || t === '-' || t === '—') return NaN;
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (t.includes(',')) t = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  const v = Number(t);
  return isFinite(v) ? v : NaN;
}

/** « 0.00123BTC » → { qty: 0.00123, asset: 'BTC' } (format de l'historique des trades Binance). */
export function amountWithAsset(s: string): Leg | null {
  const m = /^\s*(-?[\d.,]+(?:[eE][-+]?\d+)?)\s*([A-Za-z0-9]+)\s*$/.exec(s || '');
  if (!m) return null;
  const qty = Math.abs(parseAmount(m[1]));
  return isFinite(qty) ? { qty, asset: normSymbol(m[2]) } : null;
}

/** Date d'export → ISO UTC 'AAAA-MM-JJTHH:MM:SSZ' ('' si illisible). Les dates sans fuseau sont considérées en UTC. */
export function parseDate(s: string | undefined): string {
  if (!s) return '';
  const v = String(s).trim();
  // numéro de série Excel (jours depuis 1899-12-30)
  if (/^\d{5}(\.\d+)?$/.test(v)) {
    const ms = Math.round((Number(v) - 25569) * 864e5);
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  let m = /^(\d{2}|\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(Z|UTC|GMT|[+-]\d{2}:?\d{2})?$/i.exec(v);
  if (m) {
    const y = m[1].length === 2 ? 2000 + +m[1] : +m[1];
    const tz = (m[7] || 'Z').toUpperCase();
    const base = Date.UTC(y, +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    let off = 0;
    if (/^[+-]/.test(tz)) { const z = tz.replace(':', ''); off = (z[0] === '-' ? -1 : 1) * (+z.slice(1, 3) * 60 + +z.slice(3, 5)); }
    return new Date(base - off * 6e4).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  // jj/mm/aaaa [hh:mm[:ss]] (exports localisés en français)
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

const norm = (h: string) => String(h).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Trouve la ligne d'en-tête (dans les 30 premières) contenant toutes les colonnes demandées. */
function findHeader(rows: string[][], required: string[]): number {
  const req = required.map(norm);
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const h = rows[i].map(norm);
    if (req.every((r) => h.includes(r))) return i;
  }
  return -1;
}

function indexer(header: string[]) {
  const h = header.map(norm);
  return (row: string[], ...names: string[]): string | undefined => {
    for (const n of names) { const i = h.indexOf(norm(n)); if (i >= 0 && row[i] !== undefined && row[i] !== '') return row[i]; }
    return undefined;
  };
}

/** Empreinte d'une opération : identique si on réimporte la même ligne (doublons ignorés). */
export function txKey(t: NewTx): string {
  const r = (n: number | undefined) => (n === undefined ? '' : Number(n.toPrecision(10)));
  const l = (x?: Leg) => (x ? x.asset + ':' + r(x.qty) : '');
  return [t.platform.toLowerCase(), t.date, t.kind, l(t.inLeg), l(t.outLeg), l(t.fee)].join('|');
}

/** Ajoute à chaque opération une empreinte unique dans le fichier (#2, #3… pour des lignes identiques). */
export function withKeys(txs: NewTx[]): NewTx[] {
  const seen = new Map<string, number>();
  return txs.map((t) => {
    const k = txKey(t);
    const n = (seen.get(k) || 0) + 1;
    seen.set(k, n);
    return { ...t, key: k + '#' + n };
  });
}

const leg = (asset: string, qty: number): Leg | undefined => (isFinite(qty) && Math.abs(qty) > 0 ? { asset: normSymbol(asset), qty: Math.abs(qty) } : undefined);

// ------------------------------------------------------------------ Coinbase
const CB_INCOME: [RegExp, IncomeType][] = [
  [/staking|inflation/, 'staking'], [/airdrop/, 'airdrop'], [/interest/, 'interest'],
  [/reward|earn|learning|incentive|rebate|bonus|cashback|price improvement/, 'reward'],
];
const CB_INTERNAL = /^(pro deposit|pro withdrawal|exchange deposit|exchange withdrawal|retail staking transfer|retail unstaking transfer|staking transfer|unstaking transfer|retail eth2 deprecation|coinbase pro deposit|coinbase pro withdrawal)$/;

function parseCoinbase(rows: string[][], hi: number): ParseResult {
  const g = indexer(rows[hi]);
  const res: ParseResult = { format: 'Coinbase – historique des transactions', platform: 'Coinbase', txs: [], rows: 0, ignored: 0, unknown: {}, warnings: [] };
  const body = rows.slice(hi + 1);
  // Conversions au format 2025+ : deux lignes (actif donné, actif reçu) partagent la même note ; l'écart (spread) est sur la ligne « reçu »
  const convertSpread = new Map<string, number>();
  for (const row of body) {
    if ((g(row, 'Transaction Type') || '').trim().toLowerCase() !== 'convert') continue;
    const m = /Converted\s+([\d.,]+)\s+(\w+)\s+to/i.exec(g(row, 'Notes') || '');
    if (m && normSymbol(g(row, 'Asset') || '') !== normSymbol(m[2])) convertSpread.set((g(row, 'Notes') || '') + '|' + (g(row, 'Timestamp') || '').slice(0, 16), Math.abs(parseAmount(g(row, 'Fees and/or Spread', 'Fees'))) || 0);
  }
  for (const row of body) {
    const type = (g(row, 'Transaction Type') || '').trim();
    const date = parseDate(g(row, 'Timestamp'));
    if (!type || !date) continue;
    res.rows++;
    const tl = type.toLowerCase();
    const asset = normSymbol(g(row, 'Asset') || '');
    const signed = parseAmount(g(row, 'Quantity Transacted'));
    const q = Math.abs(signed);
    const cur = normSymbol(g(row, 'Price Currency', 'Spot Price Currency') || 'USD');
    const px = Math.abs(parseAmount(g(row, 'Price at Transaction', 'Spot Price at Transaction')));
    let sub = Math.abs(parseAmount(g(row, 'Subtotal')));
    const total = Math.abs(parseAmount(g(row, 'Total (inclusive of fees and/or spread)', 'Total')));
    const fees = Math.abs(parseAmount(g(row, 'Fees and/or Spread', 'Fees'))) || 0;
    const notes = g(row, 'Notes') || '';
    if (!isFinite(sub) && isFinite(px) && isFinite(q)) sub = px * q;
    const usdOf = (v: number) => (cur === 'USD' && isFinite(v) ? v : undefined);
    const base = { date, platform: 'Coinbase', src: 'coinbase', note: notes || undefined } as const;

    const isBuy = /^(advanced trade )?buy$/.test(tl), isSell = /^(advanced trade )?sell$/.test(tl);
    if (isBuy || isSell) {
      // La note donne la vraie contrepartie (USDC, EUR…) ; son montant est le TOTAL frais compris (achat) ou net de frais (vente).
      // On le ramène au sous-total et aux frais avec le rapport note ÷ total, ce qui garde tout dans la devise réellement payée.
      const m = (isBuy ? /Bought\s+([\d.,]+)\s+(\w+)\s+for\s+([\d.,]+)\s+(\w+)/i : /Sold\s+([\d.,]+)\s+(\w+)\s+for\s+([\d.,]+)\s+(\w+)/i).exec(notes);
      const quote = m ? normSymbol(m[4]) : cur;
      const r = m && quote !== cur && total > 0 ? parseAmount(m[3]) / total : 1;
      const cashQty = sub * r, feeQty = fees * r;
      const cashLeg = leg(quote, cashQty), fee = feeQty > 0 ? leg(quote, feeQty) : undefined;
      if (isBuy) res.txs.push({ ...base, kind: 'trade', inLeg: leg(asset, q), outLeg: cashLeg, fee, usd: usdOf(sub), feeUsd: usdOf(fees) });
      else res.txs.push({ ...base, kind: 'trade', outLeg: leg(asset, q), inLeg: cashLeg, fee, usd: usdOf(sub), feeUsd: usdOf(fees) });
    } else if (tl === 'convert') {
      const m = /Converted\s+([\d.,]+)\s+(\w+)\s+to\s+([\d.,]+)\s+(\w+)/i.exec(notes);
      if (!m) { res.unknown['Convert (note illisible)'] = (res.unknown['Convert (note illisible)'] || 0) + 1; continue; }
      if (asset !== normSymbol(m[2])) continue; // ligne « reçu » d'une conversion en deux lignes : déjà comptée avec la ligne « donné »
      const spread = convertSpread.get(notes + '|' + (g(row, 'Timestamp') || '').slice(0, 16)) ?? fees;
      res.txs.push({ ...base, kind: 'trade', outLeg: leg(m[2], parseAmount(m[1])), inLeg: leg(m[4], parseAmount(m[3])), usd: usdOf(sub), feeUsd: usdOf(spread) || undefined });
    } else if (tl === 'send' || tl === 'withdrawal' && !isFiat(asset)) {
      res.txs.push({ ...base, kind: 'transfer_out', outLeg: leg(asset, q), usd: usdOf(sub) });
    } else if (tl === 'receive' || tl === 'deposit' && !isFiat(asset)) {
      res.txs.push({ ...base, kind: 'transfer_in', inLeg: leg(asset, q), usd: usdOf(isFinite(px) ? px * q : sub) });
    } else if (/^(fiat )?deposit$/.test(tl)) {
      res.txs.push({ ...base, kind: 'cash_in', inLeg: leg(asset, q) });
    } else if (/^(fiat )?withdrawal$/.test(tl)) {
      res.txs.push({ ...base, kind: 'cash_out', outLeg: leg(asset, q) });
    } else if (tl === 'subscription' && signed < 0) {
      // abonnement Coinbase One payé en crypto : sortie de jetons, comptée comme frais
      res.txs.push({ ...base, kind: 'fee', fee: leg(asset, q), feeUsd: usdOf(sub), note: 'Abonnement Coinbase' });
    } else if (CB_INTERNAL.test(tl)) {
      res.ignored++;
    } else {
      const inc = signed >= 0 ? CB_INCOME.find(([re]) => re.test(tl)) : undefined;
      if (inc) res.txs.push({ ...base, kind: 'income', incomeType: inc[1], inLeg: leg(asset, q), usd: usdOf(isFinite(sub) ? sub : px * q) });
      else res.unknown[type] = (res.unknown[type] || 0) + 1;
    }
  }
  return res;
}

// ------------------------------------------------------------------ Binance : historique des transactions (relevé)
// En-têtes anglais (UTC_Time, Operation, Coin, Change) ou français (Durée, Opération, Jeton, Change), CSV ou Excel.
const BN_FEE = /^(fee|transaction fee|trading fee)$/;
const BN_TRADE = /^(buy|sell|transaction related|transaction buy|transaction spend|transaction sold|transaction revenue|large otc trading|binance convert|convert|small assets exchange bnb|small assets exchange|buy crypto|buy crypto with card|buy crypto with fiat|auto-invest transaction|eth 2\.0 staking|asset conversion transfer|stablecoins auto-conversion|token swap - redenomination\/rebranding|leverage token redemption)$/;
/** Opérations dont les deux jambes peuvent être espacées de plusieurs minutes (plan d'investissement, achat par carte). */
const BN_DEFERRED = /^(auto-invest transaction|buy crypto with fiat|buy crypto with card|buy crypto)$/;
const BN_INTERNAL = /subscription|redemption|purchase|transfer between|account transfer|^transfer_(in|out)$|transfer funds|main and funding|funding account|sub-account|to spot|to funding|principal|internal transfer|isolated margin|cross margin|margin transfer|dual investment|collateral/;
const BN_INCOME: [RegExp, IncomeType][] = [
  [/staking|pos savings|eth 2\.0|bnb vault|launchpool|megadrop|hodler/, 'staking'], [/airdrop|distribution/, 'airdrop'],
  [/interest|savings|earn/, 'interest'], [/reward|commission|referral|kickback|cashback|voucher|crypto box|mission|bonus|rebate|gift|vega/, 'reward'],
];

function parseBinanceLedger(rows: string[][], hi: number): ParseResult {
  const g = indexer(rows[hi]);
  const res: ParseResult = { format: 'Binance – historique des transactions', platform: 'Binance', txs: [], rows: 0, ignored: 0, unknown: {}, warnings: [] };
  type Row = { date: string; t: number; op: string; opRaw: string; coin: string; change: number };
  const tradeRows: Row[] = [];
  const earnRows: Row[] = [];
  const base = (date: string) => ({ date, platform: 'Binance', src: 'binance' } as const);
  for (const row of rows.slice(hi + 1)) {
    const date = parseDate(g(row, 'UTC_Time', 'Time', 'Date(UTC)', 'Durée', 'Date'));
    const opRaw = (g(row, 'Operation', 'Opération') || '').trim();
    const coin = normSymbol(g(row, 'Coin', 'Jeton', 'Asset') || '');
    const change = parseAmount(g(row, 'Change', 'Variation', 'Montant'));
    if (!date || !opRaw || !coin || !isFinite(change)) continue;
    res.rows++;
    if (change === 0) { res.ignored++; continue; }
    const op = opRaw.toLowerCase();
    const r: Row = { date, t: Date.parse(date), op, opRaw, coin, change };
    if (BN_FEE.test(op) || BN_TRADE.test(op)) { tradeRows.push(r); continue; }
    if (/^(deposit|fiat deposit|crypto deposit|fiat ocbs - add fiat and fees)$/.test(op) && change > 0) {
      res.txs.push({ ...base(date), kind: isFiat(coin) ? 'cash_in' : 'transfer_in', inLeg: leg(coin, change) });
    } else if (/^(withdraw|withdrawal|fiat withdraw|fiat withdrawal|crypto withdrawal|send|asset recovery)$/.test(op)) {
      res.txs.push({ ...base(date), kind: isFiat(coin) ? 'cash_out' : 'transfer_out', outLeg: leg(coin, change), note: opRaw === 'Asset Recovery' ? 'Jeton retiré par Binance (Asset Recovery)' : undefined });
    } else if (op === 'transfer') {
      // transfert sans précision : interne (rapproché automatiquement) ou vers l'extérieur
      res.txs.push(change > 0 ? { ...base(date), kind: 'transfer_in', inLeg: leg(coin, change), note: opRaw } : { ...base(date), kind: 'transfer_out', outLeg: leg(coin, change), note: opRaw });
    } else if (/subscription|redemption|purchase/.test(op) && !/gift card/.test(op)) {
      // Earn / staking : on suit le montant placé ; ce qui revient en plus au remboursement est un intérêt
      earnRows.push(r);
    } else if (BN_INTERNAL.test(op) && !/gift card/.test(op)) {
      res.ignored++;
    } else {
      const inc = change > 0 ? BN_INCOME.find(([re]) => re.test(op)) || (/^token swap - distribution$/.test(op) ? [null, 'airdrop' as IncomeType] : undefined) : undefined;
      if (inc) res.txs.push({ ...base(date), kind: 'income', incomeType: inc[1], inLeg: leg(coin, change), note: opRaw });
      else res.unknown[opRaw] = (res.unknown[opRaw] || 0) + 1;
    }
  }
  // 0. placements Earn : solde placé par crypto ; un remboursement supérieur au placé = intérêts non détaillés ailleurs
  const placed = new Map<string, number>();
  for (const r of earnRows.sort((a, b) => a.t - b.t)) {
    const cur = (placed.get(r.coin) || 0) - r.change;
    if (cur < -1e-12) {
      res.txs.push({ ...base(r.date), kind: 'income', incomeType: 'interest', inLeg: { asset: r.coin, qty: -cur }, note: r.opRaw + ' (intérêts inclus dans le remboursement)' });
      placed.set(r.coin, 0);
    } else placed.set(r.coin, cur);
    res.ignored++;
  }
  // 1. regroupement des lignes d'un même échange (même seconde, à 2 s près)
  tradeRows.sort((a, b) => a.t - b.t);
  const clusters: Row[][] = [];
  for (const r of tradeRows) {
    const c = clusters[clusters.length - 1];
    if (c && r.t - c[c.length - 1].t <= 2000) c.push(r); else clusters.push([r]);
  }
  type Side = { date: string; t: number; op: string; legs: Leg[]; fees: Leg[]; note: string };
  const deferred: { side: 'in' | 'out'; s: Side }[] = [];
  const emitPair = (date: string, pos: Leg[], neg: Leg[], fees: Leg[], note: string) => {
    const out: NewTx[] = [];
    if (pos.length === 1) {
      for (const n of neg) out.push({ ...base(date), kind: 'trade', outLeg: n, inLeg: { asset: pos[0].asset, qty: pos[0].qty / neg.length }, note });
      if (neg.length > 1) res.warnings.push(`Conversion groupée du ${date.slice(0, 10)} (${neg.map((n) => n.asset).join(', ')} → ${pos[0].asset}) : répartie à parts égales.`);
    } else if (neg.length === 1) {
      for (const p of pos) out.push({ ...base(date), kind: 'trade', outLeg: { asset: neg[0].asset, qty: neg[0].qty / pos.length }, inLeg: p, note });
      res.warnings.push(`Achat groupé du ${date.slice(0, 10)} (${neg[0].asset} → ${pos.map((p) => p.asset).join(', ')}) : montant réparti à parts égales entre les cryptos.`);
    } else {
      const n = Math.min(pos.length, neg.length);
      for (let i = 0; i < n; i++) out.push({ ...base(date), kind: 'trade', outLeg: neg[i], inLeg: pos[i], note });
      for (const p of pos.slice(n)) out.push({ ...base(date), kind: 'transfer_in', inLeg: p, note });
      for (const x of neg.slice(n)) out.push({ ...base(date), kind: 'transfer_out', outLeg: x, note });
      res.warnings.push(`Opérations multiples à la même seconde le ${date.slice(0, 10)} : associées au mieux, à vérifier dans le journal.`);
    }
    const f = [...fees];
    if (out.length && f.length) out[0].fee = f.shift();
    for (const x of f) out.push({ ...base(date), kind: 'fee', fee: x, note: 'Frais' });
    res.txs.push(...out);
  };
  for (const arr of clusters) {
    const date = arr[0].date;
    const net = new Map<string, number>();
    const fees = new Map<string, number>();
    for (const r of arr) {
      if (BN_FEE.test(r.op)) fees.set(r.coin, (fees.get(r.coin) || 0) + Math.abs(r.change));
      else net.set(r.coin, (net.get(r.coin) || 0) + r.change);
    }
    const pos = [...net].filter(([, v]) => v > 1e-15).map(([a, v]) => ({ asset: a, qty: v }));
    const neg = [...net].filter(([, v]) => v < -1e-15).map(([a, v]) => ({ asset: a, qty: -v }));
    const feeLegs = [...fees].map(([asset, qty]) => ({ asset, qty }));
    const ops = [...new Set(arr.filter((r) => !BN_FEE.test(r.op)).map((r) => r.opRaw))];
    const note = ops.join(', ');
    if (pos.length && neg.length) { emitPair(date, pos, neg, feeLegs, note); continue; }
    const isDeferred = ops.length > 0 && ops.every((o) => BN_DEFERRED.test(o.toLowerCase()));
    if (isDeferred && (pos.length || neg.length)) {
      deferred.push({ side: pos.length ? 'in' : 'out', s: { date, t: arr[0].t, op: ops[0].toLowerCase(), legs: pos.length ? pos : neg, fees: feeLegs, note } });
      continue;
    }
    for (const p of pos) res.txs.push({ ...base(date), kind: 'transfer_in', inLeg: p, note: note + ' (contrepartie absente du relevé)' });
    for (const x of neg) res.txs.push({ ...base(date), kind: 'transfer_out', outLeg: x, note: note + ' (contrepartie absente du relevé)' });
    for (const f of feeLegs) res.txs.push({ ...base(date), kind: 'fee', fee: f, note: 'Frais' });
  }
  // 2. jambes décalées (plan Auto-Invest : le montant part, les cryptos arrivent 5 à 60 min plus tard)
  type Batch = { outs: Side[]; ins: Side[]; start: number };
  const byOp = new Map<string, typeof deferred>();
  for (const d of deferred) { const k = d.s.op; if (!byOp.has(k)) byOp.set(k, []); byOp.get(k)!.push(d); }
  for (const list of byOp.values()) {
    let batch: Batch | null = null;
    const close = () => {
      if (!batch) return;
      const { outs, ins } = batch;
      if (outs.length && ins.length) {
        if (outs.length === ins.length) outs.forEach((o, i) => emitPair(ins[i].date, ins[i].legs, o.legs, [...o.fees, ...ins[i].fees], ins[i].note));
        else {
          // un montant réparti sur plusieurs cryptos : on additionne ce qui est parti, réparti à parts égales
          const spent = new Map<string, number>();
          for (const o of outs) for (const l of o.legs) spent.set(l.asset, (spent.get(l.asset) || 0) + l.qty);
          const negLegs = [...spent].map(([asset, qty]) => ({ asset, qty }));
          for (const i of ins) emitPair(i.date, i.legs, negLegs.map((l) => ({ asset: l.asset, qty: l.qty / ins.length })), i.fees, i.note);
          if (ins.length > 1) res.warnings.push(`Plan d'investissement du ${ins[0].date.slice(0, 10)} (${negLegs.map((l) => l.asset).join(', ')} → ${ins.map((i) => i.legs.map((l) => l.asset).join('+')).join(', ')}) : montant réparti à parts égales entre les cryptos (répartition réelle du plan inconnue).`);
        }
      } else {
        for (const i of ins) for (const l of i.legs) res.txs.push({ ...base(i.date), kind: 'transfer_in', inLeg: l, note: i.note + ' (montant payé non fourni par le relevé)' });
        for (const o of outs) for (const l of o.legs) res.txs.push({ ...base(o.date), kind: 'transfer_out', outLeg: l, note: o.note + ' (cryptos reçues introuvables)' });
      }
      batch = null;
    };
    for (const d of list.sort((a, b) => a.s.t - b.s.t)) {
      if (d.side === 'out') {
        if (batch && (batch.ins.length || d.s.t - batch.outs[batch.outs.length - 1].t > 5 * 60e3)) close();
        if (!batch) batch = { outs: [], ins: [], start: d.s.t };
        batch.outs.push(d.s);
      } else {
        if (batch && d.s.t - batch.start > 3 * 3600e3) close();
        if (!batch) batch = { outs: [], ins: [], start: d.s.t };
        batch.ins.push(d.s);
      }
    }
    close();
  }
  res.txs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return res;
}

// ------------------------------------------------------------------ Binance : historique des trades spot
const QUOTES = ['FDUSD', 'USDT', 'USDC', 'BUSD', 'TUSD', 'USDP', 'DAI', 'EUR', 'USD', 'GBP', 'TRY', 'BRL', 'BTC', 'ETH', 'BNB', 'XRP', 'TRX', 'DOGE', 'JPY', 'AUD'];
function splitPair(p: string): [string, string] | null {
  const s = p.replace(/[-_/]/g, '').toUpperCase();
  for (const q of QUOTES) if (s.endsWith(q) && s.length > q.length) return [s.slice(0, -q.length), q];
  return null;
}

function parseBinanceTrades(rows: string[][], hi: number): ParseResult {
  const g = indexer(rows[hi]);
  const res: ParseResult = { format: 'Binance – historique des trades spot', platform: 'Binance', txs: [], rows: 0, ignored: 0, unknown: {}, warnings: [] };
  for (const row of rows.slice(hi + 1)) {
    const date = parseDate(g(row, 'Date(UTC)', 'Date', 'Time'));
    const pair = g(row, 'Pair', 'Market', 'Symbol') || '';
    const side = (g(row, 'Side', 'Type') || '').toUpperCase();
    if (!date || !pair || !/BUY|SELL/.test(side)) continue;
    res.rows++;
    let baseLeg = amountWithAsset(g(row, 'Executed') || '');
    let quoteLeg = amountWithAsset(g(row, 'Amount') || '');
    let feeLeg = amountWithAsset(g(row, 'Fee') || '');
    if (!baseLeg || !quoteLeg) {
      const sp = splitPair(pair);
      if (!sp) { res.unknown['Paire ' + pair] = (res.unknown['Paire ' + pair] || 0) + 1; continue; }
      const amount = Math.abs(parseAmount(g(row, 'Amount', 'Executed')));
      const total = Math.abs(parseAmount(g(row, 'Total')));
      baseLeg = { asset: normSymbol(sp[0]), qty: amount };
      quoteLeg = { asset: normSymbol(sp[1]), qty: total };
      const fq = Math.abs(parseAmount(g(row, 'Fee')));
      const fc = g(row, 'Fee Coin', 'Fee Asset');
      feeLeg = isFinite(fq) && fq > 0 && fc ? { asset: normSymbol(fc), qty: fq } : feeLeg && isFinite(feeLeg.qty) ? feeLeg : null;
    }
    if (!isFinite(baseLeg.qty) || !isFinite(quoteLeg.qty)) continue;
    const buy = side.includes('BUY');
    res.txs.push({ date, platform: 'Binance', src: 'binance', kind: 'trade', inLeg: buy ? baseLeg : quoteLeg, outLeg: buy ? quoteLeg : baseLeg, fee: feeLeg && feeLeg.qty > 0 ? feeLeg : undefined, note: pair.toUpperCase() });
  }
  return res;
}

// ------------------------------------------------------------------ Kraken : ledgers
function krakenAsset(a: string): string {
  let s = a.toUpperCase().replace(/\.(S|F|M|B|P|HOLD)$/, '').replace(/\d+\.S$/, '');
  if (s.length === 4 && /^[XZ]/.test(s) && ['XXBT', 'XETH', 'XXRP', 'XLTC', 'XXLM', 'XXDG', 'XETC', 'XZEC', 'XXMR', 'XREP', 'XMLN', 'ZUSD', 'ZEUR', 'ZGBP', 'ZCAD', 'ZJPY', 'ZAUD', 'ZCHF'].includes(s)) s = s.slice(1);
  return normSymbol(s);
}

function parseKraken(rows: string[][], hi: number): ParseResult {
  const g = indexer(rows[hi]);
  const res: ParseResult = { format: 'Kraken – ledgers', platform: 'Kraken', txs: [], rows: 0, ignored: 0, unknown: {}, warnings: [] };
  const groups = new Map<string, { date: string; type: string; asset: string; amount: number; fee: number; sub: string }[]>();
  const base = (date: string) => ({ date, platform: 'Kraken', src: 'kraken' } as const);
  for (const row of rows.slice(hi + 1)) {
    const date = parseDate(g(row, 'time'));
    const type = (g(row, 'type') || '').toLowerCase();
    const sub = (g(row, 'subtype') || '').toLowerCase();
    const asset = krakenAsset(g(row, 'asset') || '');
    const amount = parseAmount(g(row, 'amount'));
    const fee = Math.abs(parseAmount(g(row, 'fee'))) || 0;
    if (!date || !type || !asset || !isFinite(amount)) continue;
    res.rows++;
    if (type === 'trade' || type === 'spend' || type === 'receive' || type === 'adjustment' && sub === 'conversion') {
      const k = g(row, 'refid') || date;
      let arr = groups.get(k);
      if (!arr) groups.set(k, (arr = []));
      arr.push({ date, type, asset, amount, fee, sub });
    } else if (type === 'deposit' && amount > 0) {
      res.txs.push({ ...base(date), kind: isFiat(asset) ? 'cash_in' : 'transfer_in', inLeg: leg(asset, amount) });
    } else if (type === 'withdrawal') {
      res.txs.push({ ...base(date), kind: isFiat(asset) ? 'cash_out' : 'transfer_out', outLeg: leg(asset, amount), fee: fee ? leg(asset, fee) : undefined });
    } else if ((type === 'staking' || type === 'earn' && sub === 'reward' || type === 'reward' || type === 'dividend') && amount > 0) {
      res.txs.push({ ...base(date), kind: 'income', incomeType: type === 'earn' || type === 'staking' ? 'staking' : 'reward', inLeg: leg(asset, amount) });
    } else if (type === 'transfer' || type === 'earn' || type === 'margin' || type === 'rollover') {
      res.ignored++;
    } else res.unknown[type + (sub ? ' / ' + sub : '')] = (res.unknown[type + (sub ? ' / ' + sub : '')] || 0) + 1;
  }
  for (const arr of groups.values()) {
    const pos = arr.filter((r) => r.amount > 0), neg = arr.filter((r) => r.amount < 0);
    const date = arr[0].date;
    const feeRow = arr.find((r) => r.fee > 0);
    if (pos.length && neg.length) {
      res.txs.push({ ...base(date), kind: 'trade', inLeg: leg(pos[0].asset, pos.reduce((s, r) => s + r.amount, 0)), outLeg: leg(neg[0].asset, neg.reduce((s, r) => s + r.amount, 0)), fee: feeRow ? leg(feeRow.asset, feeRow.fee) : undefined });
    } else res.warnings.push(`Échange Kraken incomplet le ${date.slice(0, 10)} (une seule jambe) : ignoré.`);
  }
  return res;
}

// ------------------------------------------------------------------ Ledger Live : historique des opérations
// Ledger Live › Paramètres › Comptes › Exporter l'historique des opérations (CSV).
function parseLedger(rows: string[][], hi: number): ParseResult {
  const g = indexer(rows[hi]);
  const res: ParseResult = { format: 'Ledger Live – historique des opérations', platform: 'Ledger', txs: [], rows: 0, ignored: 0, unknown: {}, warnings: [] };
  for (const row of rows.slice(hi + 1)) {
    const date = parseDate(g(row, 'Operation Date', 'Date'));
    const asset = normSymbol(g(row, 'Currency Ticker', 'Currency') || '');
    const type = (g(row, 'Operation Type', 'Type') || '').trim().toUpperCase();
    const amount = Math.abs(parseAmount(g(row, 'Operation Amount', 'Amount')));
    const fee = Math.abs(parseAmount(g(row, 'Operation Fees', 'Fees'))) || 0;
    const status = (g(row, 'Status') || '').toLowerCase();
    if (!date || !asset || !type) continue;
    res.rows++;
    if (status && !/confirm/.test(status)) { res.ignored++; continue; }
    const cvT = (g(row, 'Countervalue Ticker') || '').toUpperCase();
    const cv = Math.abs(parseAmount(g(row, 'Countervalue at Operation Date')));
    const usd = cvT === 'USD' && isFinite(cv) && cv > 0 ? cv : undefined;
    const base = { date, platform: 'Ledger', src: 'ledger', note: g(row, 'Account Name') || undefined } as const;
    const feeLeg = fee > 0 ? leg(asset, fee) : undefined;
    if (type === 'IN') res.txs.push({ ...base, kind: 'transfer_in', inLeg: leg(asset, amount), usd });
    else if (type === 'OUT') {
      // le montant de Ledger Live inclut les frais de réseau : on les sépare
      const sent = feeLeg && amount > fee ? amount - fee : amount;
      res.txs.push({ ...base, kind: 'transfer_out', outLeg: leg(asset, sent), fee: feeLeg && amount > fee ? feeLeg : undefined });
    } else if (/REWARD|STAKING_REWARD|INTEREST/.test(type)) res.txs.push({ ...base, kind: 'income', incomeType: 'staking', inLeg: leg(asset, amount), usd });
    else if (/^(FEES|DELEGATE|UNDELEGATE|REDELEGATE|OPT_IN|OPT_OUT|VOTE|FREEZE|UNFREEZE|BOND|UNBOND|NOMINATE|CHILL|WITHDRAW_UNBONDED|STAKE|UNSTAKE|APPROVE|ACTIVATE)$/.test(type)) {
      if (feeLeg) res.txs.push({ ...base, kind: 'fee', fee: feeLeg, note: 'Frais : ' + type }); else res.ignored++;
    } else if (/NFT/.test(type)) res.ignored++;
    else res.unknown[type] = (res.unknown[type] || 0) + 1;
  }
  return res;
}

// ------------------------------------------------------------------ CSV générique CryptoAnalyze
export const GENERIC_HEADER = ['date', 'type', 'received_asset', 'received_qty', 'sent_asset', 'sent_qty', 'fee_asset', 'fee_qty', 'usd_value', 'fee_usd', 'platform', 'income_type', 'note'];
const KINDS: TxKind[] = ['trade', 'income', 'transfer_in', 'transfer_out', 'cash_in', 'cash_out', 'fee'];
const KIND_ALIASES: Record<string, TxKind> = { buy: 'trade', sell: 'trade', swap: 'trade', achat: 'trade', vente: 'trade', echange: 'trade', revenu: 'income', staking: 'income', reward: 'income', deposit: 'transfer_in', withdrawal: 'transfer_out', send: 'transfer_out', receive: 'transfer_in' };

function parseGeneric(rows: string[][], hi: number): ParseResult {
  const g = indexer(rows[hi]);
  const res: ParseResult = { format: 'CSV CryptoAnalyze', platform: '', txs: [], rows: 0, ignored: 0, unknown: {}, warnings: [] };
  const plats = new Set<string>();
  for (const row of rows.slice(hi + 1)) {
    const date = parseDate(g(row, 'date'));
    const rawType = (g(row, 'type') || '').toLowerCase().trim();
    if (!date || !rawType) continue;
    res.rows++;
    const kind = (KINDS as string[]).includes(rawType) ? (rawType as TxKind) : KIND_ALIASES[rawType];
    if (!kind) { res.unknown[rawType] = (res.unknown[rawType] || 0) + 1; continue; }
    const platform = g(row, 'platform') || 'Autre';
    plats.add(platform);
    const usd = parseAmount(g(row, 'usd_value'));
    const feeUsd = parseAmount(g(row, 'fee_usd'));
    const it = (g(row, 'income_type') || '') as IncomeType;
    res.txs.push({
      date, kind, platform, src: 'csv',
      inLeg: leg(g(row, 'received_asset') || '', parseAmount(g(row, 'received_qty'))),
      outLeg: leg(g(row, 'sent_asset') || '', parseAmount(g(row, 'sent_qty'))),
      fee: leg(g(row, 'fee_asset') || '', parseAmount(g(row, 'fee_qty'))),
      usd: isFinite(usd) ? usd : undefined, feeUsd: isFinite(feeUsd) ? feeUsd : undefined,
      incomeType: kind === 'income' ? (['staking', 'reward', 'airdrop', 'interest', 'other'].includes(it) ? it : 'other') : undefined,
      note: g(row, 'note') || undefined,
    });
  }
  res.platform = plats.size === 1 ? [...plats][0] : plats.size ? 'Plusieurs' : 'Autre';
  return res;
}

// ------------------------------------------------------------------ détection
export function parseRows(rows: string[][]): ParseResult | null {
  let hi: number;
  if ((hi = findHeader(rows, ['Timestamp', 'Transaction Type', 'Asset', 'Quantity Transacted'])) >= 0) return finish(parseCoinbase(rows, hi));
  if ((hi = findHeader(rows, ['UTC_Time', 'Operation', 'Coin', 'Change'])) >= 0 || (hi = findHeader(rows, ['Durée', 'Opération', 'Jeton', 'Change'])) >= 0) return finish(parseBinanceLedger(rows, hi));
  if ((hi = findHeader(rows, ['Date(UTC)', 'Pair', 'Side'])) >= 0 || (hi = findHeader(rows, ['Date(UTC)', 'Market', 'Type'])) >= 0) return finish(parseBinanceTrades(rows, hi));
  if ((hi = findHeader(rows, ['txid', 'refid', 'time', 'type', 'asset', 'amount'])) >= 0) return finish(parseKraken(rows, hi));
  if ((hi = findHeader(rows, ['Operation Date', 'Currency Ticker', 'Operation Type', 'Operation Amount'])) >= 0) return finish(parseLedger(rows, hi));
  if ((hi = findHeader(rows, ['date', 'type', 'received_asset'])) >= 0) return finish(parseGeneric(rows, hi));
  return null;
}

function finish(r: ParseResult): ParseResult {
  // opérations sans jambe utilisable : ignorées
  r.txs = r.txs.filter((t) => t.inLeg || t.outLeg || t.fee);
  r.txs = withKeys(r.txs);
  return r;
}

/** Entrée principale pour un fichier texte. */
export function parseText(text: string): ParseResult | null {
  return parseRows(parseCsv(text));
}
