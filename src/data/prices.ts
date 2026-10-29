// Cours : deux sources complémentaires, sans clé d'API exposée.
//  1. public/prices.json : top 250 CoinGecko (cours, variations 24 h / 7 j, mini-courbe 7 j), mis à jour par le robot
//     GitHub Actions et publié avec le site. Toujours disponible, même si CoinGecko limite les appels du téléphone.
//  2. API publique CoinGecko appelée directement par le navigateur (CORS autorisé, sans clé) pour les cours les plus
//     frais des cryptos détenues ou suivies, et pour leur historique quotidien (365 jours, mis en cache 12 h).
// Les cours ne font pas partie des données synchronisées : chaque appareil les récupère lui-même.
import { useSyncExternalStore } from 'react';
import { BUILTIN_COINS, isFiat, isUsdStable } from '../domain/assets';
import type { History, Quote } from '../domain/calc';
import type { AppData } from '../domain/types';
import { getData, getPrefs, subscribe as subscribeData } from './store';

const API = 'https://api.coingecko.com/api/v3';
const KEY = 'cryptoanalyze:prices';
const HKEY = 'cryptoanalyze:hist:';
const HIST_TTL = 12 * 3600e3;

export interface CoinQuote {
  id: string;
  symbol: string;
  name: string;
  usd: number;
  ch24: number | null; // ratio
  ch7d?: number | null;
  spark?: number[]; // 7 jours
  rank?: number;
  image?: string;
}

export interface PriceState {
  quotes: Record<string, CoinQuote>; // par identifiant CoinGecko
  catalog: CoinQuote[]; // top 250 du robot, par capitalisation
  updatedAt: string; // dernière mise à jour réussie (ISO)
  robotAt: string; // horodatage du fichier du robot
  source: 'live' | 'robot' | '';
  loading: boolean;
  error: string;
  histVersion: number;
  histLoading: number;
  histError: string;
}

function loadState(): PriceState {
  const base: PriceState = { quotes: {}, catalog: [], updatedAt: '', robotAt: '', source: '', loading: false, error: '', histVersion: 0, histLoading: 0, histError: '' };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw); return { ...base, quotes: s.quotes || {}, catalog: s.catalog || [], updatedAt: s.updatedAt || '', robotAt: s.robotAt || '', source: s.source || '' }; }
  } catch { /* stockage indisponible */ }
  return base;
}

let state: PriceState = typeof localStorage === 'undefined' ? loadState() : loadState();
const listeners = new Set<() => void>();
function set(p: Partial<PriceState>, save = false) {
  state = { ...state, ...p };
  if (save) {
    try { localStorage.setItem(KEY, JSON.stringify({ quotes: state.quotes, catalog: state.catalog, updatedAt: state.updatedAt, robotAt: state.robotAt, source: state.source })); } catch { /* quota */ }
  }
  rebuildIndex();
  listeners.forEach((l) => l());
}
export function usePrices(): PriceState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}
export function getPriceState(): PriceState {
  return state;
}

// ------------------------------------------------------------------ symbole → identifiant CoinGecko
let index = new Map<string, CoinQuote | { id: string; symbol: string; name: string }>();
function rebuildIndex() {
  const m = new Map<string, CoinQuote | { id: string; symbol: string; name: string }>();
  for (const c of BUILTIN_COINS) if (!m.has(c.symbol)) m.set(c.symbol, c);
  // le catalogue du robot (classé par capitalisation) prime sur la liste intégrée
  const seen = new Set<string>();
  for (const c of state.catalog) { if (seen.has(c.symbol)) continue; seen.add(c.symbol); m.set(c.symbol, c); }
  index = m;
}
rebuildIndex();

export function coinIdOf(symbol: string, d: AppData = getData()): string | undefined {
  return d.coinIds[symbol] || index.get(symbol)?.id;
}
export function coinName(symbol: string, d: AppData = getData()): string {
  const id = coinIdOf(symbol, d);
  const q = id ? state.quotes[id] : undefined;
  return q?.name || index.get(symbol)?.name || symbol;
}
export function knownSymbol(symbol: string): boolean {
  return index.has(symbol);
}

/** Cours actuel d'une crypto (null si inconnu). Les stablecoins dollar valent 1 $ par défaut. */
export function quoteOf(symbol: string, d: AppData = getData()): Quote | null {
  const id = coinIdOf(symbol, d);
  const q = id ? state.quotes[id] : undefined;
  if (q && isFinite(q.usd)) return { usd: q.usd, change24h: q.ch24 };
  if (isUsdStable(symbol)) return { usd: 1, change24h: 0 };
  return null;
}
export function fullQuote(symbol: string, d: AppData = getData()): CoinQuote | undefined {
  const id = coinIdOf(symbol, d);
  return id ? state.quotes[id] : undefined;
}

