// Onglet Marchés : Mes cryptos (détenues + suivies), Catalogue (top 250, recherche), fiche d'une crypto.
import { useEffect, useMemo, useState } from 'react';
import { AppHeader, ChipGroup, Empty, PriceErrorBanner, SubHeader, SubNav, Switch, VarChip, showToast } from '../ui/kit';
import { PriceChart, Sparkline, type Marker } from '../ui/charts';
import { CheckFilled, Icon } from '../ui/icons';
import { navigate } from '../ui/router';
import { useCalc } from '../ui/useCalc';
import { CoinAvatar, coinColor } from '../ui/coins';
import { coinIdOf, coinName, fullQuote, historyOf, intradayLoading, intradayOf, loadHistories, loadIntraday, quoteOf, searchCoins, useIntradayVersion, usePrices } from '../data/prices';
import { update } from '../data/store';
import { txCategory } from '../domain/calc';
import { isFiat } from '../domain/assets';
import { dateFr, pct, pctSigned, price, qty, usd, usdShort, usdSigned } from '../domain/format';
import { txTitle } from './History';

const NAV = [{ to: '/marches', label: 'Mes cryptos' }, { to: '/marches/catalogue', label: 'Catalogue' }];

function toggleWatch(symbol: string, on: boolean) {
  update((d) => { d.watch = on ? [...new Set([...d.watch, symbol])] : d.watch.filter((w) => w !== symbol); });
}

function spark(symbol: string): number[] {
  const q = fullQuote(symbol);
  if (q?.spark && q.spark.length > 2) return q.spark;
  const h = historyOf(symbol);
  return h ? h.slice(-30).map((p) => p[1]) : [];
}

