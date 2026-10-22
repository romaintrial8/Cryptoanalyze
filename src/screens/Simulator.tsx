// Onglet Simulateur : achat programmé (DCA) rejoué sur les vrais cours, et projection à rendement constant.
import { useEffect, useMemo } from 'react';
import { AppHeader, SubNav } from '../ui/kit';
import { StackedAreaChart, ValueChart } from '../ui/charts';
import { Icon } from '../ui/icons';
import { useCalc } from '../ui/useCalc';
import { coinName, historyOf, loadHistories, usePrices } from '../data/prices';
import { update } from '../data/store';
import { dcaBacktest, projection } from '../domain/sim';
import { num, parseNum, pct, pctSigned, price, qty, todayIso, usd, usdSigned } from '../domain/format';

const NAV = [{ to: '/simulateur', label: 'Achat programmé' }, { to: '/simulateur/projection', label: 'Projection' }];
const setS = (patch: Partial<ReturnType<typeof useCalc>['data']['settings']>) => update((d) => { d.settings = { ...d.settings, ...patch }; });

export function DcaScreen() {
  const { data, held } = useCalc();
  const ps = usePrices();
  const s = data.settings;
  const options = [...new Set(['BTC', 'ETH', 'SOL', ...held.filter((p) => !p.stable).map((p) => p.asset), ...data.watch])];
  useEffect(() => { void loadHistories(s.dcaCoin); }, [s.dcaCoin]);
  const res = useMemo(() => dcaBacktest(historyOf(s.dcaCoin) || [], s.dcaAmount, s.dcaMonths, todayIso()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.dcaCoin, s.dcaAmount, s.dcaMonths, ps.histVersion]);
  return (
    <div className="screen" data-screen="simulateur">
      <AppHeader title="Simulateur" />
      <SubNav items={NAV} label="Sections Simulateur" />
      <main className="content dgrid">
        <section className="card g16 dspan-5" aria-labelledby="dca-p">
          <h2 id="dca-p">Et si j’avais acheté chaque mois ?</h2>
          <label className="field"><span className="lbl">Crypto</span>
            <select className="input" value={s.dcaCoin} onChange={(e) => setS({ dcaCoin: e.target.value })}>
              {options.map((o) => <option key={o} value={o}>{coinName(o)} ({o})</option>)}
            </select>
          </label>
          <label className="field"><span className="lbl">Montant par mois ($)</span>
            <input className="input num" inputMode="decimal" defaultValue={String(s.dcaAmount)} onBlur={(e) => { const v = parseNum(e.target.value); if (v > 0) setS({ dcaAmount: v }); }} />
          </label>
          <label className="field"><span className="lbl">Durée : {s.dcaMonths} mois</span>
            <input className="range" type="range" min={2} max={12} value={s.dcaMonths} onChange={(e) => setS({ dcaMonths: +e.target.value })} />
            <span className="hint">12 mois au plus : l’API gratuite de CoinGecko fournit 365 jours d’historique.</span>
          </label>
        </section>
        <section className="card dspan-7" aria-labelledby="dca-r">
          <h2 id="dca-r">Résultat</h2>
          {!res ? (
            <p className="c-neutral">{ps.histLoading ? 'Chargement de l’historique…' : 'Historique indisponible pour cette crypto pour le moment.'}</p>
          ) : (
            <>
              <div className="grid-2">
                <div className="calc-box"><span className="t-caption c-neutral">Investi ({res.buys} achats)</span><span className="t-amount-l">{usd(res.invested, 0)}</span></div>
                <div className="calc-box"><span className="t-caption c-neutral">Valeur aujourd’hui</span><span className="t-amount-l" style={{ color: res.value >= res.invested ? 'var(--success-text)' : 'var(--critical-text)' }}>{usd(res.value, 0)}</span></div>
              </div>
              <ValueChart points={res.points} labelCapital="Investi" labelValue="Valeur" />
              <dl className="dl">
                <dt>Gain ou perte</dt><dd className={res.value >= res.invested ? 'c-success' : 'c-critical'}>{usdSigned(res.value - res.invested, 0)} · {pctSigned(res.value / res.invested - 1)}</dd>
                <dt>Quantité accumulée</dt><dd>{qty(res.units)} {s.dcaCoin}</dd>
                <dt>Prix moyen d’achat</dt><dd>{price(res.avgPrice)}</dd>
                <dt>Tout investir au premier achat</dt><dd>{usd(res.lumpValue, 0)}</dd>
              </dl>
              <p className="t-caption c-neutral">{res.value >= res.lumpValue ? 'Ici, étaler les achats a fait mieux que tout investir d’un coup : le cours a baissé ou fluctué après le premier achat.' : 'Ici, tout investir d’un coup aurait fait mieux : le cours a surtout monté. Le DCA réduit surtout le risque de mal tomber, il ne garantit pas un meilleur résultat.'}</p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export function ProjectionScreen() {
  const { data, summary } = useCalc();
  const s = data.settings;
  const start = Math.round(summary.value);
  const years = projection(start, s.projMonthly, s.projYears, s.projRate);
  const end = years[years.length - 1];
  return (
    <div className="screen" data-screen="projection">
      <AppHeader title="Simulateur" />
      <SubNav items={NAV} label="Sections Simulateur" />
      <main className="content dgrid">
        <section className="card g16 dspan-5" aria-labelledby="pj-p">
          <h2 id="pj-p">Paramètres</h2>
          <p className="t-caption c-neutral">Départ : valeur actuelle du portefeuille, {usd(start, 0)}.</p>
          <label className="field"><span className="lbl">Versement mensuel ($)</span>
            <input className="input num" inputMode="decimal" defaultValue={String(s.projMonthly)} onBlur={(e) => { const v = parseNum(e.target.value); if (v >= 0) setS({ projMonthly: v }); }} />
          </label>
          <label className="field"><span className="lbl">Horizon : {s.projYears} ans</span>
            <input className="range" type="range" min={1} max={30} value={s.projYears} onChange={(e) => setS({ projYears: +e.target.value })} />
          </label>
          <label className="field"><span className="lbl">Rendement annuel moyen : {pct(s.projRate, 0)}</span>
            <input className="range" type="range" min={-20} max={60} step={1} value={Math.round(s.projRate * 100)} onChange={(e) => setS({ projRate: +e.target.value / 100 })} />
          </label>
        </section>
        <section className="card dspan-7" aria-labelledby="pj-r">
          <h2 id="pj-r">Dans {s.projYears} ans</h2>
          <div className="grid-2">
            <div className="calc-box"><span className="t-caption c-neutral">Total versé</span><span className="t-amount-l">{usd(end.deposited, 0)}</span></div>
            <div className="calc-box"><span className="t-caption c-neutral">Capital estimé</span><span className="t-amount-l">{usd(end.value, 0)}</span></div>
          </div>
          <StackedAreaChart years={years} label={`Projection sur ${s.projYears} ans : ${usd(end.value, 0)} pour ${usd(end.deposited, 0)} versés`} />
          <div className="legend">
            <span><span style={{ width: 12, height: 12, borderRadius: 'var(--radius-2)', background: 'var(--chart-deposited)' }} />Versements</span>
            <span><span style={{ width: 12, height: 12, borderRadius: 'var(--radius-2)', background: 'var(--chart-value)' }} />Gains</span>
          </div>
          <p className="note"><Icon name="alert" size={20} /><span>Un rendement constant n’existe pas en crypto : le bitcoin a déjà perdu plus de 70 % plusieurs fois. Utilisez cette projection pour comparer des scénarios (×{num(1 + s.projRate, 2)} par an en moyenne), jamais comme une promesse.</span></p>
        </section>
      </main>
    </div>
  );
}
