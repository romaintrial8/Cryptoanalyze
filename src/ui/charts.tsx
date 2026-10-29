// Graphiques SVG maison (aucune bibliothèque) : largeur fluide, curseur + info-bulle au doigt comme à la souris.
import { useState, type ReactNode } from 'react';
import { useWidth } from './kit';
import { niceStep } from '../domain/calc';
import { dateFr, dateTimeFr, num, NBSP, price as fmtPrice, qty as fmtQty, timeFr, usd, usdSigned, MONTHS_ABBR as MONTHS } from '../domain/format';
const AXIS = 48; // largeur réservée aux graduations à droite

function hoverFromEvent(ev: React.PointerEvent<HTMLDivElement>, n: number): number {
  const rect = ev.currentTarget.getBoundingClientRect();
  const ratio = Math.min(Math.max((ev.clientX - rect.left) / rect.width, 0), 1);
  return Math.round(ratio * (n - 1));
}

/** Graduation compacte : 64 k$, 1,2 M$, 0,25 $. */
export function axisUsd(v: number, step = v): string {
  const a = Math.abs(v);
  if (a >= 1e6) return num(v / 1e6, 0, step < 1e6 ? 1 : 0) + NBSP + 'M$';
  if (a >= 1e4) return num(v / 1e3, 0, step < 1000 ? 1 : 0) + NBSP + 'k$';
  if (a >= 100) return num(v, 0) + NBSP + '$';
  const d = step >= 1 ? 0 : Math.min(8, Math.ceil(-Math.log10(step)) + (String(step).includes('25') ? 1 : 0));
  return num(v, d, d) + NBSP + '$';
}

/** Point horodaté (« 2026-10-28T14:05:00Z ») plutôt que quotidien (« 2026-10-28 »). */
const isTimed = (d: string) => d.length > 10;

function dateTick(d: string, days: number): string {
  if (isTimed(d) && days <= 2) return timeFr(d);
  return days <= 100 ? d.slice(8, 10) + '/' + d.slice(5, 7) : MONTHS[+d.slice(5, 7) - 1] + ' ' + d.slice(2, 4);
}

function xTicksFor(dates: string[], X: (i: number) => number, s: number, e: number, top: number): ReactNode[] {
  const days = (Date.parse(dates[e]) - Date.parse(dates[s])) / 864e5;
  const idx = Array.from(new Set([0, 1, 2, 3].map((k) => Math.round(s + ((e - s) * k) / 3))));
  return idx.map((i, k) => {
    const st: React.CSSProperties = k === 0 ? { left: 0 } : k === idx.length - 1 ? { right: AXIS } : { left: X(i) - 30, width: 60, textAlign: 'center' };
    return <span key={k} className="tick" style={{ top, ...st }}>{dateTick(dates[i], days)}</span>;
  });
}

