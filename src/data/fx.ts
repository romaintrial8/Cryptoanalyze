// Taux de change BCE (via Frankfurter, gratuit, sans clé, CORS autorisé) pour convertir en USD les opérations
// réglées dans une autre devise (achats en euros sur Binance par exemple). Taux stockés dans les données.
import { isFiat } from '../domain/assets';
import { fxRate } from '../domain/calc';
import { getData, update } from './store';

const HOSTS = ['https://api.frankfurter.dev/v1', 'https://api.frankfurter.app'];

function needed(): Map<string, { min: string; max: string; dates: string[] }> {
  const d = getData();
  const m = new Map<string, { min: string; max: string; dates: string[] }>();
  for (const t of d.txs) {
    for (const l of [t.inLeg, t.outLeg, t.fee]) {
      if (!l || !isFiat(l.asset) || l.asset === 'USD') continue;
      const day = t.date.slice(0, 10);
      let e = m.get(l.asset);
      if (!e) m.set(l.asset, (e = { min: day, max: day, dates: [] }));
      if (day < e.min) e.min = day;
      if (day > e.max) e.max = day;
      e.dates.push(day);
    }
  }
  return m;
}

let running = false;
/** Charge les taux manquants. Renvoie le nombre de devises mises à jour. */
export async function ensureFx(): Promise<number> {
  if (running) return 0;
  running = true;
  let n = 0;
  try {
    for (const [cur, r] of needed()) {
      const missing = r.dates.some((day) => { const x = fxRate(getData().fx, cur, day); return !x || x.estimated; });
      if (!missing) continue;
      const from = new Date(Date.parse(r.min) - 7 * 864e5).toISOString().slice(0, 10);
      for (const host of HOSTS) {
        try {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), 15000);
          const res = await fetch(`${host}/${from}..${r.max}?base=${cur}&symbols=USD`, { signal: ctl.signal });
          clearTimeout(timer);
          if (!res.ok) continue;
          const j = (await res.json()) as { rates?: Record<string, { USD?: number }> };
          const rates: Record<string, number> = {};
          for (const [day, v] of Object.entries(j.rates || {})) if (v.USD) rates[day] = v.USD;
          if (Object.keys(rates).length) {
            update((d) => { d.fx[cur] = { ...(d.fx[cur] || {}), ...rates }; }, { touch: false });
            n++;
            break;
          }
        } catch { /* hôte suivant */ }
      }
    }
  } finally {
    running = false;
  }
  return n;
}