/** Cryptos dont on a besoin des cours : détenues un jour + suivies. */
export function neededSymbols(d: AppData = getData()): string[] {
  const s = new Set<string>();
  for (const t of d.txs) for (const l of [t.inLeg, t.outLeg, t.fee]) if (l && !isFiat(l.asset)) s.add(l.asset);
  for (const w of d.watch) s.add(w);
  return [...s];
}

// ------------------------------------------------------------------ réseau
async function getJson(url: string, timeout = 15000): Promise<unknown> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const key = getPrefs().cgKey;
    const headers: Record<string, string> = {};
    if (key && url.startsWith(API)) headers['x-cg-demo-api-key'] = key;
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store', headers });
    if (r.status === 429) throw new Error('limite d’appels CoinGecko atteinte, réessayez dans une minute');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('délai dépassé');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

interface RobotFile { updatedAt: string; coins: { id: string; symbol: string; name: string; rank: number; usd: number; ch24: number | null; ch7d: number | null; spark?: number[]; image?: string }[] }

let lastFetch = 0;
export async function refreshPrices(opts: { force?: boolean } = {}): Promise<void> {
  if (state.loading) return;
  if (!opts.force && Date.now() - lastFetch < 60e3) return;
  lastFetch = Date.now();
  set({ loading: true });
  const quotes = { ...state.quotes };
  let catalog = state.catalog, robotAt = state.robotAt, source: PriceState['source'] = '';
  const errors: string[] = [];
  // 1. fichier du robot (même origine)
  try {
    const url = new URL('prices.json', document.baseURI).toString() + '?t=' + Date.now();
    const f = (await getJson(url)) as RobotFile;
    if (f && Array.isArray(f.coins) && f.coins.length) {
      catalog = f.coins.map((c) => ({ ...c, symbol: c.symbol.toUpperCase() }));
      for (const c of catalog) quotes[c.id] = { ...quotes[c.id], ...c };
      robotAt = f.updatedAt;
      source = 'robot';
    }
  } catch (e) {
    errors.push('fichier des cours : ' + (e as Error).message);
  }
  // 2. cours en direct des cryptos détenues ou suivies
  set({ catalog }); // l'index symbole → identifiant profite tout de suite du catalogue
  const d = getData();
  const ids = [...new Set(neededSymbols(d).map((s) => coinIdOf(s, d)).filter(Boolean) as string[])];
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const r = (await getJson(`${API}/simple/price?ids=${encodeURIComponent(chunk.join(','))}&vs_currencies=usd&include_24hr_change=true`)) as Record<string, { usd?: number; usd_24h_change?: number }>;
      for (const id of chunk) {
        const v = r[id];
        if (!v || typeof v.usd !== 'number') continue;
        const sym = Object.entries(d.coinIds).find(([, x]) => x === id)?.[0] || [...index.values()].find((c) => c.id === id)?.symbol || id.toUpperCase();
        quotes[id] = { ...(quotes[id] || { id, symbol: sym, name: index.get(sym)?.name || sym }), usd: v.usd, ch24: typeof v.usd_24h_change === 'number' ? v.usd_24h_change / 100 : null };
      }
    }
    if (ids.length) source = 'live';
  } catch (e) {
    errors.push('CoinGecko : ' + (e as Error).message);
  }
  const ok = source !== '';
  set({ quotes, catalog, robotAt, source: ok ? source : state.source, loading: false, updatedAt: ok ? new Date().toISOString() : state.updatedAt, error: ok ? '' : errors.join(' · ') || 'réseau indisponible' }, ok);
  void loadHistories();
}

// ------------------------------------------------------------------ historiques quotidiens
const hist = new Map<string, { at: number; pts: History }>();
function readHist(id: string): { at: number; pts: History } | undefined {
  let h = hist.get(id);
  if (!h) {
    try { const raw = localStorage.getItem(HKEY + id); if (raw) { h = JSON.parse(raw); hist.set(id, h!); } } catch { /* ignore */ }
  }
  return h;
}

/** Historique quotidien (USD) d'une crypto, s'il a été chargé. */
export function historyOf(symbol: string, d: AppData = getData()): History | undefined {
  const id = coinIdOf(symbol, d);
  return id ? readHist(id)?.pts : undefined;
}

