// Onglet Portefeuille : Synthèse (écran de lancement), Répartition, Performance.
import { useState } from 'react';
import { AppHeader, Fab, Hero, PriceErrorBanner, Segmented, SubNav, VarChip, useWidth } from '../ui/kit';
import { Donut, HBarList } from '../ui/charts';
import { Icon } from '../ui/icons';
import { navigate, openSheet } from '../ui/router';
import { useCalc } from '../ui/useCalc';
import { CoinAvatar, CoinDot, coinColor } from '../ui/coins';
import { WelcomeCard } from '../ui/Welcome';
import { coinName, quoteOf } from '../data/prices';
import { pct, pctSigned, plural, price, qty, usd, usdShort, usdSigned } from '../domain/format';
import type { Position } from '../domain/types';

export const PF_NAV = [{ to: '/portefeuille', label: 'Synthèse' }, { to: '/portefeuille/repartition', label: 'Répartition' }, { to: '/portefeuille/performance', label: 'Performance' }];

function topSlices(items: { key: string; value: number; color: string }[], n = 7) {
  const sorted = items.filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, n);
  const rest = sorted.slice(n).reduce((s, x) => s + x.value, 0);
  return rest > 0 ? [...head, { key: 'Autres', value: rest, color: 'var(--chart-other)' }] : head;
}

