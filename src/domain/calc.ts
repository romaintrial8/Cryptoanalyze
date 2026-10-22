// Moteur de calcul : rejoue toutes les opérations dans l'ordre chronologique.
// Méthode : prix de revient unitaire moyen pondéré (PRU) par crypto, en USD.
//  - achat  : coût += montant payé + frais ;          vente : plus-value = produit net − PRU × quantité vendue
//  - échange crypto ↔ crypto : traité comme une vente de l'actif donné et un achat de l'actif reçu, à la valeur USD
//    de l'opération ; si cette valeur est inconnue, le coût est simplement reporté (aucune plus-value constatée)
//  - transfert entre deux plateformes (envoi + réception rapprochés) : neutre, le coût suit les jetons
//  - revenu (staking, récompense…) : coût = valeur à la réception (0 si inconnue)
// Fonctions pures : aucune date « maintenant » cachée, aucun accès au stockage.
import type { Leg, Position, Summary, Tx } from './types';
import { isFiat, isUsdStable } from './assets';

export type FxTable = Record<string, Record<string, number>>;

/** Taux de secours (USD pour 1 unité) quand le taux du jour n'est pas encore chargé : signalé comme estimé. */
export const FX_FALLBACK: Record<string, number> = { EUR: 1.1, GBP: 1.28, CAD: 0.73, AUD: 0.66, CHF: 1.15, JPY: 0.0068, TRY: 0.03, BRL: 0.18, MXN: 0.055 };

/** Taux de change USD d'une devise à une date : taux du jour, sinon le plus proche (avant, puis après). */
export function fxRate(fx: FxTable, cur: string, date: string): { rate: number; estimated: boolean } | null {
  if (cur === 'USD') return { rate: 1, estimated: false };
  const table = fx[cur];
  if (table) {
    if (table[date]) return { rate: table[date], estimated: false };
    const days = Object.keys(table).sort();
    if (days.length) {
      let lo = 0, hi = days.length - 1, best = -1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (days[m] <= date) { best = m; lo = m + 1; } else hi = m - 1; }
      const pick = best >= 0 ? days[best] : days[0];
      const gap = Math.abs(Date.parse(pick) - Date.parse(date)) / 864e5;
      return { rate: table[pick], estimated: gap > 7 };
    }
  }
  return FX_FALLBACK[cur] ? { rate: FX_FALLBACK[cur], estimated: true } : null;
}

/** Valeur USD d'une jambe quand elle est « monétaire » (USD, devise, stablecoin dollar). */
export function legUsd(leg: Leg | undefined, date: string, fx: FxTable): number | undefined {
  if (!leg) return undefined;
  if (leg.asset === 'USD' || isUsdStable(leg.asset)) return leg.qty;
  if (isFiat(leg.asset)) { const r = fxRate(fx, leg.asset, date); return r ? leg.qty * r.rate : undefined; }
  return undefined;
}

/** Valeur USD brute d'une opération (fournie par l'export, sinon déduite d'une jambe monétaire). */
export function txUsd(tx: Tx, fx: FxTable): number | undefined {
  if (tx.usd !== undefined && isFinite(tx.usd)) return tx.usd;
  const d = tx.date.slice(0, 10);
  return legUsd(tx.outLeg, d, fx) ?? legUsd(tx.inLeg, d, fx);
}

// à horodatage identique : on acquiert avant de céder (un envoi ne doit jamais précéder l'achat de la même seconde)
const KIND_ORDER: Record<string, number> = { cash_in: 0, cash_out: 0, trade: 1, income: 2, fee: 3, transfer_out: 4, transfer_in: 5 };

export function sortTxs(txs: Tx[]): Tx[] {
  return txs.map((t, i) => ({ t, i })).sort((a, b) => (a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : (KIND_ORDER[a.t.kind] - KIND_ORDER[b.t.kind]) || a.i - b.i)).map((x) => x.t);
}

