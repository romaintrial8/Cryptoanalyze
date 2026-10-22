// Paramètres, correspondances des symboles, écran de connexion.
import { useRef, useState } from 'react';
import { Segmented, Sheet, SubHeader, Switch, showToast } from '../ui/kit';
import { Icon, Logo } from '../ui/icons';
import { navigate } from '../ui/router';
import { CoinAvatar } from '../ui/coins';
import { useData, update, getPrefs, setPrefs } from '../data/store';
import { coinIdOf, neededSymbols, quoteOf, refreshPrices, searchCoins, usePrices } from '../data/prices';
import { clearDemo, deletePlatform, exportCsv, exportJson, hasDemo, importJson, resetAll } from '../data/actions';
import { signIn, signOut, syncNow, useSync } from '../data/sync';
import { setThemePref, themePref, type ThemePref } from '../theme';
import { dateTimeFr, parseNum, price, usd } from '../domain/format';

export function SettingsScreen() {
  const data = useData();
  const sync = useSync();
  const ps = usePrices();
  const [theme, setTheme] = useState<ThemePref>(themePref());
  const [confirm, setConfirm] = useState<'' | 'reset' | 'plat'>('');
  const [plat, setPlat] = useState('');
  const [key, setKey] = useState(getPrefs().cgKey || '');
  const jsonInput = useRef<HTMLInputElement>(null);
  const platforms = [...new Set(data.txs.map((t) => t.platform))].sort();

  return (
    <div className="screen screen-white" data-screen="parametres">
      <SubHeader title="Paramètres" fallback="/portefeuille" bordered />
      <main className="content form-narrow stack-16" style={{ paddingBottom: 'calc(var(--safe-bottom) + 48px)' }}>
        <section className="stack-8" aria-labelledby="s-sync">
          <h2 id="s-sync" className="t-h3">Compte et synchronisation</h2>
          {!sync.configured ? (
            <p className="t-caption c-neutral">Mode local : vos données restent sur cet appareil. Pour les retrouver sur votre téléphone et votre ordinateur avec votre compte Google, activez Firebase (gratuit) en suivant le guide de mise en ligne, étape 3.</p>
          ) : sync.user ? (
            <div className="card g8" style={{ boxShadow: 'none', border: '1px solid var(--border-minimal)' }}>
              <span className="t-strong">{sync.user.name || sync.user.email}</span>
              <span className="t-caption c-neutral">{sync.user.email}</span>
              <span className="t-caption c-moderate">{sync.state === 'error' ? sync.error : sync.lastSync ? `Synchronisé le ${dateTimeFr(sync.lastSync)}` : 'Synchronisation…'}</span>
              <div className="grid-2 btns">
                <button type="button" className="btn btn-secondary" onClick={() => void syncNow()}><Icon name="cloud" size={18} />Synchroniser</button>
                <button type="button" className="btn btn-tertiary" onClick={() => void signOut()}><Icon name="logout" size={18} />Se déconnecter</button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-secondary block" onClick={() => signIn().catch((e) => showToast('Connexion impossible : ' + (e as Error).message, { error: true }))}>Se connecter avec Google</button>
          )}
        </section>

        <section className="stack-8" aria-labelledby="s-data">
          <h2 id="s-data" className="t-h3">Mes données</h2>
          <p className="t-caption c-neutral">{data.txs.length} opérations · {platforms.join(', ') || 'aucune plateforme'}</p>
          <button type="button" className="btn btn-primary block" onClick={() => navigate('/historique/import')}><Icon name="upload" size={18} />Importer des exports</button>
          <div className="grid-2 btns">
            <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={!data.txs.length}><Icon name="download" size={18} />Exporter en CSV</button>
            <button type="button" className="btn btn-secondary" onClick={exportJson}><Icon name="download" size={18} />Sauvegarde complète</button>
          </div>
          <button type="button" className="btn btn-tertiary" onClick={() => jsonInput.current?.click()}><Icon name="sheet" size={18} />Restaurer une sauvegarde (.json)</button>
          <input ref={jsonInput} type="file" accept=".json,application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            try { const n = await importJson(f); showToast(`Sauvegarde restaurée : ${n} opérations`); } catch { showToast('Fichier de sauvegarde illisible', { error: true }); }
          }} />
          {hasDemo(data) && <button type="button" className="btn btn-secondary block" onClick={() => { clearDemo(); showToast('Données d’exemple retirées'); }}>Retirer les données d’exemple</button>}
          {platforms.length > 0 && (
            <div className="row" style={{ gap: 'var(--space-8)' }}>
              <select className="input grow" aria-label="Plateforme à effacer" value={plat} onChange={(e) => setPlat(e.target.value)}>
                <option value="">Plateforme…</option>
                {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button type="button" className="btn btn-secondary" disabled={!plat} onClick={() => setConfirm('plat')}><Icon name="trash" size={18} />Effacer</button>
            </div>
          )}
          <button type="button" className="btn btn-tertiary" style={{ color: 'var(--critical-text)' }} onClick={() => setConfirm('reset')}>Tout effacer</button>
        </section>

        <section className="stack-12" aria-labelledby="s-view">
          <h2 id="s-view" className="t-h3">Affichage</h2>
          <Segmented label="Thème" value={theme} onChange={(v) => { setTheme(v); setThemePref(v); }} options={[['system', 'Système'], ['light', 'Clair'], ['dark', 'Sombre']]} />
          <div className="between">
            <span id="s-small" className="stack"><span className="t-strong">Masquer les petits soldes</span><span className="t-caption c-neutral">Poussières de moins de {usd(data.settings.smallThreshold, 0)}</span></span>
            <Switch labelledBy="s-small" checked={data.settings.hideSmall} onChange={(v) => update((d) => { d.settings.hideSmall = v; })} />
          </div>
          <label className="field"><span className="lbl">Seuil des petits soldes ($)</span>
            <input className="input num" inputMode="decimal" defaultValue={String(data.settings.smallThreshold)} onBlur={(e) => { const v = parseNum(e.target.value); if (v >= 0) update((d) => { d.settings.smallThreshold = v; }); }} />
          </label>
        </section>

        <section className="stack-8" aria-labelledby="s-price">
          <h2 id="s-price" className="t-h3">Cours</h2>
          <dl className="dl t-caption">
            <dt>Dernière mise à jour</dt><dd>{ps.updatedAt ? dateTimeFr(ps.updatedAt) : '—'}</dd>
            <dt>Source</dt><dd>{ps.source === 'live' ? 'CoinGecko en direct' : ps.source === 'robot' ? 'Fichier du robot' : '—'}</dd>
            <dt>Fichier du robot</dt><dd>{ps.robotAt ? dateTimeFr(ps.robotAt) : 'absent'}</dd>
          </dl>
          {ps.error && <p className="t-caption c-critical">{ps.error}</p>}
          <button type="button" className="btn btn-secondary block" onClick={() => navigate('/parametres/symboles')}><Icon name="link" size={18} />Correspondances des symboles</button>
          <label className="field"><span className="lbl">Clé « Demo » CoinGecko (facultatif)</span>
            <input className="input" value={key} onChange={(e) => setKey(e.target.value)} onBlur={() => { setPrefs({ cgKey: key.trim() || undefined }); }} placeholder="CG-…" autoComplete="off" />
            <span className="hint">Gratuite sur coingecko.com/api : relève la limite d’appels si les historiques se chargent mal. Stockée uniquement sur cet appareil. C’est une clé de lecture de cours, jamais une clé de plateforme.</span>
          </label>
          <button type="button" className="btn btn-tertiary" onClick={() => void refreshPrices({ force: true })}><Icon name="refresh" size={18} />Actualiser maintenant</button>
        </section>

        <section className="stack-8" aria-labelledby="s-method">
          <h2 id="s-method" className="t-h3">Méthode de calcul</h2>
          <ul className="stack-8 t-caption c-neutral">
            <li><strong style={{ color: 'var(--text)' }}>Devise :</strong> tout est valorisé en dollars US. Les opérations en euros (ou autre devise) sont converties au taux BCE du jour (Frankfurter).</li>
            <li><strong style={{ color: 'var(--text)' }}>Prix de revient :</strong> PRU moyen pondéré par crypto, frais d’achat inclus. Une vente dégage une plus-value = produit net − PRU × quantité.</li>
            <li><strong style={{ color: 'var(--text)' }}>Échange crypto ↔ crypto :</strong> vente de l’une et achat de l’autre à la valeur en dollars donnée par l’export ; sans valeur, le coût est reporté.</li>
            <li><strong style={{ color: 'var(--text)' }}>Transferts :</strong> un envoi et une réception de la même crypto à quelques heures d’écart sont rapprochés : le coût suit les jetons, seuls les frais de réseau sont perdus.</li>
            <li><strong style={{ color: 'var(--text)' }}>Stablecoins :</strong> USDT, USDC… valent 1 $ quand l’export n’a pas de prix.</li>
          </ul>
          <p className="t-legal c-moderate">Suivi indicatif, ce n’est pas un calcul fiscal. Si vous êtes résident fiscal français, les cessions de crypto se déclarent selon la méthode du prix total d’acquisition (formulaire 2086) et les comptes à l’étranger (Binance, Coinbase…) sur le formulaire 3916-bis : vérifiez sur impots.gouv.fr ou auprès d’un professionnel.</p>
        </section>

        <section className="stack-8" aria-labelledby="s-sec">
          <h2 id="s-sec" className="t-h3">Sécurité</h2>
          <p className="t-caption c-neutral row" style={{ alignItems: 'flex-start' }}><Icon name="shield" size={18} />CryptoAnalyze ne passe aucun ordre et ne détient aucun fonds. Ne saisissez jamais de clé d’API de plateforme, de mot de passe ni de phrase de récupération (seed) : l’app n’en a pas besoin et ne vous les demandera jamais.</p>
        </section>
        <p className="t-legal c-moderate center"><Logo size={14} /><br />Pas un conseil en investissement · données de marché CoinGecko, indicatives.</p>
      </main>

      {confirm && (
        <Sheet title={confirm === 'reset' ? 'Tout effacer ?' : `Effacer ${plat} ?`} onClose={() => setConfirm('')} footer={
          <div className="grid-2 btns">
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm('')}>Annuler</button>
            <button type="button" className="btn btn-danger" onClick={() => {
              if (confirm === 'reset') { resetAll(); showToast('Toutes les données ont été effacées'); }
              else { const undo = deletePlatform(plat); showToast(`Opérations ${plat} effacées`, { undo }); setPlat(''); }
              setConfirm('');
            }}>Effacer</button>
          </div>
        }>
          <p className="c-neutral" style={{ paddingBottom: 'var(--space-16)' }}>
            {confirm === 'reset' ? 'Toutes les opérations, imports et réglages de cet appareil seront supprimés (et du cloud si la synchronisation est active). Pensez à exporter une sauvegarde avant.' : `Les ${data.txs.filter((t) => t.platform === plat).length} opérations de ${plat} seront supprimées. Vous pourrez les réimporter.`}
          </p>
        </Sheet>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ correspondances symbole → CoinGecko
export function MappingScreen() {
  const data = useData();
  usePrices();
  const [edit, setEdit] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const symbols = neededSymbols(data).sort();
  return (
    <div className="screen screen-white" data-screen="symboles">
      <SubHeader title="Correspondances" fallback="/parametres" bordered />
      <main className="content form-narrow">
        <p className="t-caption c-neutral">Chaque symbole importé est relié à une crypto CoinGecko pour obtenir son cours. Par défaut, la plus grosse capitalisation portant ce symbole est choisie ; corrigez ici en cas d’homonyme ou de jeton inconnu.</p>
        <ul className="divided">
          {symbols.map((s) => {
            const id = coinIdOf(s, data);
            const qt = quoteOf(s, data);
            return (
              <li key={s}>
                <button type="button" className="row-link" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-12)', width: '100%' }} onClick={() => { setEdit(s); setQ(s); }}>
                  <CoinAvatar symbol={s} size={32} />
                  <span className="stack grow" style={{ minWidth: 0 }}>
                    <span className="t-strong">{s}{data.coinIds[s] ? ' · choisi' : ''}</span>
                    <span className="t-caption c-moderate ellipsis">{id || 'aucune correspondance'}</span>
                  </span>
                  <span className={'t-caption nowrap ' + (qt ? '' : 'c-critical')}>{qt ? price(qt.usd) : 'sans cours'}</span>
                  <Icon name="pencil" size={18} style={{ color: 'var(--primary-fg)' }} />
                </button>
              </li>
            );
          })}
        </ul>
      </main>
      {edit && (
        <Sheet title={`Associer ${edit}`} full onClose={() => setEdit(null)} head={
          <label className="search"><Icon name="search" size={20} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" placeholder="Nom ou symbole" /></label>
        }>
          <ul className="divided" style={{ paddingBottom: 'var(--space-16)' }}>
            {data.coinIds[edit] && (
              <li><button type="button" className="row-link" onClick={() => { update((d) => { delete d.coinIds[edit]; }); setEdit(null); void refreshPrices({ force: true }); }}><span className="t-strong">Revenir au choix automatique</span></button></li>
            )}
            {searchCoins(q).map((c) => (
              <li key={c.id}>
                <button type="button" className="row-link" onClick={() => { update((d) => { d.coinIds[edit] = c.id; }); setEdit(null); showToast(`${edit} → ${c.name}`); void refreshPrices({ force: true }); }}>
                  <span className="t-strong">{c.name} ({c.symbol})</span>
                  <span className="t-caption c-moderate">{c.id}{c.rank ? ` · n° ${c.rank}` : ''}{c.usd !== undefined ? ' · ' + price(c.usd) : ''}</span>
                </button>
              </li>
            ))}
          </ul>
          <ManualId onSave={(id) => { update((d) => { d.coinIds[edit] = id; }); setEdit(null); void refreshPrices({ force: true }); }} />
        </Sheet>
      )}
    </div>
  );
}

function ManualId({ onSave }: { onSave: (id: string) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="stack-8" style={{ paddingBottom: 'var(--space-24)' }}>
      <label className="field"><span className="lbl">Ou identifiant CoinGecko exact</span>
        <input className="input" value={v} onChange={(e) => setV(e.target.value.trim().toLowerCase())} placeholder="ex. render-token" />
        <span className="hint">C’est la fin de l’adresse de la page coingecko.com/fr/pieces/…</span>
      </label>
      <button type="button" className="btn btn-secondary" disabled={!/^[a-z0-9-]+$/.test(v)} onClick={() => onSave(v)}>Utiliser cet identifiant</button>
    </div>
  );
}

// ------------------------------------------------------------------ connexion
export function LoginScreen({ onSkip }: { onSkip: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <span className="art"><Icon name="candle" size={64} strokeWidth={2.2} /></span>
      <div className="stack-8">
        <h1 className="t-h1"><Logo size={26} /></h1>
        <p className="t-body c-neutral">Toutes vos cryptos, toutes vos plateformes, un seul tableau de bord.</p>
      </div>
      <div className="stack-12" style={{ width: '100%', maxWidth: 360 }}>
        <button type="button" className="btn btn-secondary block" disabled={busy} style={{ height: 48 }}
          onClick={async () => { setBusy(true); try { await signIn(); } catch (e) { showToast('Connexion impossible : ' + (e as Error).message, { error: true }); } finally { setBusy(false); } }}>
          {busy ? 'Connexion…' : 'Continuer avec Google'}
        </button>
        <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'center' }} onClick={() => { setPrefs({ skipLogin: true }); onSkip(); }}>
          Utiliser sans compte (données sur cet appareil uniquement)
        </button>
      </div>
      <p className="t-legal c-moderate" style={{ maxWidth: 320 }}>Vos données sont synchronisées dans votre espace privé, gratuitement. Rien n’est partagé.</p>
    </main>
  );
}

export function LoadingScreen() {
  return <div className="screen" aria-busy="true" aria-label="Chargement" />;
}