export function PortfolioScreen() {
  const { data, held, visible, summary } = useCalc();
  const [open, setOpen] = useState<string | null>(null);
  const [showSmall, setShowSmall] = useState(false);
  const [donutRef, donutW] = useWidth<HTMLDivElement>(326);
  const hiddenCount = held.length - visible.length;
  const list = showSmall ? held : visible;
  const slices = topSlices(visible.map((p) => ({ key: p.asset, value: p.value, color: coinColor(p.asset) })));
  const total = summary.value;
  const empty = !data.txs.length;
  const gainOk = isFinite(summary.gainPct);

  return (
    <div className="screen" data-screen="portefeuille">
      <AppHeader title="Portefeuille" />
      <PriceErrorBanner />
      <SubNav items={PF_NAV} label="Sections du portefeuille" />
      <main className="content with-fab dgrid">
        {empty ? <WelcomeCard className="dspan-12" /> : (
          <>
            <Hero className="dspan-5" label="Valorisation totale" value={usd(total)}
              chip={`${summary.gain >= 0 ? '▲' : '▼'} ${usdSigned(summary.gain)}${gainOk ? ' · ' + pctSigned(summary.gainPct) : ''}`} chipDown={summary.gain < 0}>
              <div className="foot">
                <span><strong>{summary.assets}</strong> {summary.assets > 1 ? 'cryptos' : 'crypto'}</span>
                <span><strong>{usd(summary.capital, 0)}</strong> investis</span>
                <span>24 h <strong>{summary.change24h >= 0 ? '▲' : '▼'} {pctSigned(summary.change24hPct)}</strong></span>
              </div>
            </Hero>

            {(summary.missingPrices.length > 0 || summary.warnings.length > 0) && (
              <button type="button" className="note dspan-7" style={{ border: 0, textAlign: 'left', cursor: 'pointer', alignItems: 'flex-start' }} onClick={() => navigate('/portefeuille/performance')}>
                <Icon name="alert" size={20} />
                <span>
                  {summary.missingPrices.length > 0 && <>Cours inconnu pour {summary.missingPrices.join(', ')} (non compté dans la valeur). </>}
                  {summary.warnings.length > 0 && <>{plural(summary.warnings.length, '{n} point', '{n} points')} à vérifier dans l’historique importé. </>}
                  <strong style={{ textDecoration: 'underline' }}>Voir le détail</strong>
                </span>
              </button>
            )}

            <section aria-labelledby="pf-rep" className="card g16 dspan-7" style={{ gridRow: 'span 2' }}>
              <h2 id="pf-rep">Répartition</h2>
              <div ref={donutRef} className="row" style={{ gap: 'var(--space-16)', alignItems: 'center' }}>
                <Donut size={donutW < 330 ? 128 : 150} ring={20} slices={slices.map((s) => ({ value: s.value, color: s.color }))}
                  label={'Répartition : ' + slices.map((s) => `${s.key} ${pct(total ? s.value / total : 0)}`).join(', ')}>
                  <span className="t-caption c-moderate">Total</span>
                  <span className="t-amount-s">{usdShort(total)}</span>
                </Donut>
                <ul className="grow stack t-caption" style={{ gap: 'var(--space-6)' }}>
                  {slices.map((s) => (
                    <li key={s.key} className="list-row" style={{ gridTemplateColumns: '10px 1fr auto', gap: 'var(--space-6)' }}>
                      <span className="dot s10" style={{ background: s.color }} />
                      <span className="ellipsis">{s.key}</span>
                      <span className="right" style={{ fontWeight: 600 }}>{pct(total ? s.value / total : 0)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section aria-labelledby="pf-pos" className="stack-12 dspan-12">
              <div className="between baseline">
                <h2 id="pf-pos" className="t-h3">Mes positions</h2>
                <span className="t-caption c-moderate">triées par valeur</span>
              </div>
              <div className="stack-12 dcols-2">
                {list.map((p) => <PositionCard key={p.asset} p={p} open={open === p.asset} onToggle={() => setOpen(open === p.asset ? null : p.asset)} />)}
              </div>
              {hiddenCount > 0 && (
                <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'center' }} onClick={() => setShowSmall(!showSmall)}>
                  {showSmall ? 'Masquer les petits soldes' : `Afficher les petits soldes (${hiddenCount}, moins de ${usd(data.settings.smallThreshold, 0)})`}
                </button>
              )}
              {!list.length && <p className="c-neutral t-caption">Aucune crypto détenue actuellement.</p>}
            </section>
            <button type="button" className="btn btn-secondary dspan-12 dstart" style={{ alignSelf: 'center' }} onClick={() => navigate('/historique/import')}>
              <Icon name="upload" size={18} />Importer un export de plateforme
            </button>
          </>
        )}
      </main>
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}

function PositionCard({ p, open, onToggle }: { p: Position; open: boolean; onToggle: () => void }) {
  const down = p.unrealized < 0;
  const plats = Object.entries(p.platforms).sort((a, b) => b[1] - a[1]);
  return (
    <article className="card" data-component="PositionCard">
      <button type="button" aria-expanded={open} onClick={onToggle}
        style={{ display: 'grid', gridTemplateColumns: '40px 1fr auto 20px', gap: 'var(--space-10)', alignItems: 'center', padding: 0, border: 0, background: 'transparent', color: 'var(--text)', textAlign: 'left', cursor: 'pointer', minHeight: 'var(--touch-min)' }}>
        <CoinAvatar symbol={p.asset} />
        <span className="stack" style={{ minWidth: 0 }}>
          <span className="t-amount-m" style={{ overflowWrap: 'anywhere' }}>{coinName(p.asset)}</span>
          <span className="t-caption c-moderate" style={{ overflowWrap: 'anywhere' }}>{qty(p.qty)} {p.asset}</span>
        </span>
        <span className="stack" style={{ alignItems: 'flex-end', gap: 'var(--space-2)' }}>
          <span className="t-amount-m nowrap">{p.price === null ? '—' : usd(p.value)}</span>
          {p.price !== null && p.cost > 0
            ? <span className={'var-chip' + (down ? ' down' : '')} style={{ padding: '0 var(--space-8)' }}>{down ? '▼' : '▲'} {usdSigned(p.unrealized, Math.abs(p.unrealized) >= 1000 ? 0 : 2)} · {pctSigned(p.unrealizedPct)}</span>
            : <span className="badge">{p.price === null ? 'cours inconnu' : 'coût nul'}</span>}
        </span>
        <Icon name="down" size={20} style={{ color: 'var(--primary-fg)', transition: 'transform .2s', transform: `rotate(${open ? 180 : 0}deg)` }} />
      </button>
      <div className="alloc-bar" aria-hidden="true"><div className="fill" style={{ width: Math.min(100, p.weight * 100) + '%', background: coinColor(p.asset) }} /></div>
      <div className="between t-caption c-neutral">
        <span>Poids {pct(p.weight)}</span>
        <span className="row" style={{ gap: 'var(--space-6)' }}>{price(p.price)} <VarChip ratio={p.change24h} suffix=" 24 h" /></span>
      </div>
      {open && (
        <>
          <dl className="dl" style={{ paddingTop: 'var(--space-12)', borderTop: '1px solid var(--divider-minimal)' }}>
            <dt>Prix de revient unitaire (PRU)</dt><dd>{price(p.pru)}</dd>
            <dt>Coût de revient</dt><dd>{usd(p.cost)}</dd>
            <dt>Plus-value latente</dt><dd className={p.unrealized >= 0 ? 'c-success' : 'c-critical'}>{usdSigned(p.unrealized)}</dd>
            {Math.abs(p.realized) >= 0.005 && <><dt>Plus-value réalisée</dt><dd className={p.realized >= 0 ? 'c-success' : 'c-critical'}>{usdSigned(p.realized)}</dd></>}
            {p.income > 0 && <><dt>Revenus (staking, récompenses)</dt><dd className="c-success">{usdSigned(p.income)}</dd></>}
            {p.fees > 0 && <><dt>Frais payés</dt><dd>{usd(p.fees)}</dd></>}
            {plats.length > 0 && <><dt>Plateformes</dt><dd className="t-caption-strong">{plats.map(([k, v]) => `${k} ${qty(v)}`).join(' · ')}</dd></>}
          </dl>
          {p.costEstimated && <p className="t-caption c-neutral row" style={{ alignItems: 'flex-start' }}><Icon name="info" size={16} />Une partie du coût est estimée (réception sans prix ou échange sans valeur en dollars dans l’export).</p>}
          <a href={'#/marches/crypto/' + p.asset} onClick={(e) => { e.preventDefault(); navigate('/marches/crypto/' + p.asset); }}
            className="t-button" style={{ alignSelf: 'flex-start', textDecoration: 'none', padding: 'var(--space-8) 0' }}>Voir la fiche et l’historique</a>
        </>
      )}
    </article>
  );
}

// ------------------------------------------------------------------ Répartition
const CATS: [string, (a: string, stable: boolean) => boolean, string][] = [
  ['Bitcoin', (a) => a === 'BTC' || a === 'WBTC' || a === 'CBBTC', 'var(--coin-BTC)'],
  ['Ethereum', (a) => ['ETH', 'STETH', 'WETH', 'CBETH', 'RETH', 'WBETH', 'BETH'].includes(a), 'var(--coin-ETH)'],
  ['Stablecoins', (_a, s) => s, 'var(--coin-USDC)'],
  ['Autres cryptos', () => true, 'var(--chart-7)'],
];

export function RepartitionScreen() {
  const { held, summary } = useCalc();
  const [tab, setTab] = useState<'coins' | 'plat' | 'cat'>('coins');
  const total = summary.value || 1;
  const byPlat = new Map<string, number>();
  for (const p of held) {
    const q = quoteOf(p.asset);
    if (!q) continue;
    for (const [k, v] of Object.entries(p.platforms)) byPlat.set(k, (byPlat.get(k) || 0) + v * q.usd);
  }
  const platRows = [...byPlat].sort((a, b) => b[1] - a[1]);
  const platColors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)'];
  const cats = CATS.map(([label, , color]) => ({ label, color, value: 0 }));
  for (const p of held) { const i = CATS.findIndex(([, f]) => f(p.asset, p.stable)); cats[i].value += p.value; }

  return (
    <div className="screen" data-screen="repartition">
      <AppHeader title="Portefeuille" />
      <PriceErrorBanner />
      <SubNav items={PF_NAV} label="Sections du portefeuille" />
      <main className="content with-fab">
        <div className="form-narrow"><Segmented label="Type de répartition" value={tab} onChange={setTab} options={[['coins', 'Cryptos'], ['plat', 'Plateformes'], ['cat', 'Catégories']]} /></div>
        {tab === 'coins' && (
          <section className="card form-narrow" aria-labelledby="rep-c">
            <h2 id="rep-c">Poids de chaque crypto</h2>
            <HBarList rows={held.filter((p) => p.value > 0).map((p) => ({ label: p.asset, sub: coinName(p.asset), value: `${pct(p.value / total)} · ${usdShort(p.value)}`, ratio: p.value / total, color: coinColor(p.asset) }))} />
          </section>
        )}
        {tab === 'plat' && (
          <section className="card g16 form-narrow" aria-labelledby="rep-p">
            <h2 id="rep-p">Où sont mes cryptos ?</h2>
            <Donut slices={platRows.map(([, v], i) => ({ value: v, color: platColors[i % 8] }))} label={'Plateformes : ' + platRows.map(([k, v]) => `${k} ${pct(v / total)}`).join(', ')}>
              <span className="t-amount-l">{platRows.length}</span><span className="t-caption c-moderate">{platRows.length > 1 ? 'plateformes' : 'plateforme'}</span>
            </Donut>
            <ul>
              {platRows.map(([k, v], i) => (
                <li key={k} className="legend-row"><span className="dot s10" style={{ background: platColors[i % 8] }} /><span>{k}</span><span className="t-strong right">{pct(v / total)} · {usdShort(v)}</span></li>
              ))}
            </ul>
            <p className="t-legal c-moderate">Ne laissez sur une plateforme que ce dont vous avez besoin pour trader : le reste est plus sûr sur un portefeuille personnel (clé matérielle). Ajoutez ce portefeuille dans CryptoAnalyze en saisissant un transfert.</p>
          </section>
        )}
        {tab === 'cat' && (
          <section className="card g16 form-narrow" aria-labelledby="rep-k">
            <h2 id="rep-k">Profil de risque</h2>
            <div className="stack-bar" aria-hidden="true">{cats.filter((c) => c.value > 0).map((c) => <span key={c.label} style={{ flex: c.value, background: c.color }} />)}</div>
            <ul>
              {cats.map((c) => (
                <li key={c.label} className="legend-row"><span className="dot s10" style={{ background: c.color }} /><span>{c.label}</span><span className="t-strong right">{pct(c.value / total)} · {usdShort(c.value)}</span></li>
              ))}
            </ul>
            <p className="t-legal c-moderate">Repère : Bitcoin et Ethereum représentent la majorité de la capitalisation du marché ; les « autres cryptos » sont nettement plus volatiles et plus risquées.</p>
          </section>
        )}
      </main>
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}

// ------------------------------------------------------------------ Performance
export function PerformanceScreen() {
  const { positions, held, summary } = useCalc();
  const total = summary.unrealized + summary.realized + summary.income;
  const rows = positions.map((p) => ({ p, pnl: p.unrealized + p.realized + p.income })).filter((x) => Math.abs(x.pnl) >= 0.01).sort((a, b) => b.pnl - a.pnl);
  const movers = held.filter((p) => p.change24h !== null && !p.stable && p.value > 1).sort((a, b) => (b.change24h ?? 0) - (a.change24h ?? 0));
  return (
    <div className="screen" data-screen="performance">
      <AppHeader title="Portefeuille" />
      <PriceErrorBanner />
      <SubNav items={PF_NAV} label="Sections du portefeuille" />
      <main className="content with-fab dgrid">
        <section className="card dspan-6" aria-labelledby="perf-pv">
          <h2 id="perf-pv">Plus et moins-values</h2>
          <dl className="dl">
            <dt>Latente (positions détenues)</dt><dd className={summary.unrealized >= 0 ? 'c-success' : 'c-critical'}>{usdSigned(summary.unrealized)}</dd>
            <dt>Réalisée (ventes et échanges)</dt><dd className={summary.realized >= 0 ? 'c-success' : 'c-critical'}>{usdSigned(summary.realized)}</dd>
            <dt>Revenus (staking, récompenses)</dt><dd className="c-success">{usdSigned(summary.income)}</dd>
            <dt className="t-strong total" style={{ color: 'var(--text)' }}>Total</dt><dd className={'t-amount-m total ' + (total >= 0 ? 'c-success' : 'c-critical')}>{usdSigned(total)}</dd>
          </dl>
          <p className="t-caption c-neutral">Frais payés depuis le début : <strong style={{ color: 'var(--text)' }}>{usd(summary.fees)}</strong> (déjà inclus dans les prix de revient et les produits de vente).</p>
        </section>

        {movers.length > 0 && (
          <section className="card dspan-6" aria-labelledby="perf-24">
            <h2 id="perf-24">Sur 24 heures</h2>
            <ul className="divided">
              {movers.map((p) => (
                <li key={p.asset} className="list-row" style={{ gridTemplateColumns: '12px 1fr auto auto', padding: 'var(--space-8) 0' }}>
                  <CoinDot symbol={p.asset} />
                  <span className="t-strong">{p.asset}</span>
                  <span className="t-caption c-neutral">{usdSigned(p.value - p.value / (1 + (p.change24h ?? 0)))}</span>
                  <VarChip ratio={p.change24h} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card dspan-12" aria-labelledby="perf-by">
          <h2 id="perf-by">Gain total par crypto</h2>
          <p className="t-caption c-neutral">Latente + réalisée + revenus, en dollars.</p>
          {rows.length ? (
            <HBarList rows={rows.map(({ p, pnl }) => ({ label: p.asset, sub: p.qty > 0 ? undefined : 'soldée', value: usdSigned(pnl), ratio: pnl, color: pnl >= 0 ? 'var(--success)' : 'var(--critical)' }))} />
          ) : <p className="c-neutral">Pas encore de plus ou moins-value.</p>}
        </section>

        {(summary.warnings.length > 0 || summary.missingPrices.length > 0 || summary.unmatchedIn > 0 || summary.unmatchedOut > 0) && (
          <section className="card dspan-12" aria-labelledby="perf-check">
            <h2 id="perf-check">Points à vérifier</h2>
            <ul className="stack-12 t-caption c-neutral">
              {summary.missingPrices.length > 0 && <li><strong style={{ color: 'var(--text)' }}>Cours inconnu :</strong> {summary.missingPrices.join(', ')}. Associez le bon identifiant CoinGecko dans Paramètres › Correspondances des symboles.</li>}
              {summary.unmatchedIn > 0 && <li><strong style={{ color: 'var(--text)' }}>Réceptions sans envoi correspondant :</strong> {usd(summary.unmatchedIn)} de coût attribué (valeur au jour de la réception quand l’export la donne, sinon 0). Importez l’historique de la plateforme d’origine pour rapprocher les transferts.</li>}
              {summary.unmatchedOut > 0 && <li><strong style={{ color: 'var(--text)' }}>Envois vers l’extérieur :</strong> {usd(summary.unmatchedOut)} de coût sorti du portefeuille (portefeuille personnel non suivi, paiement…). Saisissez la réception sur un portefeuille « Ledger » ou autre pour continuer à le suivre.</li>}
              {summary.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </section>
        )}
      </main>
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}