let histRunning = false;
const histQueue: string[] = [];
/** Charge (au plus une fois par 12 h) l'historique des cryptos utiles ; `first` passe devant (écran de détail). */
export async function loadHistories(first?: string): Promise<void> {
  const d = getData();
  const want = [first, ...neededSymbols(d)].filter(Boolean) as string[];
  for (const s of want) {
    if (isUsdStable(s)) continue;
    const id = coinIdOf(s, d);
    if (!id) continue;
    const h = readHist(id);
    if (h && Date.now() - h.at < HIST_TTL) continue;
    if (!histQueue.includes(id)) { if (s === first) histQueue.unshift(id); else histQueue.push(id); }
  }
  if (histRunning || !histQueue.length) return;
  histRunning = true;
  set({ histLoading: histQueue.length, histError: '' });
  try {
    while (histQueue.length) {
      const id = histQueue.shift()!;
      try {
        const r = (await getJson(`${API}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=365&interval=daily`, 20000)) as { prices?: [number, number][] };
        const byDay = new Map<string, number>();
        for (const [ms, p] of r.prices || []) if (isFinite(p)) byDay.set(new Date(ms).toISOString().slice(0, 10), p);
        const pts = [...byDay].sort((a, b) => (a[0] < b[0] ? -1 : 1)) as History;
        const entry = { at: Date.now(), pts };
        hist.set(id, entry);
        try { localStorage.setItem(HKEY + id, JSON.stringify(entry)); } catch { /* quota : reste en mémoire */ }
        set({ histVersion: state.histVersion + 1, histLoading: histQueue.length });
      } catch (e) {
        set({ histError: (e as Error).message });
        if (/limite/.test((e as Error).message)) { histQueue.length = 0; break; }
      }
      await new Promise((r) => setTimeout(r, 2500)); // API publique : quelques appels par minute
    }
  } finally {
    histRunning = false;
    set({ histLoading: 0 });
  }
}

// ------------------------------------------------------------------ cours intrajournaliers
// API publique CoinGecko : 1 jour → un point toutes les 5 min ; 7 jours → un point par heure. Gardés en mémoire seulement.
const intra = new Map<string, { at: number; pts: [string, number][] }>();
const intraLoading = new Set<string>();
let intraVersion = 0;
const intraListeners = new Set<() => void>();
export function useIntradayVersion(): number {
  return useSyncExternalStore((l) => { intraListeners.add(l); return () => intraListeners.delete(l); }, () => intraVersion);
}
/** Points horodatés (ISO) d'une crypto sur 1 ou 7 jours, s'ils sont chargés. */
export function intradayOf(symbol: string, days: 1 | 7): [string, number][] | undefined {
  const id = coinIdOf(symbol);
  return id ? intra.get(id + '|' + days)?.pts : undefined;
}
export function intradayLoading(symbol: string, days: 1 | 7): boolean {
  const id = coinIdOf(symbol);
  return !!id && intraLoading.has(id + '|' + days);
}
/** Charge (au plus toutes les 60 s pour 1 jour, 10 min pour 7 jours) les cours fins d'une crypto. */
export async function loadIntraday(symbol: string, days: 1 | 7, force = false): Promise<void> {
  const id = coinIdOf(symbol);
  if (!id || isUsdStable(symbol)) return;
  const k = id + '|' + days;
  const cur = intra.get(k);
  if (intraLoading.has(k) || (!force && cur && Date.now() - cur.at < (days === 1 ? 60e3 : 600e3))) return;
  intraLoading.add(k);
  intraVersion++; intraListeners.forEach((l) => l());
  try {
    const r = (await getJson(`${API}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`)) as { prices?: [number, number][] };
    const pts = (r.prices || []).filter(([, p]) => isFinite(p)).map(([ms, p]) => [new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z'), p] as [string, number]);
    if (pts.length) intra.set(k, { at: Date.now(), pts });
  } catch (e) {
    set({ histError: (e as Error).message });
  } finally {
    intraLoading.delete(k);
    intraVersion++; intraListeners.forEach((l) => l());
  }
}

/** Démarrage : cours à l'ouverture, puis toutes les 5 minutes tant que l'app est visible. */
export function startAutoRefresh(): void {
  setTimeout(() => void refreshPrices({ force: true }), 300);
  setInterval(() => { if (document.visibilityState === 'visible') void refreshPrices(); }, 5 * 60e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - lastFetch > 5 * 60e3) void refreshPrices(); });
  // nouvelles cryptos importées : leurs cours sont chargés sans attendre
  let known = neededSymbols().join(',');
  subscribeData(() => {
    const now = neededSymbols().join(',');
    if (now !== known) { known = now; lastFetch = 0; void refreshPrices(); }
  });
}

/** Recherche dans le catalogue (robot + liste intégrée). */
export function searchCoins(q: string): { id: string; symbol: string; name: string; usd?: number; ch24?: number | null; rank?: number }[] {
  const s = q.trim().toLowerCase();
  const all = new Map<string, { id: string; symbol: string; name: string; usd?: number; ch24?: number | null; rank?: number }>();
  for (const c of state.catalog) all.set(c.id, c);
  for (const c of BUILTIN_COINS) if (!all.has(c.id)) all.set(c.id, { ...c, ...(state.quotes[c.id] || {}) });
  const list = [...all.values()];
  if (!s) return list.slice(0, 100);
  return list.filter((c) => c.symbol.toLowerCase().startsWith(s) || c.name.toLowerCase().includes(s) || c.id.includes(s))
    .sort((a, b) => Number(b.symbol.toLowerCase() === s) - Number(a.symbol.toLowerCase() === s) || (a.rank ?? 9999) - (b.rank ?? 9999)).slice(0, 60);
}