export function MyCoinsScreen() {
  const { data, held } = useCalc();
  usePrices();
  const heldSet = new Set(held.filter((p) => p.value >= data.settings.smallThreshold || p.price === null).map((p) => p.asset));
  const list = [...heldSet, ...data.watch.filter((w) => !heldSet.has(w))];
  return (
    <div className="screen" data-screen="marches">
      <AppHeader title="Marchés" />
      <PriceErrorBanner />
      <SubNav items={NAV} label="Sections Marchés" />
      <main className="content">
        <div className="between t-caption c-moderate"><span>{heldSet.size} détenue{heldSet.size > 1 ? 's' : ''} · {list.length - heldSet.size} suivie{list.length - heldSet.size > 1 ? 's' : ''}</span>
          <button type="button" className="btn btn-tertiary" onClick={() => navigate('/marches/catalogue', { replace: true })}><Icon name="plus" size={18} />Suivre une crypto</button></div>
        {!list.length && <Empty icon="candle" title="Aucune crypto suivie" text="Ajoutez des cryptos depuis le catalogue pour suivre leur cours." />}
        <ul className="stack-12 dcols-2">
          {list.map((s) => {
            const q = quoteOf(s);
            const fq = fullQuote(s);
            const own = heldSet.has(s);
            return (
              <li key={s}>
                <a href={'#/marches/crypto/' + s} className="card" style={{ textDecoration: 'none', color: 'var(--text)', display: 'grid', gridTemplateColumns: '40px 1fr 72px auto', gap: 'var(--space-12)', alignItems: 'center' }}
                  onClick={(e) => { e.preventDefault(); navigate('/marches/crypto/' + s); }}>
                  <CoinAvatar symbol={s} />
                  <span className="stack" style={{ minWidth: 0 }}>
                    <span className="t-amount-m ellipsis">{coinName(s)}</span>
                    <span className="t-caption c-moderate ellipsis">{s}{fq?.rank ? ` · n° ${fq.rank}` : ''}{own ? '' : ' · suivie'}</span>
                  </span>
                  <Sparkline values={spark(s)} color={coinColor(s)} height={32} />
                  <span className="stack" style={{ alignItems: 'flex-end', gap: 'var(--space-2)' }}>
                    <span className="t-amount-s nowrap">{price(q?.usd)}</span>
                    <VarChip ratio={q?.change24h ?? null} />
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
        <p className="t-legal c-moderate">Cours et variations sur 24 h : CoinGecko. Données indicatives, pas un conseil en investissement.</p>
      </main>
    </div>
  );
}

export function CatalogScreen() {
  const { data } = useCalc();
  const ps = usePrices();
  const [q, setQ] = useState('');
  const results = useMemo(() => searchCoins(q), [q, ps.catalog]);
  return (
    <div className="screen" data-screen="catalogue">
      <AppHeader title="Marchés" />
      <PriceErrorBanner />
      <SubNav items={NAV} label="Sections Marchés">
        <label className="search">
          <Icon name="search" size={20} style={{ color: 'var(--text-moderate)' }} />
          <input type="search" placeholder="Bitcoin, SOL, chainlink…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher une crypto" />
        </label>
      </SubNav>
      <main className="content gap-12">
        {!ps.catalog.length && <p className="t-caption c-moderate">Catalogue réduit hors connexion : le top 250 s’affiche dès que les cours sont chargés.</p>}
        <ul className="tile-list divided">
          {results.map((c) => {
            const on = data.watch.includes(c.symbol);
            return (
              <li key={c.id} className="list-row" style={{ gridTemplateColumns: '32px 1fr auto 44px', padding: 'var(--space-8) var(--space-4) var(--space-8) var(--space-12)' }}>
                <CoinAvatar symbol={c.symbol} size={32} />
                <button type="button" className="row-link" style={{ minWidth: 0 }} onClick={() => navigate('/marches/crypto/' + c.symbol)}>
                  <span className="t-strong ellipsis">{c.name}</span>
                  <span className="t-caption c-moderate">{c.symbol}{c.rank ? ` · n° ${c.rank}` : ''}</span>
                </button>
                <span className="stack" style={{ alignItems: 'flex-end' }}>
                  <span className="t-amount-s nowrap">{c.usd !== undefined ? price(c.usd) : '—'}</span>
                  {c.ch24 !== undefined && c.ch24 !== null && <span className={'t-caption nowrap ' + (c.ch24 >= 0 ? 'c-success' : 'c-critical')}>{c.ch24 >= 0 ? '▲' : '▼'} {pctSigned(c.ch24)}</span>}
                </span>
                <button type="button" className="icon-btn" aria-pressed={on} aria-label={on ? `Ne plus suivre ${c.symbol}` : `Suivre ${c.symbol}`} onClick={() => { toggleWatch(c.symbol, !on); if (!on) showToast(`${c.symbol} ajouté à Mes cryptos`); }}>
                  {on ? <CheckFilled /> : <Icon name="plusCircle" />}
                </button>
              </li>
            );
          })}
        </ul>
        {!results.length && <Empty icon="search" title="Aucun résultat" text="Essayez le symbole (ex. « ARB ») ou le nom anglais." />}
      </main>
    </div>
  );
}

type Period = '1H' | '3H' | '24H' | '7J' | '1M' | '3M' | '1A';
const PERIODS: Period[] = ['1H', '3H', '24H', '7J', '1M', '3M', '1A'];

export function CoinDetailScreen({ symbol }: { symbol: string }) {
  const { data, pos } = useCalc();
  const ps = usePrices();
  const [period, setPeriod] = useState<Period>('3M');
  const [log, setLog] = useState(false);
  const iv = useIntradayVersion();
  const fine = period === '1H' || period === '3H' || period === '24H' ? 1 : period === '7J' ? 7 : 0;
  useEffect(() => { void loadHistories(symbol); }, [symbol]);
  useEffect(() => {
    if (!fine) return;
    void loadIntraday(symbol, fine as 1 | 7);
    // courtes périodes : mise à jour chaque minute tant que l'écran est affiché
    const t = setInterval(() => { if (document.visibilityState === 'visible') void loadIntraday(symbol, fine as 1 | 7); }, fine === 1 ? 60e3 : 600e3);
    return () => clearInterval(t);
  }, [symbol, fine]);
  const p = pos(symbol);
  const q = quoteOf(symbol);
  const fq = fullQuote(symbol);
  const hist = useMemo((): [string, number][] => {
    if (fine) {
      const pts = intradayOf(symbol, fine as 1 | 7) || [];
      // le dernier point suit le cours en direct
      return q && pts.length ? [...pts, [new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), q.usd]] : pts;
    }
    const h = historyOf(symbol) || [];
    if (q && h.length) return [...h.slice(0, -1), [h[h.length - 1][0], q.usd] as [string, number]];
    return h;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, ps.histVersion, q?.usd, fine, iv]);
  const start = useMemo(() => {
    if (fine) {
      const hours = { '1H': 1, '3H': 3, '24H': 24, '7J': 24 * 7 }[period as '1H'] ?? 24;
      const from = new Date(Date.now() - hours * 3600e3).toISOString();
      const i = hist.findIndex((x) => x[0] >= from);
      return i < 0 ? 0 : i;
    }
    return Math.max(0, hist.length - { '1M': 31, '3M': 92, '1A': 366 }[period as '1M']);
  }, [hist, period, fine]);
  const periodVar = hist.length > 1 && start < hist.length - 1 ? hist[hist.length - 1][1] / hist[start][1] - 1 : null;
  const txs = data.txs.filter((t) => t.inLeg?.asset === symbol || t.outLeg?.asset === symbol).sort((a, b) => (a.date < b.date ? 1 : -1));
  const markers: Marker[] = txs.filter((t) => t.kind === 'trade').map((t) => {
    const buy = t.inLeg?.asset === symbol;
    const leg = buy ? t.inLeg! : t.outLeg!;
    const v = t.usd ?? (t.outLeg && (t.outLeg.asset === 'USD' || /^USD[CT]$/.test(t.outLeg.asset)) ? t.outLeg.qty : t.inLeg && (t.inLeg.asset === 'USD' || /^USD[CT]$/.test(t.inLeg.asset)) ? t.inLeg.qty : undefined);
    return { date: t.date, side: buy ? 'buy' : 'sell', qty: leg.qty, price: v !== undefined ? v / leg.qty : undefined };
  });
  const loading = !hist.length && (fine ? intradayLoading(symbol, fine as 1 | 7) : ps.histLoading > 0 || ps.loading);
  const id = coinIdOf(symbol);
  const watching = data.watch.includes(symbol);
  return (
    <div className="screen" data-screen="crypto">
      <SubHeader title={coinName(symbol)} fallback="/marches" right={
        <button type="button" className="icon-btn" aria-pressed={watching} aria-label={watching ? 'Ne plus suivre' : 'Suivre'} onClick={() => toggleWatch(symbol, !watching)}>
          {watching ? <CheckFilled /> : <Icon name="plusCircle" />}
        </button>} />
      <PriceErrorBanner />
      <main className="content dgrid">
        <section className="card g8 dspan-12" aria-label="Cours">
          <div className="row" style={{ gap: 'var(--space-12)' }}>
            <CoinAvatar symbol={symbol} size={44} />
            <span className="stack grow">
              <span className="t-h2">{price(q?.usd)}</span>
              <span className="row wrap t-caption c-neutral" style={{ gap: 'var(--space-8)' }}>
                {period !== '24H' && periodVar !== null ? <VarChip ratio={periodVar} suffix={' ' + period.toLowerCase()} /> : null}
                <VarChip ratio={q?.change24h ?? null} suffix=" 24 h" />
                {fq?.ch7d !== undefined && fq.ch7d !== null && <VarChip ratio={fq.ch7d} suffix=" 7 j" />}
                {fq?.rank ? <span>n° {fq.rank} par capitalisation</span> : null}
              </span>
            </span>
          </div>
          <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
            <ChipGroup className="chips g6" label="Période" value={period} onChange={setPeriod} options={PERIODS.map((x) => [x, x] as [Period, string])} />
            <label className="row t-caption c-neutral" style={{ gap: 'var(--space-8)' }}><span id="log-l">Échelle log</span><Switch checked={log} onChange={setLog} labelledBy="log-l" /></label>
          </div>
          {loading ? <div className="skel" style={{ height: 216, borderRadius: 'var(--radius-8)' }} aria-label="Chargement de l’historique" />
            : <PriceChart history={hist} start={start} markers={markers} pru={p && p.qty > 0 ? p.pru : undefined} color={coinColor(symbol)} log={log}
              label={`Cours de ${symbol} sur ${period}${periodVar !== null ? ' : ' + pctSigned(periodVar) : ''}`} emptyText={id ? 'Historique indisponible pour le moment (limite d’appels CoinGecko ?) : réessayez dans une minute.' : 'Crypto inconnue de CoinGecko : associez-la dans Paramètres.'} />}
          <div className="legend">
            <span><span className="dot s10" style={{ background: 'var(--bg-surface)', border: '2px solid var(--success)' }} />Achats</span>
            <span><span className="dot s10" style={{ background: 'var(--bg-surface)', border: '2px solid var(--critical)' }} />Ventes</span>
            {p && p.qty > 0 && <span><span style={{ width: 16, borderTop: '2px dashed var(--chart-pru)' }} />Prix de revient</span>}
          </div>
        </section>

        {p && (p.qty > 0 || p.realized) ? (
          <section className="card dspan-6" aria-labelledby="cd-pos">
            <h2 id="cd-pos">Ma position</h2>
            <dl className="dl">
              <dt>Quantité</dt><dd>{qty(p.qty)} {symbol}</dd>
              <dt>Valeur</dt><dd>{usd(p.value)}</dd>
              <dt>Poids dans le portefeuille</dt><dd>{pct(p.weight)}</dd>
              <dt>PRU</dt><dd>{price(p.pru)}</dd>
              <dt>Coût de revient</dt><dd>{usd(p.cost)}</dd>
              <dt>Plus-value latente</dt><dd className={p.unrealized >= 0 ? 'c-success' : 'c-critical'}>{usdSigned(p.unrealized)} · {pctSigned(p.unrealizedPct)}</dd>
              {Math.abs(p.realized) >= 0.005 && <><dt>Plus-value réalisée</dt><dd className={p.realized >= 0 ? 'c-success' : 'c-critical'}>{usdSigned(p.realized)}</dd></>}
              {p.income > 0 && <><dt>Revenus</dt><dd className="c-success">{usdSigned(p.income)}</dd></>}
              {p.fees > 0 && <><dt>Frais</dt><dd>{usd(p.fees)}</dd></>}
              {q && p.qty > 0 && p.pru > 0 && <><dt>Cours pour revenir au PRU</dt><dd>{pctSigned(p.pru / q.usd - 1)}</dd></>}
            </dl>
          </section>
        ) : null}

        {txs.length > 0 && (
          <section className="card dspan-6" aria-labelledby="cd-ops">
            <h2 id="cd-ops">Mes opérations ({txs.length})</h2>
            <ul className="divided t-caption">
              {txs.slice(0, 8).map((t) => (
                <li key={t.id} className="between" style={{ padding: 'var(--space-8) 0' }}>
                  <span className="stack" style={{ minWidth: 0 }}><span className="t-caption-strong ellipsis">{txTitle(t)}</span><span className="c-moderate">{t.platform} · {dateFr(t.date)}</span></span>
                  <span className="nowrap">{t.usd !== undefined ? usdShort(t.usd) : txCategory(t) === 'transfer' ? '' : ''}</span>
                </li>
              ))}
            </ul>
            {txs.length > 8 && <p className="t-caption c-moderate">Toutes les opérations : Historique › Journal, filtre « {symbol} ».</p>}
          </section>
        )}
        <p className="t-legal c-moderate dspan-12">{id ? <>Identifiant CoinGecko : {id}. </> : null}{isFiat(symbol) ? '' : 'Cours quotidiens sur 365 jours (API publique CoinGecko).'} Aucun ordre n’est passé depuis CryptoAnalyze.</p>
      </main>
    </div>
  );
}
