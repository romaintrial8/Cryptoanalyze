// Simulateurs : achat programmé (DCA) rejoué sur l'historique réel, et projection à rendement constant.
import type { History } from './calc';
import { priceAt } from './calc';

export interface DcaResult {
  points: { date: string; capital: number; value: number }[];
  invested: number;
  units: number;
  value: number;
  avgPrice: number;
  buys: number;
  lumpValue: number; // même total investi en une fois au premier achat
}

function addMonths(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

/** Achat de `amount` $ tous les mois pendant `months` mois, en finissant ce mois-ci (frais ignorés). */
export function dcaBacktest(h: History, amount: number, months: number, today: string): DcaResult | null {
  if (h.length < 2 || amount <= 0 || months < 1) return null;
  const first = addMonths(today, -(months - 1));
  const dates: string[] = [];
  for (let k = 0; k < months; k++) dates.push(addMonths(first, k));
  const usable = dates.filter((d) => d >= h[0][0] && d <= today);
  if (!usable.length) return null;
  let units = 0, invested = 0, bi = 0;
  const points: DcaResult['points'] = [];
  const startIdx = h.findIndex((p) => p[0] >= usable[0]);
  for (let i = Math.max(0, startIdx); i < h.length; i++) {
    const [d, p] = h[i];
    while (bi < usable.length && usable[bi] <= d) { const px = priceAt(h, usable[bi])!; units += amount / px; invested += amount; bi++; }
    points.push({ date: d, capital: invested, value: units * p });
  }
  const lastPrice = h[h.length - 1][1];
  const p0 = priceAt(h, usable[0])!;
  return { points, invested, units, value: units * lastPrice, avgPrice: invested / units, buys: usable.length, lumpValue: (invested / p0) * lastPrice };
}

/** Capital initial + versements mensuels, rendement annuel constant (capitalisation mensuelle). */
export function projection(start: number, monthly: number, years: number, rate: number): { year: number; value: number; deposited: number }[] {
  const r = Math.pow(1 + rate, 1 / 12) - 1;
  let v = start, dep = start;
  const out = [{ year: 0, value: v, deposited: dep }];
  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) { v = v * (1 + r) + monthly; dep += monthly; }
    out.push({ year: y, value: v, deposited: dep });
  }
  return out;
}
