// Calculs dérivés partagés par les écrans (recalculés quand les données ou les cours changent).
import { useMemo } from 'react';
import { useData } from '../data/store';
import { quoteOf, usePrices } from '../data/prices';
import { computePositions, computeSummary, runLedger, type LedgerResult } from '../domain/calc';
import { todayIso } from '../domain/format';
import type { AppData, Position, Summary } from '../domain/types';

export interface Calc {
  data: AppData;
  led: LedgerResult;
  positions: Position[]; // toutes (y compris soldées avec plus-value réalisée)
  held: Position[]; // détenues
  visible: Position[]; // détenues, hors poussières si l'option est active
  summary: Summary;
  pos: (asset: string) => Position | undefined;
}

export function useCalc(): Calc {
  const data = useData();
  const ps = usePrices();
  return useMemo(() => {
    const led = runLedger(data.txs, data.fx);
    const positions = computePositions(led, (a) => quoteOf(a, data));
    const summary = computeSummary(led, positions, data.txs.length, todayIso(), data.settings.smallThreshold);
    const held = positions.filter((p) => p.qty > 0);
    // sans cours connu, on juge sur le coût : un jeton reçu gratuitement et sans cours (souvent un spam d'airdrop) est masqué
    const visible = data.settings.hideSmall ? held.filter((p) => (p.price === null ? p.cost >= data.settings.smallThreshold : p.value >= data.settings.smallThreshold)) : held;
    return { data, led, positions, held, visible, summary, pos: (a: string) => positions.find((p) => p.asset === a) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ps.quotes]);
}
