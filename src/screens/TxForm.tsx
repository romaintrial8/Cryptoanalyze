// Saisie et modification d'une opération (plein écran). Calcul en direct, bouton désactivé tant que c'est invalide.
import { useMemo, useState } from 'react';
import { SubHeader, Segmented, showToast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { back, useRoute } from '../ui/router';
import { useData, newId } from '../data/store';
import { saveTx } from '../data/actions';
import { searchCoins } from '../data/prices';
import { txCategory } from '../domain/calc';
import { normSymbol, isFiat } from '../domain/assets';
import { num, parseNum, price, toInput } from '../domain/format';
import type { IncomeType, Leg, Tx } from '../domain/types';

type Mode = 'buy' | 'sell' | 'swap' | 'income' | 'transfer' | 'transfer_in' | 'transfer_out';
const TITLES: Record<Mode, string> = { buy: 'Achat', sell: 'Vente', swap: 'Échange', income: 'Revenu', transfer: 'Transfert', transfer_in: 'Réception', transfer_out: 'Envoi' };
const CURRENCIES = ['USD', 'EUR', 'USDC', 'USDT'];

function localParts(iso?: string): { date: string; time: string } {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

interface F {
  date: string; time: string; platform: string; note: string;
  asset: string; qty: string; cur: string; amount: string; fee: string;
  inAsset: string; inQty: string; usd: string; feeAsset: string; feeQty: string;
  to: string; recv: string; incomeType: IncomeType;
}

function fromTx(t: Tx | undefined, mode: Mode): F {
  const { date, time } = localParts(t?.date);
  const f: F = { date, time, platform: t?.platform || '', note: t?.note || '', asset: '', qty: '', cur: 'USD', amount: '', fee: '', inAsset: '', inQty: '', usd: t?.usd !== undefined ? toInput(t.usd, 2) : '', feeAsset: t?.fee?.asset || '', feeQty: t?.fee ? toInput(t.fee.qty) : '', to: '', recv: '', incomeType: t?.incomeType || 'staking' };
  if (!t) return f;
  const i = t.inLeg, o = t.outLeg;
  if (mode === 'buy' && i && o) Object.assign(f, { asset: i.asset, qty: toInput(i.qty), cur: o.asset, amount: toInput(o.qty, 2), fee: t.fee && t.fee.asset === o.asset ? toInput(t.fee.qty) : '' });
  if (mode === 'sell' && i && o) Object.assign(f, { asset: o.asset, qty: toInput(o.qty), cur: i.asset, amount: toInput(i.qty, 2), fee: t.fee && t.fee.asset === i.asset ? toInput(t.fee.qty) : '' });
  if (mode === 'swap' && i && o) Object.assign(f, { asset: o.asset, qty: toInput(o.qty), inAsset: i.asset, inQty: toInput(i.qty) });
  if (mode === 'income' && i) Object.assign(f, { asset: i.asset, qty: toInput(i.qty) });
  if (mode === 'transfer_in' && i) Object.assign(f, { asset: i.asset, qty: toInput(i.qty) });
  if (mode === 'transfer_out' && o) Object.assign(f, { asset: o.asset, qty: toInput(o.qty) });
  return f;
}

export function TxFormScreen() {
  const route = useRoute();
  const data = useData();
  const editId = route.query.get('id');
  const existing = editId ? data.txs.find((t) => t.id === editId) : undefined;
  const initialMode: Mode = existing
    ? (existing.kind === 'trade' ? (txCategory(existing) as Mode) : (existing.kind as Mode))
    : ((route.query.get('type') as Mode) || 'buy');
  const [mode, setMode] = useState<Mode>(initialMode);
  const [f, setF] = useState<F>(() => fromTx(existing, initialMode));
  const set = (k: keyof F) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const platforms = useMemo(() => [...new Set(['Coinbase', 'Binance', 'Kraken', 'Ledger', ...data.txs.map((t) => t.platform)])], [data.txs]);
  const coins = useMemo(() => searchCoins('').map((c) => c.symbol), []);

  const q = parseNum(f.qty), amt = parseNum(f.amount), fee = f.fee ? parseNum(f.fee) : 0, inQ = parseNum(f.inQty), usd = f.usd ? parseNum(f.usd) : NaN;
  const feeQ = f.feeQty ? parseNum(f.feeQty) : 0;
  const recv = f.recv ? parseNum(f.recv) : q;
  const asset = normSymbol(f.asset), inAsset = normSymbol(f.inAsset);
  const okDate = /^\d{4}-\d{2}-\d{2}$/.test(f.date) && /^\d{2}:\d{2}$/.test(f.time);
  const errs: string[] = [];
  if (!asset) errs.push('crypto');
  if (!(q > 0)) errs.push('quantité');
  if ((mode === 'buy' || mode === 'sell') && !(amt > 0)) errs.push('montant');
  if ((mode === 'buy' || mode === 'sell') && !(fee >= 0)) errs.push('frais');
  if (mode === 'swap' && (!inAsset || !(inQ > 0))) errs.push('crypto reçue');
  if (mode === 'transfer' && (!f.platform.trim() || !f.to.trim() || !(recv > 0) || recv > q)) errs.push('plateformes');
  if (f.usd && !(usd >= 0)) errs.push('valeur');
  if (!okDate) errs.push('date');
  if (asset && isFiat(asset)) errs.push('crypto');
  const valid = !errs.length;

  const save = () => {
    if (!valid) return;
    const date = new Date(`${f.date}T${f.time}:00`).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const platform = f.platform.trim() || 'Autre';
    const base = { date, platform, note: f.note.trim() || undefined, src: existing?.src || 'manual', key: existing?.key };
    const L = (a: string, n: number): Leg => ({ asset: a, qty: n });
    const id = existing?.id || newId('tx');
    let tx: Tx | null = null;
    const usdOpt = isFinite(usd) ? usd : undefined;
    if (mode === 'buy') tx = { ...base, id, kind: 'trade', inLeg: L(asset, q), outLeg: L(f.cur, amt), fee: fee > 0 ? L(f.cur, fee) : undefined, usd: f.cur === 'USD' ? amt : undefined };
    if (mode === 'sell') tx = { ...base, id, kind: 'trade', outLeg: L(asset, q), inLeg: L(f.cur, amt), fee: fee > 0 ? L(f.cur, fee) : undefined, usd: f.cur === 'USD' ? amt : undefined };
    if (mode === 'swap') tx = { ...base, id, kind: 'trade', outLeg: L(asset, q), inLeg: L(inAsset, inQ), usd: usdOpt, fee: f.feeAsset && feeQ > 0 ? L(normSymbol(f.feeAsset), feeQ) : undefined };
    if (mode === 'income') tx = { ...base, id, kind: 'income', inLeg: L(asset, q), usd: usdOpt, incomeType: f.incomeType };
    if (mode === 'transfer_in') tx = { ...base, id, kind: 'transfer_in', inLeg: L(asset, q), usd: usdOpt };
    if (mode === 'transfer_out') tx = { ...base, id, kind: 'transfer_out', outLeg: L(asset, q) };
    if (mode === 'transfer') {
      const later = new Date(Date.parse(date) + 60e3).toISOString().replace(/\.\d{3}Z$/, 'Z');
      saveTx({ ...base, id: newId('tx'), kind: 'transfer_out', outLeg: L(asset, q), key: undefined });
      saveTx({ ...base, id: newId('tx'), date: later, platform: f.to.trim(), kind: 'transfer_in', inLeg: L(asset, recv), key: undefined });
      showToast('Transfert enregistré');
      back('/historique/journal');
      return;
    }
    if (tx) { saveTx(tx); showToast(existing ? 'Opération modifiée' : 'Opération enregistrée'); back('/historique/journal'); }
  };

  const unit = (mode === 'buy' || mode === 'sell') && q > 0 && amt > 0 ? amt / q : NaN;
  const changeable = !existing || ['buy', 'sell', 'swap'].includes(mode);
  const modes: [Mode, string][] = existing ? (changeable ? [['buy', 'Achat'], ['sell', 'Vente'], ['swap', 'Échange']] : []) : [['buy', 'Achat'], ['sell', 'Vente'], ['swap', 'Échange'], ['income', 'Revenu'], ['transfer', 'Transfert']];

  return (
    <div className="screen screen-white" data-screen="saisie">
      <SubHeader title={(existing ? 'Modifier · ' : '') + TITLES[mode]} fallback="/historique/journal" close bordered />
      <main className="content form-narrow" style={{ paddingBottom: 'calc(var(--safe-bottom) + 120px)' }}>
        {modes.length > 0 && <Segmented label="Type d'opération" value={mode} onChange={(m) => { setMode(m); }} options={modes} />}
        <datalist id="dl-coins">{coins.map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="dl-plats">{platforms.map((p) => <option key={p} value={p} />)}</datalist>

        <div className="grid-2">
          <label className="field"><span className="lbl">Date</span><input className="input" type="date" value={f.date} max={localParts().date} onChange={set('date')} /></label>
          <label className="field"><span className="lbl">Heure</span><input className="input" type="time" value={f.time} onChange={set('time')} /></label>
        </div>
        <label className="field"><span className="lbl">{mode === 'transfer' ? 'Depuis (plateforme ou portefeuille)' : 'Plateforme'}</span><input className="input" list="dl-plats" value={f.platform} onChange={set('platform')} placeholder="Coinbase, Binance, Ledger…" /></label>
        {mode === 'transfer' && <label className="field"><span className="lbl">Vers</span><input className="input" list="dl-plats" value={f.to} onChange={set('to')} placeholder="Ledger" /></label>}

        <div className="grid-2">
          <label className="field"><span className="lbl">{mode === 'swap' ? 'Crypto donnée' : 'Crypto'}</span><input className="input" list="dl-coins" value={f.asset} onChange={set('asset')} placeholder="BTC" autoCapitalize="characters" /></label>
          <label className="field"><span className="lbl">{mode === 'sell' || mode === 'swap' || mode === 'transfer' || mode === 'transfer_out' ? 'Quantité donnée' : 'Quantité reçue'}</span><input className="input num" inputMode="decimal" value={f.qty} onChange={set('qty')} placeholder="0,01" /></label>
        </div>

        {(mode === 'buy' || mode === 'sell') && (
          <>
            <div className="grid-2">
              <label className="field"><span className="lbl">{mode === 'buy' ? 'Montant payé (hors frais)' : 'Montant reçu (avant frais)'}</span><input className="input num" inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="100" /></label>
              <label className="field"><span className="lbl">Devise</span>
                <select className="input" value={f.cur} onChange={set('cur')}>{[...new Set([...CURRENCIES, f.cur])].map((c) => <option key={c} value={c}>{c}</option>)}</select>
              </label>
            </div>
            <label className="field"><span className="lbl">Frais ({f.cur})</span><input className="input num" inputMode="decimal" value={f.fee} onChange={set('fee')} placeholder="0" /></label>
          </>
        )}

        {mode === 'swap' && (
          <>
            <div className="grid-2">
              <label className="field"><span className="lbl">Crypto reçue</span><input className="input" list="dl-coins" value={f.inAsset} onChange={set('inAsset')} placeholder="ETH" autoCapitalize="characters" /></label>
              <label className="field"><span className="lbl">Quantité reçue</span><input className="input num" inputMode="decimal" value={f.inQty} onChange={set('inQty')} /></label>
            </div>
            <label className="field"><span className="lbl">Valeur de l’échange en $ (facultatif)</span><input className="input num" inputMode="decimal" value={f.usd} onChange={set('usd')} /><span className="hint">Sans valeur, le coût de la crypto donnée est reporté sur la crypto reçue (aucune plus-value constatée).</span></label>
            <div className="grid-2">
              <label className="field"><span className="lbl">Frais : actif</span><input className="input" list="dl-coins" value={f.feeAsset} onChange={set('feeAsset')} placeholder="BNB" /></label>
              <label className="field"><span className="lbl">Frais : quantité</span><input className="input num" inputMode="decimal" value={f.feeQty} onChange={set('feeQty')} /></label>
            </div>
          </>
        )}

        {mode === 'income' && (
          <>
            <label className="field"><span className="lbl">Type</span>
              <select className="input" value={f.incomeType} onChange={set('incomeType')}>
                <option value="staking">Staking</option><option value="reward">Récompense</option><option value="airdrop">Airdrop</option><option value="interest">Intérêts</option><option value="other">Autre</option>
              </select>
            </label>
            <label className="field"><span className="lbl">Valeur à la réception en $ (facultatif)</span><input className="input num" inputMode="decimal" value={f.usd} onChange={set('usd')} /><span className="hint">Devient le coût de revient de ces jetons ; 0 si vide.</span></label>
          </>
        )}
        {mode === 'transfer' && (
          <label className="field"><span className="lbl">Quantité reçue à l’arrivée</span><input className="input num" inputMode="decimal" value={f.recv} onChange={set('recv')} placeholder={f.qty || 'identique'} /><span className="hint">L’écart éventuel correspond aux frais de réseau.</span></label>
        )}
        {mode === 'transfer_in' && (
          <label className="field"><span className="lbl">Valeur à la réception en $ (facultatif)</span><input className="input num" inputMode="decimal" value={f.usd} onChange={set('usd')} /><span className="hint">Utilisée comme coût si aucun envoi correspondant n’est trouvé.</span></label>
        )}

        <label className="field"><span className="lbl">Note (facultatif)</span><input className="input" value={f.note} onChange={set('note')} /></label>

        {isFinite(unit) && (
          <div className="calc-box" aria-live="polite">
            <span className="between"><span className="c-neutral">Prix unitaire</span><span className="t-amount-s">{f.cur === 'USD' ? price(unit) : num(unit, 2, 6) + ' ' + f.cur}</span></span>
            <span className="between"><span className="c-neutral">{mode === 'buy' ? 'Total débité' : 'Total reçu'}</span><span className="t-amount-s">{num(mode === 'buy' ? amt + fee : amt - fee, 2)} {f.cur}</span></span>
          </div>
        )}
        <button type="button" className="btn btn-primary block" style={{ minHeight: 48 }} disabled={!valid} onClick={save}>
          <Icon name="check" size={20} />{existing ? 'Enregistrer les modifications' : 'Enregistrer'}
        </button>
        {!valid && (f.qty || f.asset) && <p className="t-caption c-moderate center">À compléter : {[...new Set(errs)].join(', ')}</p>}
      </main>
    </div>
  );
}
