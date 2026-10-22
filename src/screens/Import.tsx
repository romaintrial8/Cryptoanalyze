// Import des exports bruts des plateformes : dépôt de fichiers, aperçu (format reconnu, nouveautés, doublons,
// lignes ignorées ou non reconnues), puis ajout au portefeuille.
import { useRef, useState } from 'react';
import { SubHeader, showToast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { navigate } from '../ui/router';
import { readImportFile } from '../data/files';
import { applyImport, download, previewImport, type ImportPreview } from '../data/actions';
import { knownSymbol } from '../data/prices';
import { useData } from '../data/store';
import { GENERIC_HEADER } from '../domain/importers';
import { dateFr, dateTimeFr, plural } from '../domain/format';

export function ImportScreen() {
  const data = useData();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ImportPreview[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [plats, setPlats] = useState<Record<number, string>>({});
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | File[]) => {
    setBusy(true);
    const nextItems: ImportPreview[] = [...items];
    const errs: string[] = [];
    for (const f of Array.from(files)) {
      const r = await readImportFile(f);
      if (r.error) errs.push(`${f.name} : ${r.error}`);
      nextItems.push(...previewImport(f.name, r.results));
    }
    setItems(nextItems);
    setErrors(errs);
    setBusy(false);
  };
  const total = items.reduce((s, it) => s + it.fresh, 0);
  const confirm = () => {
    const { added, skipped } = applyImport(items, plats);
    showToast(`${plural(added, '{n} opération importée', '{n} opérations importées')}${skipped ? ` · ${skipped} doublon${skipped > 1 ? 's' : ''} ignoré${skipped > 1 ? 's' : ''}` : ''}`);
    setItems([]);
    navigate('/portefeuille');
  };

  return (
    <div className="screen screen-white" data-screen="import">
      <SubHeader title="Importer" fallback="/historique" bordered />
      <main className="content form-narrow" style={{ paddingBottom: 'calc(var(--safe-bottom) + 120px)' }}>
        <label className={'dropzone' + (drag ? ' over' : '')}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) void onFiles(e.dataTransfer.files); }}>
          <span className="empty-icon" style={{ width: 64, height: 64 }}><Icon name="fileUp" size={30} /></span>
          <span className="t-amount-m">{busy ? 'Lecture…' : 'Choisir des fichiers'}</span>
          <span className="t-caption c-neutral">CSV, Excel (.xlsx) ou ZIP · plusieurs fichiers à la fois · Coinbase, Binance, Ledger Live, Kraken, CSV CryptoAnalyze</span>
          <input ref={input} type="file" multiple accept=".csv,.xlsx,.zip,.txt,text/csv" className="sr-only" onChange={(e) => { if (e.target.files?.length) void onFiles(e.target.files); e.target.value = ''; }} />
        </label>

        {errors.map((e) => <div key={e} role="alert" className="note" style={{ background: 'var(--critical-bg)', color: 'var(--critical-text)' }}><Icon name="alert" size={20} /><span>{e}</span></div>)}

        {items.map((it, i) => {
          const unknown = Object.entries(it.result.unknown);
          const strange = it.assets.filter((a) => !knownSymbol(a) && !/^(USD|EUR|GBP|CAD|AUD|CHF|JPY)$/.test(a));
          return (
            <section key={i} className="card g8" style={{ boxShadow: 'none', border: '1px solid var(--border-minimal)' }} aria-label={it.file}>
              <div className="between" style={{ alignItems: 'flex-start' }}>
                <span className="stack" style={{ minWidth: 0 }}>
                  <span className="t-amount-m">{it.result.format}</span>
                  <span className="t-caption c-moderate ellipsis">{it.file}</span>
                </span>
                <button type="button" className="icon-btn neutral" aria-label="Retirer ce fichier" onClick={() => setItems(items.filter((_, k) => k !== i))}><Icon name="close" size={20} /></button>
              </div>
              <label className="field">
                <span className="lbl">Plateforme</span>
                <input className="input" value={plats[i] ?? it.result.platform} onChange={(e) => setPlats({ ...plats, [i]: e.target.value })} />
              </label>
              <dl className="dl t-caption">
                <dt>Période</dt><dd>{it.range ? `${dateFr(it.range[0])} → ${dateFr(it.range[1])}` : '—'}</dd>
                <dt>Lignes lues</dt><dd>{it.result.rows}</dd>
                <dt>Nouvelles opérations</dt><dd className="c-success">{it.fresh}</dd>
                {it.dupes > 0 && <><dt>Déjà importées (ignorées)</dt><dd>{it.dupes}</dd></>}
                {it.result.ignored > 0 && <><dt>Mouvements internes ignorés</dt><dd>{it.result.ignored}</dd></>}
              </dl>
              {it.assets.length > 0 && <p className="t-caption c-neutral">Actifs : {it.assets.join(', ')}</p>}
              {strange.length > 0 && <p className="t-caption c-neutral row" style={{ alignItems: 'flex-start' }}><Icon name="info" size={16} />Symboles absents du catalogue : {strange.join(', ')}. Associez-les à un identifiant CoinGecko dans Paramètres pour obtenir leur cours.</p>}
              {unknown.length > 0 && (
                <div className="note" style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)' }}>
                  <Icon name="alert" size={20} />
                  <span>Types non reconnus, non importés : {unknown.map(([k, n]) => `${k} (${n})`).join(', ')}. Saisissez-les à la main si besoin, et envoyez un exemple de ligne pour qu’ils soient pris en charge.</span>
                </div>
              )}
              {it.result.warnings.length > 0 && (
                <details className="t-caption c-neutral"><summary style={{ cursor: 'pointer', minHeight: 32 }}>{plural(it.result.warnings.length, '{n} remarque', '{n} remarques')}</summary>
                  <ul className="stack-4" style={{ paddingTop: 'var(--space-6)' }}>{it.result.warnings.map((w, k) => <li key={k}>• {w}</li>)}</ul>
                </details>
              )}
            </section>
          );
        })}

        {items.length > 0 && (
          <button type="button" className="btn btn-primary block" disabled={!total} onClick={confirm} style={{ minHeight: 48 }}>
            {total ? `Importer ${plural(total, '{n} opération', '{n} opérations')}` : 'Rien de nouveau à importer'}
          </button>
        )}

        <section className="stack-8" aria-labelledby="imp-how">
          <h2 id="imp-how" className="t-h3">Où trouver mes exports ?</h2>
          <details className="faq" open={!data.txs.length}>
            <summary>Coinbase<Icon name="down" size={20} /></summary>
            <div className="faq-a">
              <ol style={{ paddingLeft: 'var(--space-20)', margin: 0 }} className="stack-4">
                <li>Sur coinbase.com : icône du profil › <strong>Rapports</strong> (ou Paramètres › Rapports).</li>
                <li><strong>Générer un rapport</strong> › type « Historique des transactions » › toutes les dates, tous les actifs › format <strong>CSV</strong>.</li>
                <li>Le fichier arrive par e-mail ou dans la liste des rapports : déposez-le ici tel quel.</li>
              </ol>
              <p>Achats, ventes, conversions, envois, réceptions, staking et récompenses sont reconnus. Les montants sont en dollars si votre compte est en USD.</p>
            </div>
          </details>
          <details className="faq">
            <summary>Binance<Icon name="down" size={20} /></summary>
            <div className="faq-a">
              <p><strong>Recommandé – relevé complet :</strong> Portefeuille › Vue d’ensemble › <strong>Historique des transactions</strong> › Exporter › « Générer tous les relevés » (par tranches de 12 mois). Déposez les CSV ou le ZIP tels quels : achats, conversions, dépôts, retraits, Earn et airdrops sont reconnus.</p>
              <p><strong>Alternative :</strong> Ordres › Ordre spot › Historique des trades › Exporter (Excel). Il ne contient que les trades : ajoutez dépôts et revenus avec le relevé.</p>
              <p>Ne combinez pas les deux exports pour la même période : les trades seraient comptés deux fois.</p>
            </div>
          </details>
          <details className="faq">
            <summary>Ledger (portefeuille matériel)<Icon name="down" size={20} /></summary>
            <div className="faq-a">
              <ol style={{ paddingLeft: 'var(--space-20)', margin: 0 }} className="stack-4">
                <li>Ouvrez <strong>Ledger Live</strong> sur ordinateur (pas besoin de brancher le Ledger).</li>
                <li><strong>Paramètres</strong> (roue dentée) › onglet <strong>Comptes</strong> › « Historique des opérations » › <strong>Exporter</strong> › sélectionnez tous les comptes › enregistrez le CSV.</li>
                <li>Déposez-le ici : chaque retrait Binance ou Coinbase vers le Ledger est rapproché de sa réception, le prix de revient suit vos jetons.</li>
              </ol>
              <p>Le fichier ne contient que l’historique public de vos adresses : aucune clé, aucune phrase de récupération.</p>
            </div>
          </details>
          <details className="faq">
            <summary>Kraken et autres plateformes<Icon name="down" size={20} /></summary>
            <div className="faq-a">
              <p><strong>Kraken :</strong> Documents › Exports › « Ledgers » (CSV, toutes les colonnes).</p>
              <p><strong>Autre plateforme ou portefeuille personnel :</strong> remplissez le modèle CSV CryptoAnalyze (une ligne par opération), ou saisissez les opérations avec le bouton +.</p>
              <button type="button" className="ext-link" style={{ border: 0, background: 'none', padding: 0 }} onClick={() => download('modele-cryptoanalyze.csv', '﻿' + GENERIC_HEADER.join(',') + '\n2026-01-15 10:00:00,trade,BTC,0.001,USD,100,USD,1,100,1,Kraken,,achat exemple\n2026-02-01 00:00:00,income,DOT,0.5,,,,,3.5,,Kraken,staking,\n')}>
                <Icon name="download" size={18} />Télécharger le modèle CSV
              </button>
            </div>
          </details>
          <p className="t-legal c-moderate row" style={{ alignItems: 'flex-start' }}><Icon name="shield" size={14} />Les fichiers sont lus sur votre appareil ; rien n’est envoyé ailleurs (sauf votre sauvegarde privée si la synchronisation Google est activée). Ne saisissez jamais de clé d’API ni de phrase de récupération.</p>
        </section>

        {data.imports.length > 0 && (
          <section className="stack-8" aria-labelledby="imp-hist">
            <h2 id="imp-hist" className="t-h3">Imports précédents</h2>
            <ul className="divided t-caption">
              {data.imports.slice(0, 8).map((i) => (
                <li key={i.id} className="between" style={{ padding: 'var(--space-8) 0' }}>
                  <span className="stack" style={{ minWidth: 0 }}><span className="t-caption-strong ellipsis">{i.platform} · {i.file}</span><span className="c-moderate">{dateTimeFr(i.at)}</span></span>
                  <span className="nowrap">+{i.added}{i.skipped ? ` · ${i.skipped} ignorés` : ''}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
