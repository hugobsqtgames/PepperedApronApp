# Fiches App Store et Google Play

Source unique des textes : [`listings.json`](listings.json) (fr, en, es, de, it). Limites vérifiées :

| Champ | App Store | Google Play |
|---|---|---|
| `name` / `playTitle` | Nom, 30 car. — commence par « PepperedApron » | Titre, 30 car. |
| `subtitle` | Sous-titre, 30 car. | — |
| `keywords` | Mots-clés, 100 car., séparés par des virgules sans espace, sans répéter le nom | — |
| `promotionalText` | Texte promotionnel, 170 car. (modifiable sans nouvelle version) | — |
| `shortDescription` | — | Description courte, 80 car. |
| `description` | Description, 4 000 car. | Description complète, 4 000 car. |
| `screenshots` | Légendes des captures, dans l'ordre | idem |

Le texte ne promet que ce que l'app fait réellement (import TikTok/Instagram limité au contenu public, OCR sur l'appareil, widgets iPhone/iPad, pas d'IA générative, gratuit avec publicité).

## Informations générales

| | |
|---|---|
| Catégorie | Cuisine et boissons (App Store : *Food & Drink*, secondaire *Lifestyle*) ; Play : *Food & Drink* |
| Âge | 4+ / PEGI 3 — aucun contenu généré par d'autres utilisateurs (pas de communauté), publicité |
| Prix | Gratuit, contient des publicités, aucun achat intégré |
| URL d'assistance | `https://pepperedapron.app/<langue>/support/` (FAQ en 5 langues + contact) |
| Politique de confidentialité | `https://pepperedapron.app/<langue>/privacy/` |
| Copyright | © 2026 PepperedApron |

## Visuels

- Icône : générée par `tools/brand` (`apps/mobile/assets/icon.png`, 1024×1024, sans transparence).
- Bannière Google Play 1024×500 : [`assets/feature-graphic-<langue>.png`](assets/) — `node tools/brand/src/store.mjs` pour les régénérer.
- Captures d'écran : à réaliser sur un build de production rempli de données de démonstration (recettes avec photos, semaine planifiée, liste en cours ; importer un fichier de sauvegarde préparé via Réglages → Mes données), mode clair, heure 9:41, batterie pleine.

| Plateforme | Tailles exigées |
|---|---|
| iPhone 6,9″ | 1320×2868 (portrait) — obligatoire |
| iPad 13″ | 2064×2752 (portrait) — obligatoire (l'app supporte l'iPad) |
| Android téléphone | 1080×1920 minimum, 2 à 8 captures |
| Android tablette 7″ et 10″ | recommandé |

Ordre et écran pour chaque légende (`screenshots[i]`) :

1. Accueil (salutation, favoris, catégories photo)
2. Feuille « Partager → PepperedApron » depuis TikTok, puis l'éditeur pré-rempli
3. Planning de la semaine
4. Liste de courses groupée par rayons
5. Recherche « poulet rapide » avec résultats
6. Mode cuisine avec un minuteur + Live Activity sur l'écran verrouillé
7. Réglages → iCloud « À jour » (iPhone et iPad côte à côte)

Ajouter la légende en haut de chaque capture (Fraunces 700, crème sur fond vert forêt `#1F4D3A`) — même charte que la bannière.

## Notes pour la revue Apple / Google

- Aucun compte : le reviewer ouvre l'app et l'utilise directement. Joindre un fichier de sauvegarde de démonstration (Réglages → Mes données → Importer) pour qu'il n'ait pas à créer de contenu.
- Expliquer : l'extension de partage importe le lien et les métadonnées publiques ; aucune IA ; la publicité est désactivée en mode cuisine ; les données restent sur l'appareil et dans l'iCloud de l'utilisateur.
- Pas de connexion tierce, donc pas de Sign in with Apple requis (règle 4.8) ; pas de compte, donc pas d'obligation de suppression de compte (5.1.1(v)) — l'effacement des données reste disponible dans Réglages → Mes données.
