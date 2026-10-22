// Modèle de données de CryptoAnalyze. On ne stocke que des FAITS (opérations) ;
// positions, PRU, plus-values et séries sont toujours recalculés (domain/calc.ts).

/** Une jambe d'opération : un actif et une quantité (toujours positive). */
export interface Leg {
  asset: string; // symbole en majuscules : BTC, ETH, USDC, USD, EUR…
  qty: number;
}

/**
 * trade        : échange d'un actif contre un autre (achat, vente, conversion crypto ↔ crypto)
 * income       : revenu reçu (staking, récompense, airdrop, intérêts…)
 * transfer_in  : crypto reçue d'un autre portefeuille / d'une autre plateforme
 * transfer_out : crypto envoyée vers un autre portefeuille / une autre plateforme
 * cash_in / cash_out : dépôt / retrait de monnaie (USD, EUR…) sur une plateforme (affichage seulement)
 * fee          : frais isolé (non rattaché à une opération)
 */
export type TxKind = 'trade' | 'income' | 'transfer_in' | 'transfer_out' | 'cash_in' | 'cash_out' | 'fee';

export type IncomeType = 'staking' | 'reward' | 'airdrop' | 'interest' | 'other';

export interface Tx {
  id: string;
  /** Date et heure UTC, ISO 8601 : '2026-03-02T14:05:00Z' */
  date: string;
  kind: TxKind;
  /** Ce qui est reçu (trade, income, transfer_in, cash_in) */
  inLeg?: Leg;
  /** Ce qui est donné (trade, transfer_out, cash_out) */
  outLeg?: Leg;
  /** Frais, dans n'importe quel actif */
  fee?: Leg;
  /** Valeur brute de l'opération en USD (hors frais), quand l'export la donne */
  usd?: number;
  /** Valeur des frais en USD, quand l'export la donne */
  feeUsd?: number;
  platform: string;
  incomeType?: IncomeType;
  note?: string;
  /** Origine : 'coinbase', 'binance', 'csv', 'manual' */
  src?: string;
  /** Empreinte d'import (évite les doublons quand on réimporte un fichier qui chevauche) */
  key?: string;
}

export interface ImportLog {
  id: string;
  at: string; // date de l'import (ISO)
  file: string;
  platform: string;
  added: number;
  skipped: number;
}

export interface Settings {
  hideSmall: boolean;
  smallThreshold: number; // USD
  /** Simulateur DCA */
  dcaCoin: string;
  dcaAmount: number;
  dcaMonths: number;
  /** Projection */
  projMonthly: number;
  projYears: number;
  projRate: number;
}

export interface AppData {
  version: number;
  updatedAt: string;
  txs: Tx[];
  /** Correspondances symbole → identifiant CoinGecko choisies par l'utilisateur */
  coinIds: Record<string, string>;
  /** Cryptos suivies dans Marchés sans en détenir */
  watch: string[];
  /** Taux de change : devise → { 'AAAA-MM-JJ': USD pour 1 unité } (BCE, via Frankfurter) */
  fx: Record<string, Record<string, number>>;
  imports: ImportLog[];
  settings: Settings;
}

// ------------------------------------------------------------------ résultats de calcul

export interface Position {
  asset: string;
  qty: number;
  cost: number; // coût de revient restant (USD)
  pru: number; // prix de revient unitaire moyen
  price: number | null; // cours actuel (USD) ; null si inconnu
  value: number; // valeur actuelle (0 si cours inconnu)
  unrealized: number;
  unrealizedPct: number;
  realized: number; // plus-value réalisée cumulée (USD)
  income: number; // revenus reçus (valeur USD à la réception)
  fees: number; // frais payés liés à cet actif (USD)
  change24h: number | null; // variation 24 h (ratio)
  weight: number; // poids dans la valeur totale
  platforms: Record<string, number>;
  firstDate: string;
  txCount: number;
  stable: boolean;
  /** Une partie du coût n'a pas pu être déterminée (transfert entrant sans prix, échange sans valeur) */
  costEstimated: boolean;
}

export interface Summary {
  value: number;
  capital: number; // capital net engagé (USD)
  fiatSpent: number; // monnaie dépensée en achats (frais compris)
  fiatReceived: number; // monnaie reçue des ventes (frais déduits)
  costBasis: number; // coût de revient des positions détenues
  unrealized: number;
  realized: number;
  income: number;
  fees: number;
  gain: number; // valeur − capital
  gainPct: number; // gain ÷ capital
  change24h: number; // variation 24 h en USD
  change24hPct: number;
  assets: number; // nombre d'actifs détenus (hors poussières)
  txCount: number;
  firstDate: string;
  unmatchedIn: number; // coût attribué aux transferts entrants non rapprochés
  unmatchedOut: number; // coût sorti vers des portefeuilles non suivis
  missingPrices: string[];
  warnings: string[];
  xirr: number | null;
}
