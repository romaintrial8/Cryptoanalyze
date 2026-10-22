// Couleur fixe et pastille de chaque crypto (même couleur partout : donut, courbes, listes).
import type { CSSProperties } from 'react';

/** Cryptos qui ont une couleur dédiée dans tokens.css (--coin-XXX). */
const DEDICATED = new Set(['BTC', 'ETH', 'SOL', 'USDC', 'USDT', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'LINK', 'POL', 'MATIC', 'LTC', 'TRX', 'SHIB', 'ATOM', 'XLM', 'NEAR', 'UNI', 'ARB', 'OP', 'SUI', 'TON', 'PEPE', 'DAI', 'BCH', 'ETC', 'HBAR', 'APT', 'FDUSD']);

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Couleur CSS d'une crypto : couleur dédiée, sinon une des 8 couleurs de la palette (stable pour un symbole donné). */
export function coinColor(symbol: string): string {
  if (DEDICATED.has(symbol)) return `var(--coin-${symbol})`;
  return `var(--chart-${(hash(symbol) % 8) + 1})`;
}

export function CoinDot({ symbol, size = 12, style }: { symbol: string; size?: number; style?: CSSProperties }) {
  return <span className="dot" aria-hidden="true" style={{ width: size, height: size, background: coinColor(symbol), ...style }} />;
}

/** Pastille ronde avec le symbole (pas de logo externe : aucune image tierce à charger ni à licencier). */
export function CoinAvatar({ symbol, size = 40 }: { symbol: string; size?: number }) {
  const label = symbol.length > 4 ? symbol.slice(0, 4) : symbol;
  const fs = label.length <= 3 ? size * 0.3 : size * 0.25;
  return (
    <span aria-hidden="true" className="coin-avatar" style={{ width: size, height: size, background: coinColor(symbol), fontSize: fs }}>
      {label}
    </span>
  );
}
