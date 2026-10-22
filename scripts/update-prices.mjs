// Robot des cours (GitHub Actions) : top 250 CoinGecko en UN appel → prices.json publié avec le site.
// Usage : node scripts/update-prices.mjs dist/prices.json
// Clé facultative (gratuite, offre « Demo ») dans le secret de dépôt COINGECKO_API_KEY : jamais dans le code.
import { writeFileSync } from 'node:fs';

const out = process.argv[2] || 'dist/prices.json';
const key = process.env.COINGECKO_API_KEY || '';
const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=true&price_change_percentage=24h,7d';

async function get(tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { headers: key ? { 'x-cg-demo-api-key': key } : {} });
      if (r.ok) return await r.json();
      console.warn(`CoinGecko HTTP ${r.status} (essai ${i})`);
    } catch (e) {
      console.warn(`CoinGecko : ${e.message} (essai ${i})`);
    }
    await new Promise((res) => setTimeout(res, 20000 * i));
  }
  throw new Error('CoinGecko injoignable');
}

const round = (v) => (typeof v === 'number' && isFinite(v) ? Number(v.toPrecision(8)) : null);
const list = await get();
const coins = list.filter((c) => c && c.id && typeof c.current_price === 'number').map((c) => {
  const sp = c.sparkline_in_7d?.price || [];
  const step = Math.max(1, Math.round(sp.length / 42)); // ~ un point toutes les 4 h
  return {
    id: c.id,
    symbol: String(c.symbol).toUpperCase(),
    name: c.name,
    rank: c.market_cap_rank ?? null,
    usd: round(c.current_price),
    ch24: c.price_change_percentage_24h_in_currency != null ? round(c.price_change_percentage_24h_in_currency / 100) : null,
    ch7d: c.price_change_percentage_7d_in_currency != null ? round(c.price_change_percentage_7d_in_currency / 100) : null,
    spark: sp.filter((_, i) => i % step === 0 || i === sp.length - 1).map(round),
  };
});
if (coins.length < 50) throw new Error(`Réponse incomplète (${coins.length} cryptos)`);
writeFileSync(out, JSON.stringify({ updatedAt: new Date().toISOString(), source: 'CoinGecko', coins }));
console.log(`${coins.length} cours écrits dans ${out}`);
