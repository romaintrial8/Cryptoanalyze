// Lecture des fichiers déposés par l'utilisateur : CSV, Excel (.xlsx) et archives .zip (exports Binance).
// Le classeur Excel est lu sans bibliothèque lourde : JSZip + lecture directe du XML des feuilles.
import { parseRows, parseText, type ParseResult } from '../domain/importers';

export interface FileResult {
  name: string;
  results: ParseResult[];
  error?: string;
}

function decodeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
}

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] || 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Lit toutes les feuilles d'un classeur .xlsx en tableaux de chaînes. */
export async function readXlsx(buf: ArrayBuffer | Uint8Array): Promise<string[][][]> {
  const JSZip = (await import('jszip')).default; // chargé à la demande : le bundle de démarrage reste léger
  const zip = await JSZip.loadAsync(buf);
  const ssXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const shared: string[] = [];
  if (ssXml) {
    for (const si of ssXml.match(/<si>[\s\S]*?<\/si>/g) || []) {
      shared.push(decodeXml((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')));
    }
  }
  const sheets = Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')));
  const out: string[][][] = [];
  for (const f of sheets) {
    const xml = await zip.file(f)!.async('string');
    const rows: string[][] = [];
    for (const r of xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || []) {
      const row: string[] = [];
      for (const c of r.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
        const ref = /\br="([A-Z]+\d+)"/.exec(c)?.[1] || '';
        const type = /\bt="(\w+)"/.exec(c)?.[1] || 'n';
        let v = '';
        if (type === 'inlineStr') v = decodeXml((c.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join(''));
        else {
          const raw = /<v>([\s\S]*?)<\/v>/.exec(c)?.[1];
          if (raw !== undefined) v = type === 's' ? shared[+raw] ?? '' : decodeXml(raw);
        }
        const i = ref ? colIndex(ref) : row.length;
        while (row.length < i) row.push('');
        row[i] = v.trim();
      }
      if (row.some((x) => x !== '')) rows.push(row);
    }
    out.push(rows);
  }
  return out;
}

async function fromBuffer(name: string, buf: ArrayBuffer | Uint8Array): Promise<ParseResult[]> {
  const lower = name.toLowerCase();
  if (lower.endsWith('.xlsx')) {
    const sheets = await readXlsx(buf);
    return sheets.map((rows) => parseRows(rows, name)).filter(Boolean) as ParseResult[];
  }
  if (lower.endsWith('.zip')) {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buf);
    const res: ParseResult[] = [];
    for (const f of Object.values(zip.files)) {
      if (f.dir || !/\.(csv|xlsx|txt)$/i.test(f.name)) continue;
      res.push(...(await fromBuffer(f.name, await f.async('uint8array'))));
    }
    return res;
  }
  const text = new TextDecoder('utf-8').decode(buf);
  const r = parseText(text, name);
  return r ? [r] : [];
}

export async function readImportFile(file: File): Promise<FileResult> {
  try {
    const buf = await file.arrayBuffer();
    const results = await fromBuffer(file.name, buf);
    if (!results.length) return { name: file.name, results, error: 'Format non reconnu. Formats acceptés : export Coinbase, Binance (relevé ou trades), Kraken, ou CSV CryptoAnalyze.' };
    return { name: file.name, results };
  } catch (e) {
    return { name: file.name, results: [], error: 'Lecture impossible : ' + (e as Error).message };
  }
}
