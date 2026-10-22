// Référentiel des actifs : monnaies, stablecoins et catalogue intégré (identifiants CoinGecko).
// Le catalogue complet (top 250, cours, variations) est mis à jour par le robot dans public/prices.json ;
// cette liste intégrée sert de secours hors ligne et pour reconnaître les symboles à l'import.

export const FIAT = new Set(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'TRY', 'BRL', 'MXN', 'ZAR', 'SGD', 'HKD', 'KRW', 'INR', 'IDR', 'PHP', 'THB', 'ILS', 'CNY', 'ISK']);

/** Stablecoins indexés sur le dollar : 1 unité ≈ 1 USD pour valoriser une opération. */
export const USD_STABLES = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'DAI', 'TUSD', 'USDP', 'PYUSD', 'USDE', 'GUSD', 'USDS', 'USD1', 'RLUSD', 'USDD', 'FRAX', 'LUSD']);

export function isFiat(a: string): boolean {
  return FIAT.has(a);
}
export function isUsdStable(a: string): boolean {
  return USD_STABLES.has(a);
}
/** Actif à valeur stable (monnaie ou stablecoin) : sert de « monnaie » dans les échanges. */
export function isCashLike(a: string): boolean {
  return a === 'USD' || isFiat(a) || isUsdStable(a);
}

export interface CoinInfo {
  id: string; // identifiant CoinGecko
  symbol: string;
  name: string;
}

