# Mettre CryptoAnalyze en ligne (gratuit, ~15 minutes)

Résultat : une adresse `https://<ton-pseudo>.github.io/cryptoanalyze/` utilisable sur ton téléphone comme une vraie app, et sur ordinateur. Coût : 0 €. Aucune carte bancaire.

---

## Étape 1 — Créer le dépôt GitHub (5 min)

1. Va sur https://github.com et connecte-toi (ou crée un compte gratuit).
2. En haut à droite : **+** › **New repository**.
3. *Repository name* : `cryptoanalyze` · coche **Public** (obligatoire pour GitHub Pages gratuit) · ne coche rien d'autre · **Create repository**.
4. Sur la page du dépôt vide, clique sur **uploading an existing file**.
5. Dézippe `cryptoanalyze.zip` sur ton ordinateur, ouvre le dossier `cryptoanalyze`, sélectionne **tout son contenu** (pas le dossier lui-même) et glisse-le dans la page GitHub.
   - ⚠️ Le dossier `.github` est caché par défaut. Sur Mac : dans le Finder, `Cmd + Maj + .` pour l'afficher. Sur Windows : Explorateur › Affichage › cocher « Éléments masqués ».
   - Vérifie avant de valider que la liste contient bien `.github/workflows/deploy.yml`, `src/`, `public/`, `package.json`.
6. En bas : **Commit changes**.

> Si le dossier `.github` refuse de s'envoyer : après l'envoi du reste, va dans l'onglet **Actions** › **set up a workflow yourself**, nomme le fichier `deploy.yml`, colle le contenu de `.github/workflows/deploy.yml`, puis **Commit changes**.

## Étape 2 — Activer la publication (2 min)

1. Dans le dépôt : **Settings** › **Pages** (menu de gauche).
2. *Build and deployment* › *Source* : choisis **GitHub Actions**.
3. **Settings** › **Actions** › **General** › en bas *Workflow permissions* : **Read and write permissions** › **Save** (nécessaire au petit commit mensuel qui garde le robot actif).
4. Onglet **Actions** › clique sur le workflow « Publier CryptoAnalyze » › **Run workflow** › **Run workflow**.
5. Attends la coche verte (2–3 min). L'adresse de ton app apparaît dans le détail du job *deploy* et dans Settings › Pages.

À partir de là, tout est automatique : le robot rafraîchit les cours du top 250 toutes les 2 heures, et chaque modification du code est testée puis publiée. Un test qui échoue bloque la publication (l'ancienne version reste en ligne).

### Facultatif — clé CoinGecko pour le robot
Sans clé, ça marche. Si un jour le robot échoue pour « limite d'appels » :
1. Crée une clé gratuite « Demo » sur https://www.coingecko.com/en/api (compte gratuit).
2. Dépôt › **Settings** › **Secrets and variables** › **Actions** › **New repository secret** · Name : `COINGECKO_API_KEY` · Secret : ta clé › **Add secret**.
3. Ne colle jamais cette clé dans le code ni dans une conversation.

## Étape 3 (facultative) — Connexion Google et synchronisation téléphone ↔ ordinateur (10 min)

Sans cette étape, l'app fonctionne en mode local : les données restent sur l'appareil où tu as importé tes fichiers (pense à « Sauvegarde complète » dans Paramètres). Avec cette étape, tu retrouves tout sur tous tes appareils.

1. https://console.firebase.google.com › **Ajouter un projet** › nom `cryptoanalyze` › désactive Google Analytics › **Créer**.
2. Menu **Build › Authentication** › **Commencer** › **Google** › **Activer** › choisis ton e-mail d'assistance › **Enregistrer**.
3. **Authentication › Settings › Authorized domains** › **Add domain** › `<ton-pseudo>.github.io` (sans https ni chemin). *Oubli = erreur « auth/unauthorized-domain ».*
4. **Build › Firestore Database** › **Créer une base de données** › mode **production** › région **eur3 (Europe)** ou **nam5 (États-Unis)** › **Activer**.
5. Onglet **Règles** : remplace tout par le contenu du fichier `firestore.rules` du dépôt › **Publier**.
6. Roue dentée › **Paramètres du projet** › *Vos applications* › icône **`</>`** (Web) › surnom `cryptoanalyze` › **Enregistrer l'application**. Copie les valeurs de l'objet `firebaseConfig` affiché.
7. Sur GitHub, ouvre `src/data/firebase-config.ts` › crayon ✏️ › remplis `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId` avec ces valeurs › **Commit changes**. La publication se relance seule.

> La configuration Web Firebase est publique par conception : elle identifie ton projet mais ne donne aucun droit. La protection vient des règles Firestore (chaque compte Google ne lit que ses propres données).

## Étape 4 — Installer l'app sur ton téléphone

- **iPhone** : ouvre l'adresse dans **Safari** › bouton Partager › **Sur l'écran d'accueil**.
- **Android** : ouvre l'adresse dans **Chrome** › menu ⋮ › **Installer l'application**.

## Étape 5 — Importer tes exports

- **Coinbase** (web) : icône du profil › **Rapports** › **Générer un rapport** › *Historique des transactions* › toutes dates › **CSV**.
- **Binance** : Portefeuille › Vue d'ensemble › **Historique des transactions** › Exporter › *Générer tous les relevés* (12 mois max par export : refais-le pour chaque année). Dépose les CSV ou le ZIP tels quels.
  - Note : depuis les États-Unis, c'est **Binance.US** (format d'export différent, pas encore reconnu). Si tu en as besoin, envoie-moi un fichier d'exemple anonymisé.
- Dans l'app : **Importer** › choisis les fichiers › vérifie l'aperçu › **Importer**. Tu peux réimporter des exports qui se chevauchent : les doublons sont ignorés.

## Mettre à jour l'app plus tard

Modifier un fichier sur GitHub (crayon ✏️ › Commit) relance tests + publication. Les téléphones récupèrent la nouvelle version au lancement suivant (rechargement automatique).

## En cas de souci

| Symptôme | Cause probable | Solution |
|---|---|---|
| Croix rouge dans Actions, étape `npm test` | Un test de calcul a échoué | Ouvre le log, l'ancienne version reste en ligne |
| Page 404 sur l'adresse | Pages pas réglé sur « GitHub Actions » | Étape 2.2 puis relancer le workflow |
| « Cours indisponibles » dans l'app | CoinGecko limite les appels du téléphone | Réessayer dans 1 min ; l'app retombe sur le fichier du robot ; clé Demo possible dans Paramètres |
| Une crypto « sans cours » | Symbole ambigu ou jeton rare | Paramètres › Correspondances des symboles |
| `auth/unauthorized-domain` | Domaine non autorisé dans Firebase | Étape 3.3 |
