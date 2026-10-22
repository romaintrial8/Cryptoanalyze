// Composants partagés (même kit que PEAnalyze, adapté à la crypto).
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Icon, Logo } from './icons';
import { back, closeSheet, navigate, tabOf, useRoute, type Tab } from './router';
import { refreshPrices, usePrices } from '../data/prices';
import { arrow, dateLong, dateTimeFr, pctSigned, MONTHS_TITLE, timeFr, todayIso } from '../domain/format';

// ------------------------------------------------------------------ mesure
export function useWidth<T extends HTMLElement>(fallback = 326, min = 200): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(min, Math.round(el.getBoundingClientRect().width)));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return [ref, w];
}

export function useScrolled(threshold = 20): boolean {
  const [s, setS] = useState(false);
  useEffect(() => {
    let raf = 0;
    const on = () => { raf = 0; setS(window.scrollY >= threshold); };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(on); };
    on();
    window.addEventListener('scroll', schedule, { passive: true });
    return () => { window.removeEventListener('scroll', schedule); if (raf) cancelAnimationFrame(raf); };
  }, [threshold]);
  return s;
}

// ------------------------------------------------------------------ en-têtes
export function useUpdatedText(): string {
  const ps = usePrices();
  if (ps.loading && !ps.updatedAt) return 'Chargement des cours…';
  if (!ps.updatedAt) return 'Cours non chargés';
  const sameDay = ps.updatedAt.slice(0, 10) === new Date().toISOString().slice(0, 10) && new Date(ps.updatedAt).toDateString() === new Date().toDateString();
  return sameDay ? `Cours à ${timeFr(ps.updatedAt)}` : `Cours du ${dateTimeFr(ps.updatedAt)}`;
}

export function AppHeader({ title }: { title: string }) {
  const compact = useScrolled();
  const updated = useUpdatedText();
  const ps = usePrices();
  return (
    <header className={'app-header' + (compact ? ' compact' : '')} data-component="AppHeader">
      <div className="bar">
        <div className="titles">
          <h1>{title}</h1>
          <span className="updated">{updated}</span>
        </div>
        <div className="actions">
          <button type="button" className={'icon-btn' + (ps.loading ? ' spin' : '')} aria-label="Actualiser les cours" onClick={() => refreshPrices({ force: true })} disabled={ps.loading}>
            <Icon name="refresh" />
          </button>
          <a href="#/parametres" className="icon-btn" aria-label="Paramètres" onClick={(e) => { e.preventDefault(); navigate('/parametres'); }}>
            <Icon name="settings" />
          </a>
        </div>
      </div>
    </header>
  );
}

export function SubHeader({ title, fallback, close, bordered, right }: { title: string; fallback: string; close?: boolean; bordered?: boolean; right?: ReactNode }) {
  return (
    <header className={'sub-header' + (bordered ? ' bordered' : '')}>
      <div className="bar">
        <button type="button" className={'icon-btn' + (close ? ' neutral' : '')} aria-label={close ? 'Fermer sans enregistrer' : 'Retour'} onClick={() => back(fallback)}>
          <Icon name={close ? 'close' : 'back'} />
        </button>
        <h1>{title}</h1>
        {right || <span />}
      </div>
    </header>
  );
}

/** Bandeau d'erreur des cours : l'app reste utilisable avec les dernières valeurs connues. */
export function PriceErrorBanner() {
  const ps = usePrices();
  if (!ps.error || ps.loading) return null;
  return (
    <div role="alert" className="banner-error">
      <Icon name="alert" size={20} />
      <span>{ps.updatedAt ? `Cours indisponibles – dernières valeurs du ${dateTimeFr(ps.updatedAt)}` : 'Cours indisponibles'} ({ps.error})</span>
      <button type="button" onClick={() => refreshPrices({ force: true })}>Réessayer</button>
    </div>
  );
}

// ------------------------------------------------------------------ sous-navigation
export function SubNav({ items, label, children, bordered }: { items: { to: string; label: string }[]; label: string; children?: ReactNode; bordered?: boolean }) {
  const route = useRoute();
  return (
    <div className={'subnav' + (bordered ? ' bordered' : '')}>
      <nav aria-label={label} className="seg" data-component="SegmentedControl">
        {items.map((it) => (
          <a key={it.to} href={'#' + it.to} aria-current={route.path === it.to ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); if (route.path !== it.to) navigate(it.to, { replace: true }); }}>
            {it.label}
          </a>
        ))}
      </nav>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="seg" data-component="SegmentedControl">
      {options.map(([id, l]) => (
        <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>{l}</button>
      ))}
    </div>
  );
}

