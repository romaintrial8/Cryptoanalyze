// Formatage français centralisé : montants en dollars, quantités crypto à décimales variables, dates.
export const NBSP = ' '; // entre nombre et unité
export const MINUS = '−';

const cache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number): Intl.NumberFormat {
  const k = min + ':' + max;
  let f = cache.get(k);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max });
    cache.set(k, f);
  }
  return f;
}

/** Nombre au format français (espace fine pour les milliers, virgule), signe moins typographique. */
export function num(v: number, min = 2, max = min): string {
  if (!isFinite(v)) return '—';
  const s = nf(min, max).format(Math.abs(v));
  return (v < 0 && Math.abs(v) >= Math.pow(10, -max) / 2 ? MINUS : '') + s;
}

/** Montant en dollars : « 1 234,56 $ ». */
export function usd(v: number, decimals = 2, maxDecimals = decimals): string {
  if (!isFinite(v)) return '—';
  return num(v, decimals, maxDecimals) + NBSP + '$';
}

/** Montant signé (+ explicite pour les gains). */
export function usdSigned(v: number, decimals = 2): string {
  if (!isFinite(v)) return '—';
  const r = Math.round(v * Math.pow(10, decimals));
  return (r > 0 ? '+' : '') + usd(v, decimals);
}

/** Montant arrondi pour les grandes valeurs (graphiques, cartes) : 12 345 $ ; 12,3 k$ au-delà de 100 000. */
export function usdShort(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return num(v / 1e6, 1, 2) + NBSP + 'M$';
  if (a >= 1e5) return num(v / 1e3, 0, 1) + NBSP + 'k$';
  if (a >= 1000) return num(v, 0) + NBSP + '$';
  return usd(v, a >= 100 ? 0 : 2);
}

/** Cours unitaire : décimales adaptées à l'ordre de grandeur (64 312 $, 1,0002 $, 0,00001234 $). */
export function price(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1000) return usd(v, 2);
  if (a >= 1) return usd(v, 2, 4);
  if (a >= 0.01) return usd(v, 4, 4);
  if (a === 0) return usd(0);
  const digits = Math.min(12, Math.ceil(-Math.log10(a)) + 3);
  return usd(v, 2, digits);
}

/** Quantité de crypto : jusqu'à 8 décimales significatives, sans zéros inutiles. */
export function qty(v: number, maxDecimals?: number): string {
  if (!isFinite(v)) return '—';
  const a = Math.abs(v);
  let max = maxDecimals ?? (a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 6 : 8);
  if (a > 0 && a < 1e-8) max = 12;
  return num(v, 0, max);
}

export function pct(ratio: number, decimals = 1): string {
  if (!isFinite(ratio)) return '—';
  return num(ratio * 100, decimals) + NBSP + '%';
}

export function pctSigned(ratio: number, decimals = 1): string {
  if (!isFinite(ratio)) return '—';
  const r = Math.round(ratio * 100 * Math.pow(10, decimals));
  return (r > 0 ? '+' : '') + pct(ratio, decimals);
}

export function arrow(v: number): string {
  return v >= 0 ? '▲' : '▼';
}

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const MONTHS_TITLE = MONTHS_LONG.map((m) => m.charAt(0).toUpperCase() + m.slice(1));
export const MONTHS_ABBR = MONTHS_SHORT;

/** 'AAAA-MM-JJ…' → 'jj/mm/aaaa' */
export function dateFr(iso: string): string {
  if (!iso) return '';
  return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
}
/** 'AAAA-MM-JJ' → 'jj/mm' */
export function dateShort(iso: string): string {
  return iso.slice(8, 10) + '/' + iso.slice(5, 7);
}
/** 'AAAA-MM' → 'sept. 26' */
export function monthShort(ym: string): string {
  return MONTHS_SHORT[+ym.slice(5, 7) - 1] + ' ' + ym.slice(2, 4);
}
/** 'AAAA-MM' → 'septembre 2026' */
export function monthLong(ym: string): string {
  return MONTHS_LONG[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
}
export function weekday(iso: string): string {
  return WEEKDAYS[new Date(iso.slice(0, 10) + 'T12:00:00').getDay()];
}
export function dateLong(iso: string): string {
  const d = weekday(iso);
  return d.charAt(0).toUpperCase() + d.slice(1) + ' ' + +iso.slice(8, 10) + ' ' + MONTHS_SHORT[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4);
}

/** Date et heure locales d'un horodatage ISO : « 07/09/2026 à 14:05 ». */
export function dateTimeFr(isoDateTime: string): string {
  if (!isoDateTime) return '';
  const d = new Date(isoDateTime);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' à ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/** Heure locale « 14:05 » d'un horodatage ISO. */
export function timeFr(isoDateTime: string): string {
  const d = new Date(isoDateTime);
  if (isNaN(d.getTime())) return '';
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/** Saisie « 1 234,56 » ou « 1234.56 » → nombre (NaN si vide ou invalide). */
export function parseNum(s: string): number {
  let t = String(s).replace(/[\s  $€%]/g, '');
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else t = t.replace(',', '.');
  if (t === '' || t === '-' || t === '.') return NaN;
  const v = Number(t);
  return isFinite(v) ? v : NaN;
}

/** Nombre → texte de champ « 34,28 » (sans séparateur de milliers ni zéros inutiles). */
export function toInput(v: number, maxDecimals = 8): string {
  if (!isFinite(v)) return '';
  return String(Number(v.toFixed(maxDecimals))).replace('.', ',');
}

export function todayIso(d = new Date()): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** Pluriel simple. */
export function plural(n: number, one: string, many: string): string {
  return (Math.abs(n) >= 2 ? many : one).replace('{n}', num(n, 0));
}