// ------------------------------------------------------------------ Sparkline
export function Sparkline({ values, color, height = 40 }: { values: number[]; color: string; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>(72, 24);
  if (values.length < 2) return <div ref={ref} style={{ height }} />;
  const step = Math.max(1, Math.round(values.length / 62));
  const pts = values.filter((_, i) => i % step === 0 || i === values.length - 1);
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const X = (i: number) => (i / (pts.length - 1)) * w;
  const Y = (v: number) => (hi === lo ? height / 2 : height - 2 - ((v - lo) / (hi - lo)) * (height - 4));
  const d = pts.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ');
  return (
    <div ref={ref} style={{ height }}>
      <svg viewBox={`0 0 ${w} ${height}`} width={w} height={height} aria-hidden="true" data-component="Sparkline" style={{ display: 'block', overflow: 'visible' }}>
        <path d={d} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: color }} />
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------ Courbe de cours
export interface Marker { date: string; side: 'buy' | 'sell'; qty: number; price?: number }

export function PriceChart({ history, start, markers, pru, color, label, log, emptyText }: { history: [string, number][]; start: number; markers: Marker[]; pru?: number; color: string; label: string; log?: boolean; emptyText?: string }) {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const s = Math.max(0, Math.min(start, history.length - 2));
  const e = history.length - 1;
  if (history.length < 2) {
    return <div ref={ref} className="chart c-moderate t-caption" style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 var(--space-16)' }}>{emptyText || 'Historique indisponible'}</div>;
  }
  const W = cw - AXIS, H = 180, T = 8, B = T + H;
  let lo = Infinity, hi = -Infinity;
  for (let i = s; i <= e; i++) { lo = Math.min(lo, history[i][1]); hi = Math.max(hi, history[i][1]); }
  if (pru && pru > 0 && pru < hi * 1.6 && pru > lo / 1.6) { lo = Math.min(lo, pru); hi = Math.max(hi, pru); }
  const useLog = !!log && lo > 0;
  const f = (v: number) => (useLog ? Math.log10(v) : v);
  let flo = f(lo), fhi = f(hi);
  const pad = Math.max((fhi - flo) * 0.08, useLog ? 0.01 : Math.abs(fhi) * 0.01 || 0.01);
  flo -= pad; fhi += pad;
  if (!useLog && flo < 0 && lo >= 0) flo = 0;
  const X = (i: number) => ((i - s) / (e - s)) * W;
  const Y = (p: number) => T + H - ((f(p) - flo) / (fhi - flo)) * H;
  let line = '';
  for (let i = s; i <= e; i++) line += (i === s ? 'M' : 'L') + X(i).toFixed(1) + ',' + Y(history[i][1]).toFixed(1) + ' ';
  const area = line + 'L' + W + ',' + B + ' L0,' + B + ' Z';
  // graduations
  const ticks: number[] = [];
  if (useLog) {
    const vlo = Math.pow(10, flo), vhi = Math.pow(10, fhi);
    for (let p = Math.floor(flo); p <= Math.ceil(fhi); p++) for (const m of [1, 2, 5]) { const v = m * Math.pow(10, p); if (v >= vlo && v <= vhi) ticks.push(v); }
  } else {
    const step = niceStep((fhi - flo) / 4);
    for (let v = Math.ceil(flo / step) * step; v <= fhi + 1e-12; v += step) ticks.push(v);
  }
  const tstep = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : Math.abs(ticks[0] || 1);
  let grid = '';
  const yTicks: ReactNode[] = [];
  for (const v of ticks.slice(0, 8)) {
    const y = Y(v);
    grid += 'M0,' + y.toFixed(1) + ' H' + W + ' ';
    yTicks.push(<span key={v} className="tick" style={{ left: W + 6, top: y - 9 }}>{axisUsd(v, tstep)}</span>);
  }
  const dates = history.map((p) => p[0]);
  // repères d'achat / vente : seulement ceux qui tombent dans la période affichée
  const timed = isTimed(history[0][0]);
  const key = (d: string) => (timed ? d : d.slice(0, 10));
  const mk = markers.filter((m) => key(m.date) >= key(history[s][0]) && key(m.date) <= key(history[e][0]) + (timed ? '' : '\uffff'))
    .map((m) => ({ i: Math.max(s, history.findIndex((p) => key(p[0]) >= key(m.date))), m })).filter((x) => x.i >= s && x.i <= e);
  let h = hover;
  if (h === null || h < s || h > e) h = e;
  const hm = mk.filter((x) => x.i === h);
  const hx = X(h), hy = Y(history[h][1]);
  const tipLeft = Math.min(Math.max(hx - 70, 0), cw - 160);
  const tipTop = hy > 110 ? hy - 86 : hy + 14;
  const showPru = pru !== undefined && pru > 0 && f(pru) >= flo && f(pru) <= fhi;
  return (
    <div ref={ref} className="chart" data-component="PriceChart" style={{ height: 216 }}>
      <svg viewBox={`0 0 ${cw} 216`} width={cw} height="216" role="img" aria-label={label}>
        <defs>
          <linearGradient id="pc-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: color, stopOpacity: 0.22 }} />
            <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path d={grid} fill="none" strokeWidth="1" style={{ stroke: 'var(--chart-grid)' }} />
        <path d={area} fill="url(#pc-grad)" />
        <path d={line} fill="none" strokeWidth="2" strokeLinejoin="round" style={{ stroke: color }} />
        <line x1="0" x2={W} y1={B} y2={B} strokeWidth="1" style={{ stroke: 'var(--border-moderate)' }} />
      </svg>
      {yTicks}
      {xTicksFor(dates, X, s, e, 194)}
      {showPru && (
        <>
          <div style={{ position: 'absolute', left: 0, width: W, height: 0, borderTop: '2px dashed var(--chart-pru)', pointerEvents: 'none', top: Y(pru!) }} />
          <span className="badge" style={{ position: 'absolute', left: 4, top: Y(pru!) + 4, color: 'var(--warning-text)', background: 'var(--warning-bg)', padding: '0 var(--space-6)', pointerEvents: 'none' }}>PRU {fmtPrice(pru!)}</span>
        </>
      )}
      <div className="cross" style={{ top: T, height: H, left: hx }} />
      {mk.map((x, k) => (
        <span key={k} aria-hidden="true" className="marker-dot" style={{ background: 'var(--bg-surface)', border: `2px solid ${x.m.side === 'buy' ? 'var(--success)' : 'var(--critical)'}`, left: X(x.i) - 5, top: Y(history[x.i][1]) - 5 }} />
      ))}
      <div className="hit" style={{ width: W, height: B }} onPointerMove={(ev) => setHover(s + hoverFromEvent(ev, e - s + 1))} onPointerDown={(ev) => setHover(s + hoverFromEvent(ev, e - s + 1))} />
      <div role="status" className="tip" data-component="ChartTooltip" style={{ minWidth: 120, maxWidth: 170, whiteSpace: 'normal', left: tipLeft, top: tipTop }}>
        <span className="t-caption c-reverse-muted">{timed ? dateTimeFr(history[h][0]) : dateFr(history[h][0])}</span>
        <span className="t-amount-s" style={{ color: 'var(--text-reverse)' }}>{fmtPrice(history[h][1])}</span>
        {hm.slice(0, 3).map((x, k) => <span key={k} className="t-caption-strong" style={{ color: 'var(--brand-light)' }}>{x.m.side === 'buy' ? 'Achat' : 'Vente'} : {fmtQty(x.m.qty)}{x.m.price ? ' à ' + fmtPrice(x.m.price) : ''}</span>)}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Capital investi vs valeur
export function ValueChart({ points, labelCapital = 'Investi', labelValue = 'Valeur' }: { points: { date: string; capital: number; value: number }[]; labelCapital?: string; labelValue?: string }) {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  if (n < 2) return <div ref={ref} className="t-caption c-moderate" style={{ padding: 'var(--space-16) 0' }}>Pas encore assez d’historique pour tracer la courbe.</div>;
  const W = cw - AXIS, H = 160, T = 8, B = T + H;
  const mx = Math.max(...points.map((p) => Math.max(p.capital, p.value)), 1);
  const mn = Math.min(0, ...points.map((p) => Math.min(p.capital, p.value)));
  const step = niceStep((mx - mn) / 3);
  const top = Math.ceil(mx / step) * step, bot = Math.floor(mn / step) * step;
  const X = (i: number) => (i / (n - 1)) * W;
  const Y = (v: number) => T + H - ((v - bot) / (top - bot)) * H;
  const path = (k: 'capital' | 'value') => points.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(p[k]).toFixed(1)).join(' ');
  const band = (topF: (p: typeof points[0]) => number, botF: (p: typeof points[0]) => number) => {
    let d = points.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(topF(p)).toFixed(1)).join(' ');
    for (let i = n - 1; i >= 0; i--) d += ' L' + X(i).toFixed(1) + ',' + Y(botF(points[i])).toFixed(1);
    return d + ' Z';
  };
  const gain = band((p) => Math.max(p.value, p.capital), (p) => p.capital);
  const loss = band((p) => p.capital, (p) => Math.min(p.value, p.capital));
  const valLine = path('value'), capLine = path('capital');
  let grid = '';
  const yTicks: ReactNode[] = [];
  for (let v = bot; v <= top + 1e-6; v += step) {
    if (v === bot && v === 0) continue;
    grid += 'M0,' + Y(v).toFixed(1) + ' H' + W + ' ';
    yTicks.push(<span key={v} className="tick" style={{ left: W + 6, top: Y(v) - 9 }}>{axisUsd(v, step)}</span>);
  }
  const h = hover === null ? n - 1 : hover;
  const hp = points[h];
  const hx = X(h);
  const tipW = 150;
  const tipLeft = Math.min(Math.max(hx - tipW / 2, 0), W - tipW);
  const last = points[n - 1];
  return (
    <div ref={ref} className="chart" data-component="ValueChart" style={{ height: 196 }}>
      <svg viewBox={`0 0 ${cw} 196`} width={cw} height="196" role="img" aria-label={`${labelCapital} ${usd(last.capital, 0)}, ${labelValue} ${usd(last.value, 0)} au ${dateFr(last.date)}`}>
        <path d={grid} fill="none" strokeWidth="1" style={{ stroke: 'var(--chart-grid)' }} />
        <path d={valLine + ` L${W},${B} L0,${B} Z`} style={{ fill: 'var(--chart-value-area)' }} />
        <path d={gain} style={{ fill: 'var(--chart-gain-area)' }} />
        <path d={loss} style={{ fill: 'var(--chart-loss-area)' }} />
        <path d={capLine} fill="none" strokeWidth="2" strokeDasharray="4 3" style={{ stroke: 'var(--chart-deposited-line)' }} />
        <path d={valLine} fill="none" strokeWidth="2.5" strokeLinejoin="round" style={{ stroke: 'var(--chart-value)' }} />
        <line x1="0" x2={W} y1={B} y2={B} strokeWidth="1" style={{ stroke: 'var(--border-moderate)' }} />
      </svg>
      {yTicks}
      {xTicksFor(points.map((p) => p.date), X, 0, n - 1, 176)}
      <div className="cross" style={{ top: T, height: H, left: hx }} />
      <span aria-hidden="true" className="marker-dot" style={{ background: 'var(--chart-value)', border: '2px solid var(--bg-surface)', left: hx - 5, top: Y(hp.value) - 5 }} />
      <div className="hit" style={{ width: W, height: B }} onPointerMove={(ev) => setHover(hoverFromEvent(ev, n))} onPointerDown={(ev) => setHover(hoverFromEvent(ev, n))} />
      <div role="status" className="tip" data-component="ChartTooltip" style={{ width: tipW, left: tipLeft, top: Y(hp.value) > 90 ? 8 : 100 }}>
        <span className="t-caption-strong" style={{ color: 'var(--text-reverse)' }}>{dateFr(hp.date)}</span>
        <span className="t-caption c-reverse-muted">{labelCapital} {usd(hp.capital, 0)}</span>
        <span className="t-caption" style={{ color: 'var(--text-reverse)' }}>{labelValue} {usd(hp.value, 0)}</span>
        <span className="t-caption-strong" style={{ color: hp.value >= hp.capital ? 'var(--brand-light)' : '#FFB4AE' }}>{usdSigned(hp.value - hp.capital, 0)}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Donut
export interface Slice { value: number; color: string }

export function Donut({ slices, size = 160, ring = 24, label, children }: { slices: Slice[]; size?: number; ring?: number; label: string; children?: ReactNode }) {
  const c = size / 2, r = c - ring / 2 - 4;
  const C = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  const visible = slices.filter((x) => x.value > 0);
  const gap = visible.length > 1 ? 2 : 0;
  let off = 0;
  return (
    <div className="donut-wrap" style={{ width: size, height: size, alignSelf: 'center' }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label} data-component="DonutChart">
        {visible.length ? visible.map((x, i) => {
          const len = Math.max((x.value / total) * C - gap, 0.5);
          const el = <circle key={i} cx={c} cy={c} r={r} fill="none" strokeWidth={ring} strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`} strokeDashoffset={(-off).toFixed(2)} transform={`rotate(-90 ${c} ${c})`} style={{ stroke: x.color }} />;
          off += len + gap;
          return el;
        }) : <circle cx={c} cy={c} r={r} fill="none" strokeWidth={ring} style={{ stroke: 'var(--bg-grey-minimal)' }} />}
      </svg>
      <div className="donut-center">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------ barres horizontales
export function HBarList({ rows }: { rows: { label: string; value: string; ratio: number; color?: string; sub?: string }[] }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.ratio)), 1e-9);
  return (
    <ul className="stack" style={{ gap: 'var(--space-12)' }} data-component="HorizontalBarChart">
      {rows.map((r) => (
        <li key={r.label} className="stack-4">
          <span className="between"><span className="ellipsis">{r.label}{r.sub && <span className="t-caption c-moderate"> · {r.sub}</span>}</span><span className="t-strong nowrap">{r.value}</span></span>
          <span className="hbar"><span style={{ width: Math.min(100, (Math.abs(r.ratio) / max) * 100) + '%', background: r.color || 'var(--brand-primary)' }} /></span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ Projection (aires empilées)
export function StackedAreaChart({ years, label }: { years: { year: number; value: number; deposited: number }[]; label: string }) {
  const [ref, cw] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = years.length;
  const horizon = years[n - 1].year || 1;
  const W = cw - AXIS, H = 170, T = 8, B = T + H;
  const mx = Math.max(years[n - 1].value, 1);
  const step = niceStep(mx / 4);
  const top = Math.ceil(mx / step) * step;
  const X = (y: number) => (y / horizon) * W;
  const Y = (v: number) => T + H - (v / top) * H;
  const line = (k: 'value' | 'deposited') => years.map((p, i) => (i ? 'L' : 'M') + X(p.year).toFixed(1) + ',' + Y(p[k]).toFixed(1)).join(' ');
  const close = ` L${W},${B} L0,${B} Z`;
  let grid = '';
  const yTicks: ReactNode[] = [];
  for (let t = step; t <= top + 1e-6; t += step) {
    grid += 'M0,' + Y(t).toFixed(1) + ' H' + W + ' ';
    yTicks.push(<span key={t} className="tick" style={{ left: W + 6, top: Y(t) - 9 }}>{axisUsd(t, step)}</span>);
  }
  const half = Math.round(horizon / 2);
  const xTicks = ([[0, { left: 0 }], ...(half > 0 && half < horizon ? [[half, { left: X(half) - 30, width: 60, textAlign: 'center' }]] : []), [horizon, { right: AXIS }]] as [number, React.CSSProperties][]);
  const h = hover === null ? n - 1 : hover;
  const hp = years[h];
  const hx = X(hp.year);
  const tipLeft = Math.min(Math.max(hx - 70, 0), W - 140);
  return (
    <div ref={ref} className="chart" data-component="StackedAreaChart" style={{ height: 204 }}>
      <svg viewBox={`0 0 ${cw} 204`} width={cw} height="204" role="img" aria-label={label}>
        <path d={grid} fill="none" strokeWidth="1" style={{ stroke: 'var(--chart-grid)' }} />
        <path d={line('value') + close} style={{ fill: 'var(--chart-value)' }} />
        <path d={line('deposited') + close} style={{ fill: 'var(--chart-deposited)' }} />
        <line x1="0" x2={W} y1={B} y2={B} strokeWidth="1" style={{ stroke: 'var(--border-moderate)' }} />
      </svg>
      {yTicks}
      {xTicks.map(([y, st], i) => <span key={'x' + i} className="tick" style={{ top: 186, ...st }}>an {y}</span>)}
      <div className="cross" style={{ top: T, height: H, left: hx, borderLeftColor: 'var(--text)' }} />
      <div className="hit" style={{ width: W, height: B }} onPointerMove={(ev) => setHover(hoverFromEvent(ev, n))} onPointerDown={(ev) => setHover(hoverFromEvent(ev, n))} />
      <div role="status" className="tip" data-component="ChartTooltip" style={{ minWidth: 140, top: 12, left: tipLeft }}>
        <span className="t-caption-strong" style={{ color: 'var(--text-reverse)' }}>Année {hp.year}</span>
        <span className="t-caption c-reverse-muted">Versé {usd(hp.deposited, 0)}</span>
        <span className="t-caption" style={{ color: 'var(--brand-light)' }}>Gains {usdSigned(hp.value - hp.deposited, 0)}</span>
        <span className="t-amount-s" style={{ color: 'var(--text-reverse)' }}>{usd(hp.value, 0)}</span>
      </div>
    </div>
  );
}
