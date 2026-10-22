// Onglet Historique : Vue d'ensemble, Journal des opérations, détail d'une opération, choix du type à saisir.
import { useMemo, useState } from 'react';
import { AppHeader, ChipGroup, Empty, Fab, Hero, KpiGrid, PriceErrorBanner, Sheet, SubNav, showToast, tone } from '../ui/kit';
import { ValueChart } from '../ui/charts';
import { Icon } from '../ui/icons';
import { closeSheet, navigate, openSheet, useRoute } from '../ui/router';
import { useCalc } from '../ui/useCalc';
import { CoinDot } from '../ui/coins';
import { WelcomeCard } from '../ui/Welcome';
import { historyOf, quoteOf, usePrices } from '../data/prices';
import { deleteTxs } from '../data/actions';
import { dailySeries, txCategory, type TxInfo } from '../domain/calc';
import { dateFr, dateTimeFr, monthLong, num, pctSigned, plural, price, qty, timeFr, todayIso, usd, usdSigned } from '../domain/format';
import { isFiat } from '../domain/assets';
import type { Tx } from '../domain/types';

const NAV = [{ to: '/historique', label: 'Vue d’ensemble' }, { to: '/historique/journal', label: 'Journal' }];

// ------------------------------------------------------------------ Vue d'ensemble
export function OverviewScreen() {
  const { data, summary } = useCalc();
  const ps = usePrices();
  const [period, setPeriod] = useState<'1M' | '3M' | '6M' | '1A' | 'Tout'>('Tout');
  const series = useMemo(() => dailySeries(data.txs, data.fx, (a) => historyOf(a, data), todayIso(), (a) => quoteOf(a, data)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, ps.histVersion, ps.quotes]);
  const days = { '1M': 31, '3M': 92, '6M': 183, '1A': 366, Tout: Infinity }[period];
  const shown = series.length > days ? series.slice(series.length - days) : series;
  const counts = useMemo(() => {
    const c = { buy: 0, sell: 0, swap: 0, income: 0, transfer: 0 } as Record<string, number>;
    for (const t of data.txs) { const k = txCategory(t); if (k in c) c[k]++; }
    return c;
  }, [data.txs]);

  if (!data.txs.length) {
    return (
      <div className="screen">
        <AppHeader title="Historique" />
        <SubNav items={NAV} label="Sections Historique" />
        <main className="content"><WelcomeCard /></main>
      </div>
    );
  }
  const ageDays = summary.firstDate ? (Date.now() - Date.parse(summary.firstDate)) / 864e5 : 0;
  const kpis = [
    { id: 'cap', label: 'Capital investi', value: usd(summary.capital), help: 'Argent dépensé en achats (frais compris) − argent récupéré par les ventes, + valeur des cryptos reçues de l’extérieur − coût de celles envoyées hors du portefeuille.' },
    { id: 'cost', label: 'Coût de revient', value: usd(summary.costBasis), help: 'Somme des prix de revient (PRU × quantité) des cryptos que vous détenez encore.' },
    { id: 'unr', label: 'Plus-value latente', value: usdSigned(summary.unrealized), tone: tone(summary.unrealized), help: 'Valeur actuelle − coût de revient des positions détenues. Elle n’est acquise qu’à la vente.' },
    { id: 'real', label: 'Plus-value réalisée', value: usdSigned(summary.realized), tone: tone(summary.realized), help: 'Gains ou pertes constatés lors des ventes et des échanges crypto contre crypto (méthode du prix de revient moyen).' },
    { id: 'inc', label: 'Revenus', value: usdSigned(summary.income), tone: tone(summary.income), help: 'Staking, récompenses, airdrops et intérêts, valorisés au cours du jour de réception (0 si l’export ne donne pas le prix).' },
    { id: 'fees', label: 'Frais payés', value: usd(summary.fees), help: 'Frais de plateforme, écarts de prix déclarés et frais de réseau des transferts.' },
    { id: 'ret', label: 'Rendement global', value: pctSigned(summary.gainPct), tone: tone(summary.gainPct), help: '(Valeur actuelle − capital investi) ÷ capital investi.' },
    { id: 'irr', label: 'Rendement annualisé (TRI)', value: summary.xirr === null ? '—' : pctSigned(summary.xirr), tone: summary.xirr === null ? undefined : tone(summary.xirr), help: 'Taux de rendement interne qui tient compte de la date de chaque achat et vente.' + (ageDays < 365 ? ' Moins d’un an d’historique : ce taux annualisé amplifie les variations récentes, à lire avec prudence.' : '') },
  ] as const;

  return (
    <div className="screen" data-screen="historique">
      <AppHeader title="Historique" />
      <PriceErrorBanner />
      <SubNav items={NAV} label="Sections Historique" />
      <main className="content with-fab dgrid">
        <Hero className="dspan-5" label="Valorisation totale" value={usd(summary.value)} chip={`${summary.gain >= 0 ? '▲' : '▼'} ${usdSigned(summary.gain)}${isFinite(summary.gainPct) ? ' · ' + pctSigned(summary.gainPct) : ''}`} chipDown={summary.gain < 0}>
          <div className="foot">
            <span><strong>{num(summary.txCount, 0)}</strong> opérations</span>
            {summary.firstDate && <span>depuis le <strong>{dateFr(summary.firstDate)}</strong></span>}
          </div>
        </Hero>
        <div className="dspan-7"><KpiGrid items={kpis as never} /></div>

        <section aria-labelledby="h-chart" className="card dspan-7">
          <h2 id="h-chart">Capital investi et valeur</h2>
          <div className="legend">
            <span><span style={{ width: 16, height: 3, borderRadius: 'var(--radius-full)', background: 'var(--chart-value)' }} />Valeur</span>
            <span><span style={{ width: 16, borderTop: '2px dashed var(--chart-deposited-line)' }} />Capital investi</span>
            <span><span style={{ width: 12, height: 12, borderRadius: 'var(--radius-2)', background: 'var(--chart-gain-area)' }} />Gain</span>
            <span><span style={{ width: 12, height: 12, borderRadius: 'var(--radius-2)', background: 'var(--chart-loss-area)' }} />Perte</span>
          </div>
          <ChipGroup label="Période" value={period} onChange={setPeriod} options={[['1M', '1M'], ['3M', '3M'], ['6M', '6M'], ['1A', '1A'], ['Tout', 'Tout']]} />
          <ValueChart points={shown} />
          {ps.histLoading > 0 && <p className="t-caption c-moderate">Chargement des historiques de cours ({ps.histLoading} restant{ps.histLoading > 1 ? 's' : ''})…</p>}
          <p className="t-legal c-moderate">Cours de clôture quotidiens CoinGecko (365 derniers jours) ; avant, prix de vos propres opérations.</p>
        </section>

        <section aria-labelledby="h-act" className="card dspan-5">
          <h2 id="h-act">Activité</h2>
          <dl className="dl">
            <dt>Achats</dt><dd>{counts.buy}</dd>
            <dt>Ventes</dt><dd>{counts.sell}</dd>
            <dt>Échanges crypto ↔ crypto</dt><dd>{counts.swap}</dd>
            <dt>Revenus reçus</dt><dd>{counts.income}</dd>
            <dt>Transferts</dt><dd>{counts.transfer}</dd>
            <dt className="total">Dépensé en achats</dt><dd className="total">{usd(summary.fiatSpent)}</dd>
            <dt>Récupéré par les ventes</dt><dd>{usd(summary.fiatReceived)}</dd>
          </dl>
          <button type="button" className="btn btn-secondary block" onClick={() => navigate('/historique/import')}><Icon name="upload" size={18} />Importer de nouveaux fichiers</button>
        </section>

        <button type="button" className="btn btn-tertiary dspan-12" style={{ alignSelf: 'center', justifySelf: 'center' }} onClick={() => navigate('/historique/journal', { replace: true })}>
          Voir toutes les opérations<Icon name="next" size={20} />
        </button>
      </main>
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}

// ------------------------------------------------------------------ Journal
type Filter = 'all' | 'buy' | 'sell' | 'swap' | 'transfer' | 'income';
const CAT_ICON: Record<string, string> = { buy: 'cart', sell: 'receipt', swap: 'swap', income: 'gift', transfer: 'arrowOut', cash: 'deposit', fee: 'receipt' };

export function txTitle(t: Tx): string {
  const c = txCategory(t);
  const i = t.inLeg, o = t.outLeg;
  if (c === 'buy') return `Achat · ${qty(i!.qty)} ${i!.asset}`;
  if (c === 'sell') return `Vente · ${qty(o!.qty)} ${o!.asset}`;
  if (c === 'swap') return `${o!.asset} → ${i!.asset}`;
  if (c === 'income') return `${{ staking: 'Staking', reward: 'Récompense', airdrop: 'Airdrop', interest: 'Intérêts', other: 'Revenu' }[t.incomeType || 'other']} · ${qty(i!.qty)} ${i!.asset}`;
  if (t.kind === 'transfer_in') return `Réception · ${qty(i!.qty)} ${i!.asset}`;
  if (t.kind === 'transfer_out') return `Envoi · ${qty(o!.qty)} ${o!.asset}`;
  if (t.kind === 'cash_in') return `Dépôt · ${num(i!.qty, 2)} ${i!.asset}`;
  if (t.kind === 'cash_out') return `Retrait · ${num(o!.qty, 2)} ${o!.asset}`;
  return `Frais · ${qty(t.fee?.qty ?? 0)} ${t.fee?.asset ?? ''}`;
}

function mainAsset(t: Tx): string {
  const c = txCategory(t);
  if (c === 'sell') return t.outLeg!.asset;
  return (t.inLeg && !isFiat(t.inLeg.asset) ? t.inLeg.asset : t.outLeg?.asset) || t.fee?.asset || 'USD';
}

function amountOf(t: Tx, info?: TxInfo): { text: string; cls: string } {
  const c = txCategory(t);
  const v = info?.usd;
  const approx = info?.valueEstimated ? '≈ ' : '';
  if (c === 'buy') return { text: v === undefined ? '—' : usdSigned(-(v + (t.fee && isFiat(t.fee.asset) ? info?.feeUsd ?? 0 : 0))), cls: '' };
  if (c === 'sell') return { text: v === undefined ? '—' : usdSigned(v - (t.fee && isFiat(t.fee.asset) ? info?.feeUsd ?? 0 : 0)), cls: 'c-success' };
  if (c === 'income') return { text: v === undefined ? 'valeur inconnue' : approx + usdSigned(v), cls: v === undefined ? 'c-moderate' : 'c-success' };
  if (c === 'swap') return { text: v === undefined ? 'valeur inconnue' : approx + usd(v), cls: v === undefined ? 'c-moderate' : '' };
  if (c === 'cash') return { text: t.kind === 'cash_in' ? '+' + num(t.inLeg!.qty, 2) + ' ' + t.inLeg!.asset : '−' + num(t.outLeg!.qty, 2) + ' ' + t.outLeg!.asset, cls: 'c-neutral' };
  return { text: info?.paired ? 'interne' : '', cls: 'c-moderate' };
}

export function JournalScreen() {
  const { data, led } = useCalc();
  const [filter, setFilter] = useState<Filter>('all');
  const [plat, setPlat] = useState('');
  const [asset, setAsset] = useState('');
  const [months, setMonths] = useState(6);
  const platforms = [...new Set(data.txs.map((t) => t.platform))].sort();
  const assets = [...new Set(data.txs.flatMap((t) => [t.inLeg?.asset, t.outLeg?.asset]).filter((a) => a && !isFiat(a)) as string[])].sort();
  const ops = data.txs.filter((t) => {
    const c = txCategory(t);
    if (filter !== 'all' && c !== filter) return false;
    if (plat && t.platform !== plat) return false;
    if (asset && t.inLeg?.asset !== asset && t.outLeg?.asset !== asset && t.fee?.asset !== asset) return false;
    return true;
  }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const groups: { key: string; ops: Tx[] }[] = [];
  for (const o of ops) {
    const key = o.date.slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) groups.push((g = { key, ops: [] }));
    g.ops.push(o);
  }
  const shown = groups.slice(0, months);

  return (
    <div className="screen" data-screen="journal">
      <AppHeader title="Historique" />
      <SubNav items={NAV} label="Sections Historique">
        <ChipGroup className="chips g6" label="Type d'opération" value={filter} onChange={setFilter}
          options={[['all', 'Tout'], ['buy', 'Achats'], ['sell', 'Ventes'], ['swap', 'Échanges'], ['income', 'Revenus'], ['transfer', 'Transferts']]} />
        <div className="row wrap" style={{ gap: 'var(--space-6)' }}>
          <label className="chip chip-select">
            <select aria-label="Plateforme" value={plat} onChange={(e) => setPlat(e.target.value)}>
              <option value="">Toutes plateformes</option>
              {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <Icon name="down" size={16} />
          </label>
          <label className="chip chip-select">
            <select aria-label="Crypto" value={asset} onChange={(e) => setAsset(e.target.value)}>
              <option value="">Toutes cryptos</option>
              {assets.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <Icon name="down" size={16} />
          </label>
        </div>
      </SubNav>
      {!data.txs.length ? (
        <Empty icon="list" title="Aucune opération" text="Importez un export de Coinbase ou Binance, ou saisissez une opération avec le bouton +."
          action={<button type="button" className="btn btn-primary" onClick={() => navigate('/historique/import')}><Icon name="upload" size={20} />Importer</button>} />
      ) : !ops.length ? (
        <Empty icon="search" title="Aucune opération" text="Aucune opération ne correspond à ces filtres." />
      ) : (
        <main className="with-fab" style={{ paddingBottom: 'calc(var(--tabbar-height) + var(--safe-bottom) + 96px)' }}>
          {shown.map((g) => (
            <section key={g.key} aria-label={monthLong(g.key)}>
              <h2 className="month-header"><span>{monthLong(g.key)}</span><span className="t-caption c-moderate" style={{ textTransform: 'none', letterSpacing: 0 }}>{plural(g.ops.length, '{n} opération', '{n} opérations')}</span></h2>
              <ul className="op-list">
                {g.ops.map((t) => {
                  const info = led.info.get(t.id);
                  const amt = amountOf(t, info);
                  const c = txCategory(t);
                  const a = mainAsset(t);
                  return (
                    <li key={t.id} className="op-item">
                      <button type="button" className="op-row" onClick={() => openSheet('op:' + t.id)}>
                        <span className="op-icon" style={{ background: 'var(--bg-surface-minimal)', color: 'var(--primary-fg)', position: 'relative' }}>
                          <Icon name={t.kind === 'transfer_in' ? 'arrowIn' : CAT_ICON[c]} size={20} />
                          {!isFiat(a) && <CoinDot symbol={a} size={10} style={{ position: 'absolute', right: 1, bottom: 1, border: '2px solid var(--bg-surface)', boxSizing: 'content-box' }} />}
                        </span>
                        <span className="stack" style={{ minWidth: 0 }}>
                          <span className="t-strong ellipsis">{txTitle(t)}</span>
                          <span className="t-caption c-moderate ellipsis">{t.platform} · {dateFr(t.date)} {timeFr(t.date)}</span>
                        </span>
                        <span className="stack" style={{ alignItems: 'flex-end' }}>
                          <span className={'t-amount-s nowrap ' + amt.cls}>{amt.text}</span>
                          {info?.realized !== undefined && Math.abs(info.realized) >= 0.005 && <span className={'t-caption nowrap ' + (info.realized >= 0 ? 'c-success' : 'c-critical')}>PV {usdSigned(info.realized)}</span>}
                          {info?.estimated && <span className="t-caption c-moderate nowrap">coût reporté</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {groups.length > months && (
            <div className="center" style={{ padding: 'var(--space-16)' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setMonths(months + 12)}>Afficher les mois précédents</button>
            </div>
          )}
        </main>
      )}
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}

// ------------------------------------------------------------------ Détail d'une opération
export function TxSheet({ id }: { id: string }) {
  const { data, led } = useCalc();
  const t = data.txs.find((x) => x.id === id);
  if (!t) return null;
  const info = led.info.get(t.id);
  const c = txCategory(t);
  const unit = info?.usd !== undefined && t.inLeg && t.outLeg ? (c === 'sell' ? info.usd / t.outLeg.qty : !isFiat(t.inLeg.asset) ? info.usd / t.inLeg.qty : undefined) : undefined;
  const editable = ['trade', 'income', 'transfer_in', 'transfer_out'].includes(t.kind);
  const remove = () => {
    closeSheet();
    const undo = deleteTxs([t.id]);
    showToast('Opération supprimée', { undo });
  };
  return (
    <Sheet title={txTitle(t)} footer={
      <div className="grid-2 btns">
        <button type="button" className="btn btn-secondary" onClick={remove}><Icon name="trash" size={18} />Supprimer</button>
        {editable && <button type="button" className="btn btn-primary" onClick={() => { closeSheet(); setTimeout(() => navigate('/historique/saisie?id=' + t.id), 0); }}><Icon name="pencil" size={18} />Modifier</button>}
      </div>
    }>
      <dl className="kv" style={{ paddingBottom: 'var(--space-16)' }}>
        <dt>Date (heure locale)</dt><dd>{dateTimeFr(t.date)}</dd>
        <dt>Plateforme</dt><dd>{t.platform}</dd>
        {t.outLeg && <><dt>Donné</dt><dd>{qty(t.outLeg.qty)} {t.outLeg.asset}</dd></>}
        {t.inLeg && <><dt>Reçu</dt><dd>{qty(t.inLeg.qty)} {t.inLeg.asset}</dd></>}
        {t.fee && <><dt>Frais</dt><dd>{qty(t.fee.qty)} {t.fee.asset}{info?.feeUsd ? ` (${usd(info.feeUsd)})` : ''}</dd></>}
        {info?.usd !== undefined && <><dt>Valeur</dt><dd>{info.valueEstimated ? '≈ ' : ''}{usd(info.usd)}{info.valueEstimated ? ' (estimée)' : ''}</dd></>}
        {unit !== undefined && <><dt>Prix unitaire</dt><dd>{price(unit)}</dd></>}
        {info?.realized !== undefined && <><dt>Plus-value réalisée</dt><dd className={info.realized >= 0 ? 'c-success' : 'c-critical'}>{usdSigned(info.realized)}</dd></>}
        {info?.paired && <><dt>Transfert</dt><dd className="t-caption-strong">rapproché avec l’autre plateforme</dd></>}
        {info?.estimated && <><dt>Coût</dt><dd className="t-caption-strong">reporté ou estimé (pas de valeur en dollars dans l’export)</dd></>}
        {t.note && <><dt>Note</dt><dd className="t-caption">{t.note}</dd></>}
        <dt>Source</dt><dd className="t-caption">{{ coinbase: 'Import Coinbase', binance: 'Import Binance', kraken: 'Import Kraken', csv: 'Import CSV', manual: 'Saisie manuelle', demo: 'Données d’exemple' }[t.src || 'manual'] || t.src}</dd>
      </dl>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Ajouter
export function AddSheet() {
  const go = (type: string) => { closeSheet(); setTimeout(() => navigate('/historique/saisie?type=' + type), 0); };
  const items: [string, string, string, string][] = [
    ['buy', 'cart', 'Achat', 'avec des dollars, des euros ou un stablecoin'],
    ['sell', 'receipt', 'Vente', 'contre des dollars, des euros ou un stablecoin'],
    ['swap', 'swap', 'Échange', 'une crypto contre une autre'],
    ['income', 'gift', 'Revenu', 'staking, récompense, airdrop'],
    ['transfer', 'arrowOut', 'Transfert', 'entre deux plateformes ou vers un portefeuille'],
  ];
  return (
    <Sheet title="Ajouter une opération">
      <div className="stack-8" style={{ paddingBottom: 'var(--space-16)' }}>
        <button type="button" className="tile" style={{ background: 'var(--bg-brand-minimal)', minHeight: 0, flexDirection: 'row', alignItems: 'center' }} onClick={() => { closeSheet(); setTimeout(() => navigate('/historique/import'), 0); }}>
          <span className="tile-icon"><Icon name="upload" /></span>
          <span className="stack"><span className="t-amount-m">Importer un fichier</span><span className="t-caption c-neutral">Export Coinbase, Binance, Kraken ou CSV</span></span>
        </button>
        <ul className="divided">
          {items.map(([k, ic, l, d]) => (
            <li key={k}>
              <button type="button" className="row-link" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-12)', width: '100%', minHeight: 56 }} onClick={() => go(k)}>
                <span className="op-icon" style={{ background: 'var(--bg-surface-minimal)', color: 'var(--primary-fg)' }}><Icon name={ic} size={20} /></span>
                <span className="stack grow"><span className="t-strong">{l}</span><span className="t-caption c-neutral">{d}</span></span>
                <Icon name="next" size={20} style={{ color: 'var(--primary-fg)' }} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

export function useOpSheet(): string | null {
  const r = useRoute();
  const s = r.query.get('sheet') || '';
  return s.startsWith('op:') ? s.slice(3) : null;
}
