# Fiche App Store

Source unique des textes : [`listings.json`](listings.json) (fr, en). Limites vérifiées :

| Champ | App Store |
|---|---|
| `name` | Nom, 30 car. — commence par « PepperedApron » |
| `subtitle` | Sous-titre, 30 car. |
| `keywords` | Mots-clés, 100 car., séparés par des virgules sans espace, sans répéter le nom |
| `promotionalText` | Texte promotionnel, 170 car. (modifiable sans nouvelle version) |
| `description` | Description, 4 000 car. |
| `screenshots` | Légendes des captures, dans l'ordre |

Le texte ne promet que ce que l'app fait réellement (import TikTok/Instagram limité au contenu public, OCR sur l'appareil, widgets iPhone/iPad, pas d'IA générative, gratuit et sans publicité).

## Informations générales

| | |
|---|---|
| Catégorie | Cuisine et boissons (*Food & Drink*, secondaire *Lifestyle*) |
| Âge | 4+ — aucun contenu généré par d'autres utilisateurs, aucune publicité |
| Prix | Gratuit, sans publicité, aucun achat intégré |
| URL d'assistance | `https://pepperedapron.app/<langue>/support/` (FAQ en français et anglais + contact) |
| Politique de confidentialité | `https://pepperedapron.app/<langue>/privacy/` |
| Copyright | © 2026 PepperedApron |

## Visuels

- Icône : générée par `tools/brand` (`apps/mobile/assets/icon.png`, 1024×1024, sans transparence).
- Captures d'écran : à réaliser sur un build de production rempli de données de démonstration (recettes avec photos, semaine planifiée, liste en cours ; importer un fichier de sauvegarde préparé via Réglages → Mes données), mode clair, heure 9:41, batterie pleine.

| Plateforme | Tailles exigées |
|---|---|
| iPhone 6,9″ | 1320×2868 (portrait) — obligatoire |
| iPad 13″ | 2064×2752 (portrait) — obligatoire (l'app supporte l'iPad) |

Ordre et écran pour chaque légende (`screenshots[i]`) :

1. Accueil (salutation, favoris, catégories photo)
2. Feuille « Partager → PepperedApron » depuis TikTok, puis l'éditeur pré-rempli
3. Planning de la semaine
4. Liste de courses groupée par rayons
5. Recherche « poulet rapide » avec résultats
6. Mode cuisine avec un minuteur + Live Activity sur l'écran verrouillé
7. Réglages → iCloud « À jour » (iPhone et iPad côte à côte)

Ajouter la légende en haut de chaque capture (Fraunces 700, crème sur fond vert forêt `#1F4D3A`) — même charte que la bannière.

## Notes pour la revue Apple

- Aucun compte : le reviewer ouvre l'app et l'utilise directement. Joindre un fichier de sauvegarde de démonstration (Réglages → Mes données → Importer) pour qu'il n'ait pas à créer de contenu.
- Expliquer : l'extension de partage importe le lien et les métadonnées publiques ; aucune IA ; aucune publicité ; les données restent sur l'appareil et dans l'iCloud de l'utilisateur.
- Pas de connexion tierce, donc pas de Sign in with Apple requis (règle 4.8) ; pas de compte, donc pas d'obligation de suppression de compte (5.1.1(v)) — l'effacement des données reste disponible dans Réglages → Mes données.

## Vidéo App Preview et captures (`tools/brand/preview`)

`preview.html` recompose les vrais écrans de l'app (couleurs de `theme/tokens.ts`, Fraunces, photos de `assets/photos`, icône, textes français de l'app) et les anime avec une timeline déterministe ; `render.mjs` la capture image par image (30 i/s, Chromium) puis encode avec ffmpeg. Ouvrir `preview.html` dans un navigateur la joue en direct (`?mode=store`, `?mode=marketing`, `?still=0…6`).

```
cd tools/brand
pnpm preview:video              # out/app-preview-store.mp4      → App Store (886×1920, 28 s, H.264 ~11 Mb/s, AAC stéréo muet)
pnpm preview:video:marketing    # out/app-preview-marketing.mp4  → site, réseaux, pubs (iPhone en scène, mouvements 3D)
pnpm preview:stills             # out/screenshot-1…7.png         → captures iPhone 6,9″ (1320×2868), légendes ci-dessus
```

Récit (28 s) : recettes éparpillées → partage depuis un Reel → lecture puis écoute de la vidéo sur l'iPhone → recette enregistrée toute seule → 6 personnes, quantités recalculées → planning → courses (rayons, budget) → mode cuisine et minuteur → logo, « Sans compte · Sans publicité · iCloud ».

- **Version App Store** (`store`) : écran de l'app sans cadre d'iPhone ni mise en scène 3D, ouverture sur l'accueil (règle 2.3.4 : l'aperçu montre l'app ; textes en surimpression autorisés). La version `marketing` (iPhone en 3D, cartes de recettes en ouverture) est pour le site et les réseaux, pas pour l'App Store.
- **Son** : piste muette (Apple exige une piste audio). Pour une musique, l'ajouter au montage (droits libres) sans réencoder la vidéo : `ffmpeg -i app-preview-store.mp4 -i musique.m4a -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest final.mp4`.
- **Mêmes réglages partout** : vidéo et captures sortent de la même page, donc des mêmes écrans, couleurs et polices. Sur Mac, la police système (SF Pro) remplace Inter et colle exactement à l'app.
- **À refaire avec l'app réelle** : ces écrans sont des reconstitutions fidèles au code (l'app n'avait pas encore tourné sur iPhone). Une fois le build TestFlight disponible, comparer avec l'app et corriger un écran dans `SCREENS` si un détail diffère. Captures iPad 13″ : non générées (à faire sur iPad).
- Durée : 28 s (Apple : 15 à 30 s). La première image de la version App Store (accueil + « Toutes vos recettes, au même endroit ») sert d'image d'aperçu.
