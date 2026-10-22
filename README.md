# CryptoAnalyze

Application personnelle de suivi de portefeuille crypto, construite sur l'architecture de PEAnalyze : 100 % côté client, PWA installable, gratuite, sans serveur.

- **Import des exports bruts** : Coinbase (historique des transactions, anciens et nouveaux formats, Advanced Trade), Binance (relevé complet CSV/ZIP, historique des trades Excel), Kraken (ledgers), CSV générique pour tout le reste. Doublons ignorés au réimport.
- **Calculs en USD** : positions par crypto et par plateforme, PRU moyen pondéré frais inclus, plus-values latentes et réalisées, échanges crypto ↔ crypto, revenus de staking, frais, transferts entre plateformes rapprochés automatiquement, TRI. Opérations en euros converties au taux BCE du jour.
- **Écrans** : Portefeuille (synthèse, répartition, performance), Historique (vue d'ensemble, journal filtrable, saisie/modification), Marchés (mes cryptos, catalogue top 250, fiche avec courbe, PRU et achats), Simulateur (DCA rejoué sur les vrais cours, projection), Paramètres.
- **Cours** : robot GitHub Actions (top 250 CoinGecko toutes les 2 h, publié avec le site) + appel direct à l'API publique CoinGecko pour les cryptos détenues et leurs historiques.
- **Données** : stockage local, export CSV et sauvegarde JSON ; synchronisation Google optionnelle (Firebase Spark).

**Mise en ligne : voir [`docs/GUIDE_MISE_EN_LIGNE.md`](docs/GUIDE_MISE_EN_LIGNE.md).**

## Structure
| Dossier | Contenu |
|---|---|
| `src/domain/` | Logique pure testée : `calc.ts` (moteur PRU / plus-values / transferts / TRI / séries), `importers.ts` (lecture des exports), `exporters.ts`, `sim.ts`, `assets.ts`, `format.ts` |
| `src/data/` | Stockage local, cours (`prices.ts`), taux de change (`fx.ts`), lecture CSV/Excel/ZIP (`files.ts`), actions, synchronisation Firebase |
| `src/ui/` | Kit de composants, graphiques SVG maison, icônes, routeur par hash |
| `src/screens/` | Un fichier par onglet |
| `src/styles/` | `tokens.css` (charte : changer de couleurs = éditer ce fichier) et `app.css` |
| `tests/` | 25 tests chiffrés (`npm test`) + fichiers d'export d'exemple dans `tests/fixtures/` |
| `scripts/` | Build esbuild + service worker, robot des cours, génération des icônes |

## Commandes
- `npm install` puis `npm test`
- `npm run build` → `dist/`
- `npm run dev` → http://127.0.0.1:5173

## Limites connues
- Historique quotidien limité aux 365 derniers jours (API gratuite CoinGecko) ; avant, la courbe utilise les prix de vos propres opérations.
- Binance.US, Bitstack, portefeuilles on-chain : pas de lecteur dédié (utiliser le CSV générique ou envoyer un exemple d'export).
- Suivi indicatif, pas un calcul fiscal (méthode française du prix total d'acquisition non implémentée).
- Aucune clé d'API de plateforme, aucun mot de passe ni phrase de récupération n'est jamais demandé.