// ------------------------------------------------------------------ rapprochement des transferts
/** Associe chaque réception de crypto à l'envoi correspondant (même actif, quantité proche, dates voisines). */
export function pairTransfers(txs: Tx[]): Map<string, string> {
  const outs = txs.filter((t) => t.kind === 'transfer_out' && t.outLeg && !isFiat(t.outLeg.asset)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const ins = txs.filter((t) => t.kind === 'transfer_in' && t.inLeg && !isFiat(t.inLeg.asset)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const used = new Set<string>();
  const pairs = new Map<string, string>(); // id réception → id envoi
  for (const i of ins) {
    const ti = Date.parse(i.date);
    let best: Tx | null = null, bestScore = Infinity;
    for (const o of outs) {
      if (used.has(o.id) || o.outLeg!.asset !== i.inLeg!.asset) continue;
      const dt = (ti - Date.parse(o.date)) / 36e5; // heures, positif si la réception suit l'envoi
      if (dt < -2 || dt > 24 * 7) continue;
      const sent = o.outLeg!.qty, got = i.inLeg!.qty;
      if (got > sent * 1.0001 + 1e-12 || got < sent * 0.9) continue;
      const score = Math.abs(dt) + (1 - got / sent) * 100 + (o.platform === i.platform ? 50 : 0);
      if (score < bestScore) { bestScore = score; best = o; }
    }
    if (best) { used.add(best.id); pairs.set(i.id, best.id); }
  }
  return pairs;
}

// ------------------------------------------------------------------ registre
export interface AssetState {
  qty: number;
  cost: number;
  realized: number;
  income: number;
  fees: number;
  platforms: Record<string, number>;
  firstDate: string;
  txCount: number;
  estimated: boolean;
  shortfall: number; // quantité vendue/envoyée sans solde suffisant (historique incomplet ?)
}

export interface TxInfo { usd?: number; realized?: number; estimated?: boolean; valueEstimated?: boolean; paired?: boolean; feeUsd?: number }

/** Cours d'une crypto à une date (historique de marché), pour valoriser ce que l'export ne valorise pas. */
export type PriceFn = (asset: string, day: string) => number | undefined;

export interface Flow { date: string; amount: number } // < 0 : argent investi ; > 0 : argent récupéré

export interface LedgerResult {
  assets: Map<string, AssetState>;
  fiatSpent: number;
  fiatReceived: number;
  unmatchedIn: number;
  unmatchedOut: number;
  fees: number;
  income: number;
  realized: number;
  flows: Flow[];
  info: Map<string, TxInfo>;
  warnings: string[];
}

export interface DaySnapshot { date: string; qty: Record<string, number>; capital: number }

/**
 * Rejoue les opérations. `onDay` (facultatif) reçoit l'état à la fin de chaque jour où il s'est passé quelque chose
 * (utilisé pour la courbe « capital investi / valeur »).
 */
export function runLedger(txsIn: Tx[], fx: FxTable, onDay?: (s: DaySnapshot) => void, px?: PriceFn): LedgerResult {
  const pairs = pairTransfers(txsIn);
  // Valeur de secours quand l'export ne donne pas de prix (intérêts Binance, achats par carte, conversions) :
  // cours de marché du jour s'il est connu, sinon prix de vos propres opérations à ±30 jours.
  const implied = impliedPrices(txsIn, fx);
  const est = (a: string, day: string): number | undefined => (isUsdStable(a) ? 1 : isFiat(a) ? fxRate(fx, a, day)?.rate : px?.(a, day) ?? nearestPrice(implied.get(a), day, 30));
  const outOf = new Map<string, Tx>();
  for (const t of txsIn) outOf.set(t.id, t);
  const pairedOut = new Set(pairs.values());
  // une réception rapprochée est traitée juste après son envoi (si elle a été horodatée un peu avant)
  const txs = sortTxs(txsIn.map((t) => {
    const oid = pairs.get(t.id);
    if (!oid) return t;
    const o = outOf.get(oid)!;
    return t.date < o.date ? { ...t, date: o.date } : t;
  }));
  const assets = new Map<string, AssetState>();
  const info = new Map<string, TxInfo>();
  const inTransit = new Map<string, number>(); // id envoi → coût en transit
  const r: LedgerResult = { assets, fiatSpent: 0, fiatReceived: 0, unmatchedIn: 0, unmatchedOut: 0, fees: 0, income: 0, realized: 0, flows: [], info, warnings: [] };
  const st = (a: string, date: string): AssetState => {
    let s = assets.get(a);
    if (!s) assets.set(a, (s = { qty: 0, cost: 0, realized: 0, income: 0, fees: 0, platforms: {}, firstDate: date, txCount: 0, estimated: false, shortfall: 0 }));
    return s;
  };
  const touch = (a: string, date: string) => { st(a, date).txCount++; };
  let shortRatio = 0; // part de la dernière quantité cédée qui manquait dans l'historique
  const dispose = (a: string, qty: number, platform: string, date: string): number => {
    const s = st(a, date);
    const take = Math.min(qty, Math.max(s.qty, 0));
    const cost = s.qty > 1e-15 ? (s.cost * take) / s.qty : 0;
    shortRatio = qty > 0 ? (qty - take) / qty : 0;
    if (qty - take > Math.max(1e-9, qty * 1e-6)) s.shortfall += qty - take; else shortRatio = 0;
    s.qty -= take;
    s.cost -= cost;
    if (s.qty < 1e-12) { s.qty = 0; s.cost = 0; }
    s.platforms[platform] = (s.platforms[platform] || 0) - qty;
    return cost;
  };
  const acquire = (a: string, qty: number, cost: number, platform: string, date: string) => {
    const s = st(a, date);
    if (s.qty === 0 && s.txCount === 0) s.firstDate = date;
    s.qty += qty;
    s.cost += cost;
    s.platforms[platform] = (s.platforms[platform] || 0) + qty;
  };
  const flow = (date: string, amount: number) => { if (amount) r.flows.push({ date, amount }); };

  let curDay = '';
  const snapshot = () => {
    if (!onDay || !curDay) return;
    const qty: Record<string, number> = {};
    for (const [a, s] of assets) if (s.qty > 0) qty[a] = s.qty;
    onDay({ date: curDay, qty, capital: r.fiatSpent - r.fiatReceived + r.unmatchedIn - r.unmatchedOut });
  };

  for (const tx of txs) {
    const day = tx.date.slice(0, 10);
    if (day !== curDay) { snapshot(); curDay = day; }
    const p = tx.platform || '—';
    const inL = tx.inLeg && tx.inLeg.qty > 0 ? tx.inLeg : undefined;
    const outL = tx.outLeg && tx.outLeg.qty > 0 ? tx.outLeg : undefined;
    const fee = tx.fee && tx.fee.qty > 0 ? tx.fee : undefined;
    const ti: TxInfo = {};
    info.set(tx.id, ti);

    if (tx.kind === 'trade' && inL && outL) {
      const known = txUsd(tx, fx);
      const inCrypto = !isFiat(inL.asset), outCrypto = !isFiat(outL.asset);
      if (!inCrypto && !outCrypto) continue; // change de devises : sans effet sur le portefeuille crypto
      let V = known;
      if (V === undefined) {
        const pi = est(inL.asset, day), po = est(outL.asset, day);
        V = pi !== undefined ? pi * inL.qty : po !== undefined ? po * outL.qty : undefined;
        if (V !== undefined) ti.valueEstimated = true;
      }
      ti.usd = V;
      // frais
      let feeCash = 0, feeSameIn = 0, feeCrypto = 0;
      if (fee) {
        if (isFiat(fee.asset)) feeCash = tx.feeUsd ?? legUsd(fee, day, fx) ?? 0;
        else if (inCrypto && fee.asset === inL.asset) feeSameIn = Math.min(fee.qty, inL.qty);
        else { feeCrypto = dispose(fee.asset, fee.qty, p, day); touch(fee.asset, day); }
      }
      const feeUsd = tx.feeUsd ?? (feeCash || (feeSameIn && V !== undefined ? (V * feeSameIn) / inL.qty : 0) || (fee && !isFiat(fee.asset) && fee.asset !== inL.asset ? legUsd(fee, day, fx) ?? (est(fee.asset, day) ?? 0) * fee.qty : 0) || feeCrypto);
      ti.feeUsd = feeUsd;
      r.fees += feeUsd;
      if (!outCrypto) {
        // achat avec de la monnaie
        const paid = V ?? legUsd(outL, day, fx) ?? 0;
        r.fiatSpent += paid + feeCash;
        flow(day, -(paid + feeCash));
        acquire(inL.asset, inL.qty - feeSameIn, (V ?? paid) + feeCash + feeCrypto, p, day);
        st(inL.asset, day).fees += feeUsd;
        touch(inL.asset, day);
      } else if (!inCrypto) {
        // vente contre de la monnaie
        const got = V ?? legUsd(inL, day, fx) ?? 0;
        // part cédée absente de l'historique : coût supposé égal au prix de cession (aucun gain inventé)
        const outCost = dispose(outL.asset, outL.qty, p, day) + (V ?? got) * shortRatio;
        const proceeds = (V ?? got) - feeCash - feeCrypto;
        const gain = proceeds - outCost;
        const s = st(outL.asset, day);
        s.realized += gain; s.fees += feeUsd; r.realized += gain; ti.realized = gain;
        r.fiatReceived += got - feeCash;
        flow(day, got - feeCash);
        touch(outL.asset, day);
      } else {
        // échange crypto ↔ crypto (stablecoins compris)
        const outCost = dispose(outL.asset, outL.qty, p, day) + (V ?? 0) * shortRatio;
        if (V !== undefined) {
          // vente contre un stablecoin avec frais prélevés sur le stablecoin : les frais réduisent le produit de la vente
          const feeOnProceeds = feeSameIn && isUsdStable(inL.asset) ? (V * feeSameIn) / inL.qty : 0;
          const gain = V - feeOnProceeds - outCost;
          st(outL.asset, day).realized += gain; r.realized += gain; ti.realized = gain;
          acquire(inL.asset, inL.qty - feeSameIn, V - feeOnProceeds + feeCash + feeCrypto, p, day);
        } else {
          acquire(inL.asset, inL.qty - feeSameIn, outCost + feeCash + feeCrypto, p, day);
          if (!isUsdStable(inL.asset)) st(inL.asset, day).estimated = true;
          ti.estimated = true;
        }
        if (feeCash) { r.fiatSpent += feeCash; flow(day, -feeCash); }
        st(inL.asset, day).fees += feeUsd;
        touch(outL.asset, day); touch(inL.asset, day);
      }
      continue;
    }

    if (tx.kind === 'income' && inL) {
      let V = txUsd(tx, fx);
      if (V === undefined) { const e = est(inL.asset, day); if (e !== undefined) { V = e * inL.qty; ti.valueEstimated = true; } }
      ti.usd = V;
      if (isFiat(inL.asset)) { const v = V ?? 0; r.income += v; r.fiatReceived += v; flow(day, v); continue; }
      acquire(inL.asset, inL.qty, V ?? 0, p, day);
      const s = st(inL.asset, day);
      s.income += V ?? 0; r.income += V ?? 0;
      if (V === undefined) { ti.estimated = true; }
      touch(inL.asset, day);
      continue;
    }

    if (tx.kind === 'transfer_out' && outL && !isFiat(outL.asset)) {
      const cost = dispose(outL.asset, outL.qty, p, day);
      let feeCost = 0;
      if (fee && fee.asset === outL.asset) feeCost = dispose(fee.asset, fee.qty, p, day);
      else if (fee && !isFiat(fee.asset)) feeCost = dispose(fee.asset, fee.qty, p, day);
      const feeUsd = tx.feeUsd ?? (fee ? legUsd(fee, day, fx) ?? feeCost : 0);
      r.fees += feeUsd; st(outL.asset, day).fees += feeUsd; ti.feeUsd = feeUsd;
      touch(outL.asset, day);
      if (pairedOut.has(tx.id)) { inTransit.set(tx.id, cost); ti.paired = true; }
      else { r.unmatchedOut += cost; flow(day, cost); ti.usd = tx.usd; }
      continue;
    }

    if (tx.kind === 'transfer_in' && inL && !isFiat(inL.asset)) {
      const oid = pairs.get(tx.id);
      if (oid !== undefined) {
        const o = outOf.get(oid)!;
        const cost = inTransit.get(oid) ?? 0;
        inTransit.delete(oid);
        const sent = o.outLeg!.qty;
        const kept = sent > 0 ? cost * Math.min(1, inL.qty / sent) : cost;
        const lost = cost - kept; // frais de réseau prélevés pendant le transfert
        if (lost > 0) { r.fees += lost; st(inL.asset, day).fees += lost; }
        acquire(inL.asset, inL.qty, kept, p, day);
        ti.paired = true;
      } else {
        let V = tx.usd ?? legUsd(inL, day, fx);
        if (V === undefined) { const e = est(inL.asset, day); if (e !== undefined) { V = e * inL.qty; ti.valueEstimated = true; } }
        acquire(inL.asset, inL.qty, V ?? 0, p, day);
        r.unmatchedIn += V ?? 0;
        flow(day, -(V ?? 0));
        if (V === undefined) { st(inL.asset, day).estimated = true; ti.estimated = true; }
        ti.usd = V;
      }
      touch(inL.asset, day);
      continue;
    }

    if (tx.kind === 'fee' && fee && !isFiat(fee.asset)) {
      const cost = dispose(fee.asset, fee.qty, p, day);
      const e = est(fee.asset, day);
      const feeUsd = tx.feeUsd ?? legUsd(fee, day, fx) ?? (e !== undefined ? e * fee.qty : cost);
      r.fees += feeUsd; st(fee.asset, day).fees += feeUsd; ti.feeUsd = feeUsd;
      touch(fee.asset, day);
      continue;
    }
    // cash_in / cash_out et devises : affichage uniquement
  }
  snapshot();
  // envois rapprochés dont la réception n'a jamais été traitée (cas limite) : sortis du portefeuille
  for (const c of inTransit.values()) r.unmatchedOut += c;
  for (const [a, s] of assets) {
    if (s.shortfall > 0) r.warnings.push(`${a} : ${fmtQ(s.shortfall)} vendus ou envoyés sans solde suffisant. L'historique de ${a} semble incomplet (opérations antérieures ou autre plateforme non importées).`);
  }
  return r;
}

function fmtQ(q: number): string {
  return q.toLocaleString('fr-FR', { maximumSignificantDigits: 6 });
}

// ------------------------------------------------------------------ positions et synthèse
export interface Quote { usd: number; change24h: number | null }
export type QuoteFn = (asset: string) => Quote | null;

export function computePositions(led: LedgerResult, quote: QuoteFn): Position[] {
  const out: Position[] = [];
  for (const [asset, s] of led.assets) {
    if (isFiat(asset)) continue;
    if (s.qty <= 1e-12 && Math.abs(s.realized) < 1e-9 && !s.income) continue;
    const q = quote(asset) ?? (isUsdStable(asset) ? { usd: 1, change24h: 0 } : null);
    const price = q ? q.usd : null;
    const value = price !== null ? s.qty * price : 0;
    const unrealized = price !== null ? value - s.cost : 0;
    const platforms: Record<string, number> = {};
    for (const [k, v] of Object.entries(s.platforms)) if (v > s.qty * 1e-6 && v > 1e-12) platforms[k] = v;
    out.push({
      asset, qty: s.qty, cost: s.cost, pru: s.qty > 0 ? s.cost / s.qty : 0, price, value, unrealized,
      unrealizedPct: s.cost > 0 ? unrealized / s.cost : 0, realized: s.realized, income: s.income, fees: s.fees,
      change24h: q ? q.change24h : null, weight: 0, platforms, firstDate: s.firstDate, txCount: s.txCount,
      stable: isUsdStable(asset), costEstimated: s.estimated,
    });
  }
  const total = out.reduce((x, p) => x + p.value, 0);
  for (const p of out) p.weight = total > 0 ? p.value / total : 0;
  return out.sort((a, b) => b.value - a.value || b.qty - a.qty);
}

export function computeSummary(led: LedgerResult, positions: Position[], txCount: number, today: string, dust = 1): Summary {
  const held = positions.filter((p) => p.qty > 0);
  const value = held.reduce((s, p) => s + p.value, 0);
  const capital = led.fiatSpent - led.fiatReceived + led.unmatchedIn - led.unmatchedOut;
  const gain = value - capital;
  let change24h = 0;
  for (const p of held) if (p.change24h !== null && p.price !== null) change24h += p.value - p.value / (1 + p.change24h);
  const prev = value - change24h;
  const firstDate = held.length || led.flows.length ? [...led.assets.values()].reduce((m, s) => (s.firstDate < m ? s.firstDate : m), '9999') : '';
  return {
    value, capital, fiatSpent: led.fiatSpent, fiatReceived: led.fiatReceived,
    costBasis: held.reduce((s, p) => s + p.cost, 0),
    unrealized: held.reduce((s, p) => s + p.unrealized, 0),
    realized: led.realized, income: led.income, fees: led.fees,
    gain, gainPct: capital > 0 ? gain / capital : NaN,
    change24h, change24hPct: prev > 0 ? change24h / prev : 0,
    assets: held.filter((p) => p.value >= dust || p.price === null).length,
    txCount, firstDate: firstDate === '9999' ? '' : firstDate,
    unmatchedIn: led.unmatchedIn, unmatchedOut: led.unmatchedOut,
    missingPrices: held.filter((p) => p.price === null).map((p) => p.asset),
    warnings: led.warnings,
    xirr: xirr(led.flows, value, today),
  };
}

// ------------------------------------------------------------------ TRI (XIRR)
export function xirr(flows: Flow[], terminal: number, today: string): number | null {
  const fl = flows.filter((f) => f.amount !== 0);
  if (!fl.length || terminal < 0) return null;
  const t0 = Date.parse(fl.reduce((m, f) => (f.date < m ? f.date : m), fl[0].date));
  const T = Date.parse(today);
  if ((T - t0) / 864e5 < 30) return null; // moins d'un mois : un taux annualisé n'aurait pas de sens
  const all = [...fl.map((f) => ({ y: (Date.parse(f.date) - t0) / (365.25 * 864e5), a: f.amount })), { y: (T - t0) / (365.25 * 864e5), a: terminal }];
  if (!all.some((x) => x.a > 0) || !all.some((x) => x.a < 0)) return null;
  const npv = (r: number) => all.reduce((s, x) => s + x.a / Math.pow(1 + r, x.y), 0);
  let lo = -0.9999, hi = 100;
  let flo = npv(lo), fhi = npv(hi);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

// ------------------------------------------------------------------ séries
export type History = [string, number][]; // [AAAA-MM-JJ, cours USD], trié

/** Cours à une date : dernier point connu à cette date ou avant. */
export function priceAt(h: History | undefined, date: string): number | undefined {
  if (!h || !h.length || h[0][0] > date) return undefined;
  let lo = 0, hi = h.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (h[m][0] <= date) lo = m; else hi = m - 1; }
  return h[lo][1];
}

/** Cours le plus proche d'une date (avant ou après), à au plus `maxDays` jours. */
export function nearestPrice(h: History | undefined, date: string, maxDays: number): number | undefined {
  if (!h || !h.length) return undefined;
  let lo = 0, hi = h.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (h[m][0] < date) lo = m + 1; else hi = m; }
  let best: [string, number] | undefined, gap = Infinity;
  for (const k of [lo - 1, lo]) {
    if (k < 0 || k >= h.length) continue;
    const g = Math.abs(Date.parse(h[k][0]) - Date.parse(date)) / 864e5;
    if (g < gap) { gap = g; best = h[k]; }
  }
  return best && gap <= maxDays ? best[1] : undefined;
}

/** Cours implicites tirés des opérations (valeur USD ÷ quantité) : secours quand l'historique de marché manque. */
export function impliedPrices(txs: Tx[], fx: FxTable): Map<string, History> {
  const m = new Map<string, History>();
  const add = (a: string, d: string, p: number) => { if (!isFinite(p) || p <= 0) return; let h = m.get(a); if (!h) m.set(a, (h = [])); h.push([d, p]); };
  for (const t of sortTxs(txs)) {
    const V = t.kind === 'trade' || t.kind === 'income' || t.kind === 'transfer_in' ? txUsd(t, fx) : undefined;
    if (V === undefined || V <= 0) continue;
    const d = t.date.slice(0, 10);
    if (t.inLeg && !isFiat(t.inLeg.asset) && !isUsdStable(t.inLeg.asset)) add(t.inLeg.asset, d, V / t.inLeg.qty);
    if (t.kind === 'trade' && t.outLeg && !isFiat(t.outLeg.asset) && !isUsdStable(t.outLeg.asset)) add(t.outLeg.asset, d, V / t.outLeg.qty);
  }
  return m;
}

export interface SeriesPoint { date: string; capital: number; value: number }

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Valeur du portefeuille et capital investi, jour par jour, du premier achat à aujourd'hui. */
export function dailySeries(txs: Tx[], fx: FxTable, hist: (asset: string) => History | undefined, today: string, current?: QuoteFn, px?: PriceFn): SeriesPoint[] {
  if (!txs.length) return [];
  const snaps: DaySnapshot[] = [];
  runLedger(txs, fx, (s) => snaps.push(s), px);
  if (!snaps.length) return [];
  const implied = impliedPrices(txs, fx);
  const out: SeriesPoint[] = [];
  let k = 0;
  let cur: DaySnapshot = snaps[0];
  const last = new Map<string, number>();
  for (let d = snaps[0].date; d <= today; d = addDays(d, 1)) {
    while (k < snaps.length && snaps[k].date <= d) cur = snaps[k++];
    let value = 0;
    for (const [a, q] of Object.entries(cur.qty)) {
      let p: number | undefined = isUsdStable(a) ? 1 : priceAt(hist(a), d) ?? priceAt(implied.get(a), d);
      if (d === today && current) { const c = current(a); if (c) p = c.usd; }
      if (p === undefined) p = last.get(a);
      if (p !== undefined) { last.set(a, p); value += q * p; }
    }
    out.push({ date: d, capital: cur.capital, value });
    if (out.length > 4000) break;
  }
  return out;
}

/** Pas de graduation « rond » (1, 2, 2,5, 5 × 10ⁿ). */
export function niceStep(raw: number): number {
  if (!isFinite(raw) || raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** Libellé d'une opération pour le journal. */
export function txCategory(t: Tx): 'buy' | 'sell' | 'swap' | 'income' | 'transfer' | 'cash' | 'fee' {
  if (t.kind === 'trade') {
    const inF = t.inLeg ? isFiat(t.inLeg.asset) : false, outF = t.outLeg ? isFiat(t.outLeg.asset) : false;
    if (outF && !inF) return 'buy';
    if (inF && !outF) return 'sell';
    if (t.outLeg && isUsdStable(t.outLeg.asset) && t.inLeg && !isUsdStable(t.inLeg.asset)) return 'buy';
    if (t.inLeg && isUsdStable(t.inLeg.asset) && t.outLeg && !isUsdStable(t.outLeg.asset)) return 'sell';
    return 'swap';
  }
  if (t.kind === 'income') return 'income';
  if (t.kind === 'transfer_in' || t.kind === 'transfer_out') return 'transfer';
  if (t.kind === 'cash_in' || t.kind === 'cash_out') return 'cash';
  return 'fee';
}