export function ChipGroup<T extends string>({ value, options, onChange, label, className }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={className ?? 'row wrap'} style={className ? undefined : { gap: 'var(--space-6)' }}>
      {options.map(([id, l]) => (
        <button key={id} type="button" className="chip" aria-pressed={value === id} onClick={() => onChange(id)}>{l}</button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ navigation principale
const TABS: { id: Exclude<Tab, 'none'>; label: string; to: string; icon: string }[] = [
  { id: 'portefeuille', label: 'Portefeuille', to: '/portefeuille', icon: 'portefeuille' },
  { id: 'historique', label: 'Historique', to: '/historique', icon: 'historique' },
  { id: 'marches', label: 'Marchés', to: '/marches', icon: 'marches' },
  { id: 'simulateur', label: 'Simulateur', to: '/simulateur', icon: 'simulateur' },
];

export function TabBar() {
  const route = useRoute();
  const active = tabOf(route.path);
  const go = (to: string) => (e: React.MouseEvent) => { e.preventDefault(); if (route.path !== to) navigate(to); };
  const updated = useUpdatedText();
  return (
    <>
      <nav aria-label="Navigation principale" className="tabbar" data-component="TabBar">
        {TABS.map((t) => (
          <a key={t.id} href={'#' + t.to} aria-current={active === t.id ? 'page' : undefined} onClick={go(t.to)}>
            <span className="pill"><Icon name={t.icon} /></span>
            {t.label}
          </a>
        ))}
      </nav>
      <aside className="sidenav" aria-label="Navigation principale">
        <Logo size={20} />
        <nav>
          {TABS.map((t) => (
            <a key={t.id} href={'#' + t.to} aria-current={active === t.id ? 'page' : undefined} onClick={go(t.to)}>
              <Icon name={t.icon} />{t.label}
            </a>
          ))}
          <a href="#/historique/import" aria-current={route.path === '/historique/import' ? 'page' : undefined} onClick={go('/historique/import')}>
            <Icon name="upload" />Importer
          </a>
          <a href="#/parametres" aria-current={route.path.startsWith('/parametres') ? 'page' : undefined} onClick={go('/parametres')}>
            <Icon name="settings" />Paramètres
          </a>
        </nav>
        <div className="foot">{updated}</div>
      </aside>
    </>
  );
}

export function Fab({ onClick, label = 'Ajouter une opération' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="fab" aria-label={label} onClick={onClick} data-component="Button.fab">
      <Icon name="plus" />
    </button>
  );
}

// ------------------------------------------------------------------ feuilles
export function Sheet({ title, children, footer, full, onClose = closeSheet, head }: { title: string; children: ReactNode; footer?: ReactNode; full?: boolean; onClose?: () => void; head?: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        // focus piégé dans la feuille
        const f = ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [onClose]);
  return (
    <>
      <div className="overlay" onClick={onClose} aria-hidden="true" />
      <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={'sheet' + (full ? ' full' : '')} data-component={full ? 'BottomSheet.full' : 'BottomSheet'} style={{ outline: 'none' }}>
        <span className="handle" aria-hidden="true" />
        <div className="sheet-head" style={full ? { borderBottom: '1px solid var(--divider-minimal)' } : undefined}>
          <div className="between">
            <h2 className="t-h2">{title}</h2>
            <button type="button" className="icon-btn neutral" aria-label="Fermer" onClick={onClose} style={{ marginRight: 'calc(-1 * var(--space-10))' }}>
              <Icon name="close" />
            </button>
          </div>
          {head}
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ toasts
interface ToastState { id: number; text: string; undo?: () => void; error?: boolean }
let toast: ToastState | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const toastListeners = new Set<() => void>();
export function showToast(text: string, opts: { undo?: () => void; error?: boolean } = {}) {
  toast = { id: Date.now(), text, ...opts };
  toastListeners.forEach((l) => l());
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast = null; toastListeners.forEach((l) => l()); }, opts.undo ? 6000 : 3500);
}
export function ToastHost() {
  const t = useSyncExternalStore((l) => { toastListeners.add(l); return () => toastListeners.delete(l); }, () => toast);
  if (!t) return null;
  return (
    <div role="status" className={'toast' + (t.error ? ' error' : '')} key={t.id} data-component="Toast">
      <Icon name={t.error ? 'alert' : 'success'} />
      <span className="t-strong">{t.text}</span>
      {t.undo ? <button type="button" onClick={() => { t.undo!(); toast = null; toastListeners.forEach((l) => l()); }}>Annuler</button> : <span />}
    </div>
  );
}

// ------------------------------------------------------------------ petits éléments
export function VarChip({ ratio, suffix, prefix }: { ratio: number | null; suffix?: string; prefix?: string }) {
  if (ratio === null || !isFinite(ratio)) return <span className="var-chip flat">—</span>;
  const r = Math.round(ratio * 1000);
  return <span className={'var-chip' + (r < 0 ? ' down' : r === 0 ? ' flat' : '')}>{arrow(ratio)} {prefix}{pctSigned(ratio)}{suffix}</span>;
}

export function Switch({ checked, onChange, labelledBy, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; labelledBy?: string; label?: string; disabled?: boolean }) {
  return <button type="button" role="switch" className="switch" aria-checked={checked} aria-labelledby={labelledBy} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} data-component="Toggle" />;
}

export function Empty({ icon = 'inbox', title, text, action }: { icon?: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty" data-component="EmptyState">
      <span className="empty-icon"><Icon name={icon} size={40} /></span>
      <h2 className="t-h3">{title}</h2>
      <p className="c-neutral">{text}</p>
      {action}
    </div>
  );
}

/** Calendrier : mois navigable. */
export function DatePicker({ value, onChange, label = 'Date' }: { value: string; onChange: (iso: string) => void; label?: string }) {
  const [view, setView] = useState(value.slice(0, 7));
  const y = +view.slice(0, 4), m = +view.slice(5, 7);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const shift = (k: number) => { let mm = m + k, yy = y; if (mm < 1) { mm = 12; yy--; } if (mm > 12) { mm = 1; yy++; } setView(yy + '-' + String(mm).padStart(2, '0')); };
  const today = todayIso();
  return (
    <div className="datepicker" data-component="DatePicker">
      <div className="head">
        <span className="overline">{label}</span>
        <span className="t-h3">{dateLong(value)}</span>
      </div>
      <div className="body">
        <div className="month">
          <button type="button" className="icon-btn" aria-label="Mois précédent" onClick={() => shift(-1)}><Icon name="back" size={20} /></button>
          <span>{MONTHS_TITLE[m - 1]} {y}</span>
          <button type="button" className="icon-btn" aria-label="Mois suivant" onClick={() => shift(1)}><Icon name="next" size={20} /></button>
        </div>
        <div className="grid">
          {'L,M,M,J,V,S,D'.split(',').map((d, i) => <span key={i}>{d}</span>)}
          {Array.from({ length: offset }, (_, i) => <button key={'b' + i} type="button" disabled tabIndex={-1} />)}
          {Array.from({ length: days }, (_, i) => {
            const iso = view + '-' + String(i + 1).padStart(2, '0');
            return <button key={iso} type="button" aria-pressed={iso === value} disabled={iso > today} className={iso === today ? 'today' : undefined} onClick={() => onChange(iso)}>{i + 1}</button>;
          })}
        </div>
      </div>
    </div>
  );
}

export function Hero({ label, value, chip, chipDown, children, className = '' }: { label: string; value: string; chip?: string; chipDown?: boolean; children?: ReactNode; className?: string }) {
  return (
    <section aria-label={label} className={'hero ' + className} data-component="Card.hero">
      <div className="stack-4">
        <span className="overline">{label}</span>
        <span className="t-display">{value}</span>
        {chip && <span className="row"><span className={'chip-reverse' + (chipDown ? ' down' : '')}>{chip}</span></span>}
      </div>
      {children}
    </section>
  );
}

/** Indicateur avec info-bulle « ℹ︎ » (définition en une phrase). */
export function KpiGrid({ items }: { items: { id: string; label: string; value: string; tone?: 'gain' | 'loss' | 'neutral'; help: string }[] }) {
  const [info, setInfo] = useState<string | null>(null);
  const cur = items.find((k) => k.id === info);
  return (
    <div className="stack-8">
      <section aria-label="Indicateurs" className="grid-2 kpi-grid">
        {items.map((k) => (
          <div key={k.id} className="kpi" data-component="KpiCard">
            <span className="label">{k.label}</span>
            <span className="value" style={{ color: k.tone === 'gain' ? 'var(--success-text)' : k.tone === 'loss' ? 'var(--critical-text)' : 'var(--text)' }}>{k.value}</span>
            <button type="button" className="icon-btn info" aria-label={'Explication : ' + k.label} aria-expanded={info === k.id} onClick={() => setInfo(info === k.id ? null : k.id)}>
              <Icon name="info" size={18} />
            </button>
          </div>
        ))}
      </section>
      {cur && (
        <div role="note" className="note">
          <Icon name="info" size={20} />
          <span><strong>{cur.label}</strong> — {cur.help}</span>
        </div>
      )}
    </div>
  );
}

export const tone = (v: number): 'gain' | 'loss' | 'neutral' => (v > 0.004 ? 'gain' : v < -0.004 ? 'loss' : 'neutral');
