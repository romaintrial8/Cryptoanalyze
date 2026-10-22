// Actions qui modifient les données (import, saisie, suppression, sauvegardes).
import { getData, newId, normalize, replaceData, update } from './store';
import { ensureFx } from './fx';
import { refreshPrices } from './prices';
import { parseText, type ParseResult } from '../domain/importers';
import { toCsv } from '../domain/exporters';
import { DEMO_CSV } from './demo';
import type { AppData, Tx } from '../domain/types';

export interface ImportPreview {
  result: ParseResult;
  file: string;
  fresh: number; // nouvelles opérations
  dupes: number; // déjà présentes (ignorées)
  range: [string, string] | null;
  assets: string[];
}

export function previewImport(file: string, results: ParseResult[]): ImportPreview[] {
  const keys = new Set(getData().txs.map((t) => t.key).filter(Boolean));
  return results.map((result) => {
    let fresh = 0, dupes = 0;
    for (const t of result.txs) { if (t.key && keys.has(t.key)) dupes++; else fresh++; }
    const dates = result.txs.map((t) => t.date).sort();
    const assets = [...new Set(result.txs.flatMap((t) => [t.inLeg?.asset, t.outLeg?.asset]).filter(Boolean) as string[])];
    return { result, file, fresh, dupes, range: dates.length ? [dates[0], dates[dates.length - 1]] : null, assets };
  });
}

/** Ajoute les opérations nouvelles (les doublons, reconnus par leur empreinte, sont ignorés). */
export function applyImport(items: ImportPreview[], platformOverride?: Record<number, string>): { added: number; skipped: number } {
  let added = 0, skipped = 0;
  update((d) => {
    const keys = new Set(d.txs.map((t) => t.key).filter(Boolean));
    items.forEach((it, i) => {
      const plat = platformOverride?.[i]?.trim();
      let n = 0;
      for (const t of it.result.txs) {
        const key = plat && plat !== it.result.platform ? t.key?.replace(/^[^|]*/, plat.toLowerCase()) : t.key;
        if (key && keys.has(key)) { skipped++; continue; }
        if (key) keys.add(key);
        d.txs.push({ ...t, key, platform: plat || t.platform, id: newId('tx') });
        n++;
      }
      added += n;
      d.imports.unshift({ id: newId('imp'), at: new Date().toISOString(), file: it.file, platform: plat || it.result.platform, added: n, skipped: it.result.txs.length - n });
    });
    d.imports = d.imports.slice(0, 50);
  });
  void ensureFx();
  void refreshPrices({ force: true });
  return { added, skipped };
}

export function loadDemo(): number {
  const r = parseText(DEMO_CSV);
  if (!r) return 0;
  const before = getData().txs.length;
  update((d) => {
    for (const t of r.txs) d.txs.push({ ...t, id: newId('tx'), key: 'demo|' + t.key, src: 'demo' });
    d.imports.unshift({ id: newId('imp'), at: new Date().toISOString(), file: 'Données d’exemple', platform: 'Démo', added: r.txs.length, skipped: 0 });
  });
  void refreshPrices({ force: true });
  return getData().txs.length - before;
}

export function hasDemo(d: AppData = getData()): boolean {
  return d.txs.some((t) => t.src === 'demo');
}

export function clearDemo(): void {
  update((d) => { d.txs = d.txs.filter((t) => t.src !== 'demo'); d.imports = d.imports.filter((i) => i.platform !== 'Démo'); });
}

export function saveTx(tx: Tx): void {
  update((d) => {
    const i = d.txs.findIndex((t) => t.id === tx.id);
    if (i >= 0) d.txs[i] = tx; else d.txs.push(tx);
  });
  void ensureFx();
}

/** Supprime des opérations ; renvoie une fonction d'annulation. */
export function deleteTxs(ids: string[]): () => void {
  const before = getData().txs;
  const set = new Set(ids);
  update((d) => { d.txs = d.txs.filter((t) => !set.has(t.id)); });
  return () => update((d) => { const cur = new Set(d.txs.map((t) => t.id)); d.txs = [...d.txs, ...before.filter((t) => set.has(t.id) && !cur.has(t.id))]; });
}

/** Supprime toutes les opérations d'un import (même fichier et même plateforme ne suffisent pas : on passe par la plateforme). */
export function deletePlatform(platform: string): () => void {
  return deleteTxs(getData().txs.filter((t) => t.platform === platform).map((t) => t.id));
}

// ------------------------------------------------------------------ fichiers téléchargés
export function download(name: string, content: string, type = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const stamp = () => new Date().toISOString().slice(0, 10);
export function exportCsv(): void {
  download(`cryptoanalyze-operations-${stamp()}.csv`, '﻿' + toCsv(getData().txs));
}
export function exportJson(): void {
  download(`cryptoanalyze-sauvegarde-${stamp()}.json`, JSON.stringify(getData(), null, 1), 'application/json');
}
export async function importJson(file: File): Promise<number> {
  const d = normalize(JSON.parse(await file.text()));
  replaceData(d);
  void ensureFx();
  void refreshPrices({ force: true });
  return d.txs.length;
}
export function resetAll(): void {
  replaceData(normalize(null));
}