/** Top cryptos par capitalisation (identifiants CoinGecko), dans l'ordre : en cas de symbole ambigu, le premier gagne. */
export const BUILTIN_COINS: CoinInfo[] = [
  ['bitcoin', 'BTC', 'Bitcoin'], ['ethereum', 'ETH', 'Ethereum'], ['tether', 'USDT', 'Tether'], ['ripple', 'XRP', 'XRP'],
  ['binancecoin', 'BNB', 'BNB'], ['solana', 'SOL', 'Solana'], ['usd-coin', 'USDC', 'USDC'], ['dogecoin', 'DOGE', 'Dogecoin'],
  ['tron', 'TRX', 'TRON'], ['cardano', 'ADA', 'Cardano'], ['staked-ether', 'STETH', 'Lido Staked Ether'], ['wrapped-bitcoin', 'WBTC', 'Wrapped Bitcoin'],
  ['hyperliquid', 'HYPE', 'Hyperliquid'], ['sui', 'SUI', 'Sui'], ['chainlink', 'LINK', 'Chainlink'], ['stellar', 'XLM', 'Stellar'],
  ['avalanche-2', 'AVAX', 'Avalanche'], ['bitcoin-cash', 'BCH', 'Bitcoin Cash'], ['hedera-hashgraph', 'HBAR', 'Hedera'], ['litecoin', 'LTC', 'Litecoin'],
  ['the-open-network', 'TON', 'Toncoin'], ['shiba-inu', 'SHIB', 'Shiba Inu'], ['leo-token', 'LEO', 'LEO Token'], ['polkadot', 'DOT', 'Polkadot'],
  ['monero', 'XMR', 'Monero'], ['ethena-usde', 'USDE', 'Ethena USDe'], ['dai', 'DAI', 'Dai'], ['uniswap', 'UNI', 'Uniswap'],
  ['pepe', 'PEPE', 'Pepe'], ['bitget-token', 'BGB', 'Bitget Token'], ['aave', 'AAVE', 'Aave'], ['near', 'NEAR', 'NEAR Protocol'],
  ['aptos', 'APT', 'Aptos'], ['internet-computer', 'ICP', 'Internet Computer'], ['ethereum-classic', 'ETC', 'Ethereum Classic'], ['ondo-finance', 'ONDO', 'Ondo'],
  ['crypto-com-chain', 'CRO', 'Cronos'], ['mantle', 'MNT', 'Mantle'], ['polygon-ecosystem-token', 'POL', 'POL (ex-MATIC)'], ['matic-network', 'MATIC', 'Polygon (MATIC)'],
  ['bittensor', 'TAO', 'Bittensor'], ['vechain', 'VET', 'VeChain'], ['render-token', 'RENDER', 'Render'], ['arbitrum', 'ARB', 'Arbitrum'],
  ['cosmos', 'ATOM', 'Cosmos Hub'], ['algorand', 'ALGO', 'Algorand'], ['filecoin', 'FIL', 'Filecoin'], ['kaspa', 'KAS', 'Kaspa'],
  ['official-trump', 'TRUMP', 'Official Trump'], ['first-digital-usd', 'FDUSD', 'First Digital USD'], ['okb', 'OKB', 'OKB'], ['optimism', 'OP', 'Optimism'],
  ['injective-protocol', 'INJ', 'Injective'], ['immutable-x', 'IMX', 'Immutable'], ['fetch-ai', 'FET', 'Artificial Superintelligence Alliance'],
  ['bonk', 'BONK', 'Bonk'], ['sei-network', 'SEI', 'Sei'], ['the-graph', 'GRT', 'The Graph'], ['jupiter-exchange-solana', 'JUP', 'Jupiter'],
  ['worldcoin-wld', 'WLD', 'Worldcoin'], ['tezos', 'XTZ', 'Tezos'], ['quant-network', 'QNT', 'Quant'], ['theta-token', 'THETA', 'Theta Network'],
  ['the-sandbox', 'SAND', 'The Sandbox'], ['decentraland', 'MANA', 'Decentraland'], ['axie-infinity', 'AXS', 'Axie Infinity'], ['elrond-erd-2', 'EGLD', 'MultiversX'],
  ['flow', 'FLOW', 'Flow'], ['eos', 'EOS', 'EOS'], ['maker', 'MKR', 'Maker'], ['lido-dao', 'LDO', 'Lido DAO'],
  ['curve-dao-token', 'CRV', 'Curve DAO'], ['pancakeswap-token', 'CAKE', 'PancakeSwap'], ['gala', 'GALA', 'GALA'], ['dogwifcoin', 'WIF', 'dogwifhat'],
  ['floki', 'FLOKI', 'FLOKI'], ['true-usd', 'TUSD', 'TrueUSD'], ['paypal-usd', 'PYUSD', 'PayPal USD'], ['paxos-standard', 'USDP', 'Pax Dollar'],
  ['binance-usd', 'BUSD', 'Binance USD'], ['gemini-dollar', 'GUSD', 'Gemini Dollar'], ['usds', 'USDS', 'USDS'], ['euro-coin', 'EURC', 'EURC'],
  ['chiliz', 'CHZ', 'Chiliz'], ['iota', 'IOTA', 'IOTA'], ['neo', 'NEO', 'NEO'], ['zcash', 'ZEC', 'Zcash'],
  ['dash', 'DASH', 'Dash'], ['kava', 'KAVA', 'Kava'], ['1inch', '1INCH', '1inch'], ['compound-governance-token', 'COMP', 'Compound'],
  ['synthetix-network-token', 'SNX', 'Synthetix'], ['basic-attention-token', 'BAT', 'Basic Attention'], ['enjincoin', 'ENJ', 'Enjin Coin'], ['zilliqa', 'ZIL', 'Zilliqa'],
  ['loopring', 'LRC', 'Loopring'], ['yearn-finance', 'YFI', 'yearn.finance'], ['sushi', 'SUSHI', 'Sushi'], ['ankr', 'ANKR', 'Ankr'],
  ['ocean-protocol', 'OCEAN', 'Ocean Protocol'], ['celestia', 'TIA', 'Celestia'], ['pyth-network', 'PYTH', 'Pyth Network'], ['starknet', 'STRK', 'Starknet'],
  ['ethena', 'ENA', 'Ethena'], ['pendle', 'PENDLE', 'Pendle'], ['jasmycoin', 'JASMY', 'JasmyCoin'], ['raydium', 'RAY', 'Raydium'],
  ['helium', 'HNT', 'Helium'], ['ronin', 'RON', 'Ronin'], ['arweave', 'AR', 'Arweave'], ['xdce-crowd-sale', 'XDC', 'XDC Network'],
  ['blockstack', 'STX', 'Stacks'], ['mina-protocol', 'MINA', 'Mina'], ['conflux-token', 'CFX', 'Conflux'], ['akash-network', 'AKT', 'Akash Network'],
  ['notcoin', 'NOT', 'Notcoin'], ['ethereum-name-service', 'ENS', 'Ethereum Name Service'], ['apecoin', 'APE', 'ApeCoin'], ['blur', 'BLUR', 'Blur'],
  ['dydx-chain', 'DYDX', 'dYdX'], ['wormhole', 'W', 'Wormhole'], ['ethereum-pow-iou', 'ETHW', 'EthereumPoW'], ['coinbase-wrapped-staked-eth', 'CBETH', 'Coinbase Wrapped Staked ETH'],
  ['coinbase-wrapped-btc', 'CBBTC', 'Coinbase Wrapped BTC'], ['rocket-pool-eth', 'RETH', 'Rocket Pool ETH'], ['wrapped-beacon-eth', 'WBETH', 'Wrapped Beacon ETH'], ['binance-eth', 'BETH', 'Binance ETH staking'],
  ['bitcoin-cash-sv', 'BSV', 'Bitcoin SV'], ['amp-token', 'AMP', 'Amp'], ['skale', 'SKL', 'SKALE'], ['storj', 'STORJ', 'Storj'],
  ['gnosis', 'GNO', 'Gnosis'], ['oasis-network', 'ROSE', 'Oasis'], ['harmony', 'ONE', 'Harmony'], ['qtum', 'QTUM', 'Qtum'],
  ['nervos-network', 'CKB', 'Nervos Network'], ['trust-wallet-token', 'TWT', 'Trust Wallet'], ['vethor-token', 'VTHO', 'VeThor'], ['wrapped-solana', 'WSOL', 'Wrapped SOL'],
  ['ethereum-wormhole', 'WETH', 'Wrapped Ether'], ['virtual-protocol', 'VIRTUAL', 'Virtuals Protocol'], ['berachain-bera', 'BERA', 'Berachain'], ['movement', 'MOVE', 'Movement'],
  ['space-and-time', 'SXT', 'Space and Time'], ['pixels', 'PIXEL', 'Pixels'], ['multiversx', 'EGLD', 'MultiversX (nouvel identifiant)'], ['pudgy-penguins', 'PENGU', 'Pudgy Penguins'], ['ai16z', 'AI16Z', 'ai16z'], ['fartcoin', 'FARTCOIN', 'Fartcoin'], ['story-2', 'IP', 'Story'],
].map(([id, symbol, name]) => ({ id, symbol, name }));

/** Synonymes utilisés par certaines plateformes. */
export const SYMBOL_ALIASES: Record<string, string> = {
  XBT: 'BTC', XXBT: 'BTC', XETH: 'ETH', XXRP: 'XRP', XXDG: 'DOGE', XDG: 'DOGE', ZUSD: 'USD', ZEUR: 'EUR', ETH2: 'ETH', 'ETH2.S': 'ETH', CGLD: 'CELO', RNDR: 'RENDER', MATIC: 'MATIC',
};

export function normSymbol(s: string): string {
  const u = String(s || '').trim().toUpperCase();
  return SYMBOL_ALIASES[u] ?? u;
}
