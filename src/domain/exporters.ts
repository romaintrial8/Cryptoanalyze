// Export des opérations au format CSV CryptoAnalyze (relisible par l'import : aller-retour sans perte).
import type { Tx } from './types';
import { GENERIC_HEADER } from './importers';
import { sortTxs } from './calc';

function cell(v: string | number | undefined): string {
  if (v === undefined || v === null) return '';
  const s = typeof v === 'number' ? String(Number(v.toPrecision(15))) : v;
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(txs: Tx[]): string {
  const lines = [GENERIC_HEADER.join(',')];
  for (const t of sortTxs(txs)) {
    lines.push([
      t.date, t.kind, t.inLeg?.asset, t.inLeg?.qty, t.outLeg?.asset, t.outLeg?.qty, t.fee?.asset, t.fee?.qty,
      t.usd, t.feeUsd, t.platform, t.incomeType, t.note,
    ].map(cell).join(','));
  }
  return lines.join('\n') + '\n';
}
