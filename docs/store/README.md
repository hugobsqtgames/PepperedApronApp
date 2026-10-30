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

## Étiquettes d'accessibilité (App Store Connect › Accessibilité)

À déclarer pour iPhone et iPad (tout est réellement pris en charge et vérifié, voir `docs/MOBILE.md` › Accessibilité) :

| Étiquette | Déclarer | Pourquoi |
| --- | --- | --- |
| VoiceOver | Oui | Tous les écrans : rôles, noms, actions, annonces |
| Contrôle vocal | Oui | Noms accessibles = textes visibles, actions nommées |
| Texte plus grand | Oui | Dynamic Type jusqu'aux tailles d'accessibilité |
| Interface sombre | Oui | Thème sombre dédié, automatique ou manuel |
| Différencier sans couleur | Oui | États doublés d'icônes ou de texte |
| Contraste suffisant | Oui | AA partout, AAA avec « Augmenter le contraste » |
| Réduire les animations | Oui | Fondus seulement |
| Sous-titres | Non concerné | L'app ne contient pas de vidéo ; la vidéo App Preview a ses textes à l'écran et des sous-titres SRT (`docs/store/app-preview-fr.srt`, `-en.srt`, `pnpm preview:srt`) |
| Audiodescription | Non concerné | Pas de vidéo dans l'app |

## Notes pour la revue Apple

- Aucun compte : le reviewer ouvre l'app et l'utilise directement. Fichier de démonstration : `docs/store/demo-backup.json` (12 recettes, favoris, collections, planning de la semaine, liste de courses ; les réglages du reviewer ne sont pas touchés). Le joindre aux notes de revue ; il s'importe par Réglages → Mes données → Importer une sauvegarde. Le régénérer juste avant l'envoi pour que le planning tombe sur la semaine en cours : `WRITE_DEMO=1 pnpm --filter @pepperedapron/client test demo` (un test vérifie qu'il s'importe dans une app vide).
- Expliquer : l'extension de partage importe le lien et les métadonnées publiques ; aucune IA ; aucune publicité ; les données restent sur l'appareil et dans l'iCloud de l'utilisateur.
- Pas de connexion tierce, donc pas de Sign in with Apple requis (règle 4.8) ; pas de compte, donc pas d'obligation de suppression de compte (5.1.1(v)) — l'effacement des données reste disponible dans Réglages → Mes données.

## Vidéo App Preview et captures (`tools/brand/preview`)

`preview.html` recompose les vrais écrans de l'app (couleurs de `theme/tokens.ts`, Fraunces, photos de `assets/photos`, icône, textes français de l'app) et les anime avec une timeline déterministe ; `render.mjs` la capture image par image (30 i/s, Chromium) puis encode avec ffmpeg. Ouvrir `preview.html` dans un navigateur la joue en direct (`?mode=store`, `?mode=marketing`, `?still=0…6`, `&ipad=1`, `&lang=en`).

Version anglaise : ajouter `-- --en` à chaque commande (fichiers suffixés `-en`, textes dans `en.js`, légendes = `listings.json` en-US).

```
cd tools/brand
pnpm preview:video              # out/app-preview-store.mp4      → App Store (886×1920, 28 s, H.264 ~11 Mb/s, AAC stéréo muet)
pnpm preview:video:marketing    # out/app-preview-marketing.mp4  → site, réseaux, pubs (iPhone en scène, mouvements 3D)
pnpm preview:stills             # out/screenshot-1…7.png         → captures iPhone 6,9″ (1320×2868), légendes ci-dessus
pnpm preview:stills:ipad        # out/ipad-1…7.png               → captures iPad 13″ (2064×2752), mise en page iPad (barre latérale)
```

Récit (28 s) : recettes éparpillées → partage depuis un Reel → lecture puis écoute de la vidéo sur l'iPhone → recette enregistrée toute seule → 6 personnes, quantités recalculées → planning → courses (rayons, budget) → mode cuisine et minuteur → logo, « Sans compte · Sans publicité · iCloud ».

- **Version App Store** (`store`) : écran de l'app sans cadre d'iPhone ni mise en scène 3D, ouverture sur l'accueil (règle 2.3.4 : l'aperçu montre l'app ; textes en surimpression autorisés). La version `marketing` (iPhone en 3D, cartes de recettes en ouverture) est pour le site et les réseaux, pas pour l'App Store.
- **Son** (`sound.mjs`, synthétisé, donc sans droits à gérer) : nappe de piano électrique chaleureuse ; couteau sur la planche à l'ouverture ; casserole qui mijote sur la recette et en cuisine ; papier qui se froisse quand les repas se posent dans le planning ; crayon qui coche les courses ; minuteur qui se remonte puis fait tic-tac ; touchers d'écran discrets, souffles aux transitions, carillon à « Recette enregistrée » et sur le logo. Tout est calé sur la timeline de `preview.html` (changer un temps d'un côté = le changer de l'autre). Niveau −16 LUFS. `pnpm preview:sound` remet la bande-son sur les vidéos déjà rendues sans recalculer l'image. Pour une musique du commerce à la place, la remplacer au montage.
- **Mêmes réglages partout** : vidéo et captures sortent de la même page, donc des mêmes écrans, couleurs et polices. Sur Mac, la police système (SF Pro) remplace Inter et colle exactement à l'app.
- **À refaire avec l'app réelle** : ces écrans sont des reconstitutions fidèles au code (l'app n'avait pas encore tourné sur iPhone). Une fois le build TestFlight disponible, comparer avec l'app et corriger un écran dans `SCREENS` si un détail diffère. Captures iPad 13″ : non générées (à faire sur iPad).
- Durée : 28 s (Apple : 15 à 30 s). La première image de la version App Store (accueil + « Toutes vos recettes, au même endroit ») sert d'image d'aperçu.
