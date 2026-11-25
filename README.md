# TempoSimulateur

Simulateur EDF **Tempo / Heures Creuses-Heures Pleines / Base**, 100 % dans le navigateur.
Importez votre export d'index EDF (`mes-index-elec-….csv`, et facultativement `ma-puissance-max-….csv`) :
le coût de votre consommation est calculé pour chaque offre avec les grilles tarifaires EDF historiques
(depuis 2022), puis comparé dans un récapitulatif et un graphique (par année, mois ou jour).

Sous le titre de la vue, la carte du graphique affiche le **total de chaque offre pour la plage réellement affichée** (période sélectionnée, année ou mois détaillé), avec l'offre la moins chère.

Dans le bloc Période, trois raccourcis (**Toute la période importée**, **Dernière année**, **2 dernières années**) fixent les dates en se terminant au dernier jour valorisé de vos données ; le bouton correspondant à la période appliquée est mis en évidence.

En bas de page, la carte **Tarifs appliqués** liste les prix EDF réellement utilisés (abonnement et prix du kWh par offre, pour chaque grille couvrant la période) avec leur source, la grille complète de toutes les puissances (repliée par défaut) et les taxes (accise/CSPE, TVA, CTA) et majorations (€ par an HT) imprimées dans chaque grille EDF depuis 2022.

## Confidentialité

Aucune donnée n'est envoyée, stockée ou mémorisée : le fichier est lu localement, rien n'est écrit dans
le navigateur (ni cookie, ni stockage web), et la page ne fait aucune requête réseau en dehors de ses
propres fichiers statiques. Ni police externe, ni CDN, ni statistiques.

## Construire

Prérequis : Node >= 20.

```
npm install
npm run build   # produit dist/ : index.html, app.js, app.css, favicon.svg, _headers
npm test        # construit puis exécute les vérifications (données, calculs, graphique, API interdites, dist)
npm run lint    # tsc --noEmit
```

Vérifications optionnelles sur des données de démonstration **synthétiques** (committées dans `tests/demo-data/`, générées par `scripts/gen-demo-data.mjs`, aucune consommation réelle) :

```sh
TEMPO_DEMO_DATA=1 npm test                # import, prix, graphique et calendrier sur tests/demo-data/*.csv
node scripts/gen-demo-data.mjs            # régénère les deux fichiers de démo (déterministe)
TEMPO_PDF_DIR=/chemin/vers/grilles ...    # dossier des grilles tarifaires PDF publiques (TEMPO_DATA_DIR : dossier parent contenant grilles/)
```

Les deux fichiers de `tests/demo-data/` peuvent aussi être glissés dans le simulateur pour l'essayer. Sans `TEMPO_DEMO_DATA`, ces vérifications affichent `skip: set TEMPO_DEMO_DATA=1`.

## Déployer

Servez le contenu de `dist/` tel quel (site statique, HTTPS recommandé).

- Le `index.html` embarque une CSP en `<meta>` (première balise du `<head>`) :
  `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; require-trusted-types-for 'script'`
  (pas de `connect-src` : aucune connexion n'est autorisée, pas de script ni de style en ligne ; Trusted Types
  est exigé car le code n'utilise aucun point d'injection HTML/script par chaîne), ainsi que
  `<meta name="referrer" content="no-referrer">`.
- La balise `<meta>` ne peut pas exprimer `frame-ancestors`, ni `nosniff`, ni les autres en-têtes : il faut de
  **vrais en-têtes HTTP**. Source unique : `scripts/policy.mjs` (le build génère `dist/index.html`,
  `dist/_headers` et `nginx.conf.snippet` ; `npm test` vérifie leur cohérence).
  - Netlify / Cloudflare Pages : le fichier `dist/_headers` est déjà prêt.
  - nginx : incluez `nginx.conf.snippet` (généré) dans le bloc `server`/`location` qui sert `dist/`
    (il désactive `autoindex` et limite les méthodes à GET/HEAD).
  - Autre serveur : reproduire `Content-Security-Policy: <CSP ci-dessus>; frame-ancestors 'none'`,
    `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
    `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`,
    `Cross-Origin-Opener-Policy: same-origin`, `X-Frame-Options: DENY`, `Cache-Control: no-cache`,
    et ne servir que GET/HEAD sans listing de répertoire.

## Hypothèses

- Simulation indicative, sans valeur contractuelle ; heures creuses supposées de 22 h à 6 h.
- Sur une période en HC/HP, le coût Tempo est une estimation (couleur du calendrier Tempo intégré).
- Les jours de changement de contrat sont exclus ; les jours de trous de relevé sont estimés (répartis).
- Puissance souscrite : déduite de la puissance max (« au moins »), sinon 6 kVA par défaut (à vérifier), ou choisie.
- Au-delà de la dernière grille connue, la dernière grille est réutilisée.
- Jour par jour n'est proposé que pour une période de 400 jours au plus.

Le détail des hypothèses applicables à votre fichier est affiché dans la page.
