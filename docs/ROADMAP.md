# Feuille de route — prochains lots

Chaque lot se fait dans une **nouvelle session** (contexte léger) : « Fais le lot N de docs/ROADMAP.md ». Branche : `claude/pepperedapron-mobile-app-5vzcqv`. Règles du projet : pas de TODO ni de faux écrans, tout vérifié (lint, typecheck, tests du paquet touché), textes fr + en (`apps/mobile/src/i18n`), docs à jour (`docs/MOBILE.md`, `docs/PRIVACY.md` si une donnée ou une autorisation change), commit + push, cocher le lot ici. App 100 % locale, sans compte, sans serveur, sans pub, iPhone/iPad uniquement (Expo SDK 57, build EAS). Lire seulement les fichiers utiles.

Repères : modèle de données `packages/core/src/schemas.ts` (champs ajoutés avec `.default()`, `DATA_VERSION` à incrémenter dans `sync.ts`), logique `packages/client/src/repos.ts`, écrans `apps/mobile/src/app`, imports `apps/mobile/src/services/{importer,autoImport,importQueue}.ts`, module natif local `apps/mobile/modules/video-speech` (Swift, modèle pour d'autres modules), widgets `apps/mobile/targets/widgets`, vidéo/captures `tools/brand/preview`.

## Lot 1 — Prêt pour l'App Store (1, 2, 4, 5, 50)
- [ ] **Quoi de neuf** : écran affiché une fois par version (`meta` locale « last_seen_version »), contenu fr/en dans i18n.
- [ ] **Fichier de démonstration** : `docs/store/demo-backup.json` au format d'export (`EXPORT_FORMAT`), ~15 recettes avec photos? (les photos ne sont pas dans l'export : recettes sans photo ou catégories), planning de la semaine, liste en cours ; test qui vérifie qu'il s'importe ; mention dans `docs/store/README.md` (notes pour la revue).
- [ ] **Vidéo + captures en anglais** : `tools/brand/preview` paramétré `?lang=en` (textes des écrans et légendes dans un dictionnaire fr/en ; légendes = `docs/store/listings.json`), sorties `-en`.
- [ ] **Captures iPad 13″** (2064×2752) : mises en page iPad (barre latérale, grilles, comme l'app sur iPad) dans la même page, `render.mjs stills-ipad`.
- [ ] **Demande d'avis** : `expo-store-review`, seulement après « Terminer » en mode cuisine avec une note de 5 étoiles, au plus une fois tous les 4 mois (règle Apple : 3 fois/an max).

## Lot 2 — Import (7, 8, 9, 10)
- [ ] **Texte écrit dans la vidéo** : pour un Reel/TikTok téléchargé (déjà fait pour l'écoute) extraire ~1 image/s (`expo-video-thumbnails`), OCR sur l'appareil (`services/ocr.ts`), garder les lignes qui ressemblent à des ingrédients/quantités, fusionner avec la légende et la transcription (sans doublons).
- [ ] **Photo depuis la vidéo** : proposer 6 images de la vidéo dans l'éditeur (« Choisir une image de la vidéo »), image nette et bien exposée en premier par défaut.
- [ ] **PDF** : extension de partage + « + » acceptent les PDF ; texte lu par PDFKit (petit module natif Swift sur le modèle de `video-speech`), puis `parseRecipeText` ; PDF scannés → OCR des pages.
- [ ] **Pinterest et grands sites** : résolution des liens `pin.it`/Pinterest vers la recette d'origine ; tests avec pages enregistrées (fixtures) de Marmiton, 750g, Cuisine AZ, Ricardo, BBC Good Food, AllRecipes, NYT Cooking (JSON-LD), dans `packages/core/src/parse`.

## Lot 3 — En cuisine (14, 15, 16, 17, 19)
- [ ] **Minuteurs détectés** : « cuire 8 min », « 1 h 30 de repos » dans une étape sans minuteur → bouton minuteur (core : `parseTimerSeconds` existe ; le faire à l'affichage, sans modifier la recette).
- [ ] **Ingrédients de l'étape** : sous chaque étape (mode cuisine et fiche), les ingrédients cités, avec quantités à l'échelle (correspondance par `ingredientKey`).
- [ ] **Lecture à voix haute** : `expo-speech`, bouton haut-parleur + lecture auto à chaque étape (réglage), langue de l'app.
- [ ] **Commandes vocales** : « suivant », « précédent », « répète », « lance le minuteur », « ingrédients » ; reconnaissance continue **sur l'appareil** (module Swift : AVAudioEngine + `SFSpeechAudioBufferRecognitionRequest`, `requiresOnDeviceRecognition`), activable seulement en mode cuisine, indicateur micro visible, s'arrête en quittant.
- [ ] **Deux recettes à la fois** : depuis le mode cuisine « Ajouter une recette » → onglets en haut, minuteurs de chaque recette étiquetés.

## Lot 4 — Placard, frigo, bilan (21, 22, 28)
- [ ] **Placard** : nouvelle entité synchronisée `pantryItem` (nom, quantité?, unité?, péremption?) ; écran « Mon placard » ; à l'ajout aux courses, ce qui est dans le placard n'est pas ajouté (ou réduit si quantités comparables) ; cocher une course propose de la ranger au placard.
- [ ] **Péremption** : date sur un article du placard/frigo, rappel local la veille, section accueil « À utiliser vite » avec les recettes qui les utilisent (recherche frigo existante).
- [ ] **Bilan de la semaine** : dans Planning, repas planifiés/cuisinés, budget des courses, part végétarienne, recettes les plus cuisinées.

## Lot 5 — Organisation et partage (29, 31, 32, 34, 35, 43, 45)
- [ ] **Recherche dans les notes et remarques** (`notes`, `personalNote`, `tips`) avec un poids faible.
- [ ] **Collections intelligentes** : règles (régime, durée max, catégorie, saison, note min, « pas faite depuis N jours ») ; entité `smartCollection` synchronisée ; affichées avec les collections.
- [ ] **Fusionner deux doublons** : depuis le bandeau de doublon ou « … » → choisir quoi garder champ par champ ; favoris, collections, historique et planning reportés.
- [ ] **Photo « mon résultat »** dans l'historique (`cookLog.photoKey`, synchronisée comme les autres photos, nettoyage des orphelins à étendre).
- [ ] **Impression / PDF** : `expo-print`, une recette ou une collection en livret (charte : Fraunces, crème/vert).
- [ ] **Carte-image** : partage d'une image (photo, titre, temps, ingrédients) en plus du texte (`react-native-view-shot`).
- [ ] **QR code** : la recette compressée dans un lien `pepperedapron://r/<données>` (sans serveur ; si trop longue : ingrédients + étapes seulement), scanné par l'appareil photo → import.

## Lot 6 — Intégration iOS (36, 37, 38, 39, 41)
- [ ] **Raccourcis Siri / App Intents** : « Qu'est-ce qu'on mange ce soir ? » (lit l'instantané des widgets dans l'App Group), « Ajoute … aux courses » (écrit une demande dans l'App Group, appliquée au lancement suivant), « Recette au hasard ».
- [ ] **Spotlight** : indexer titres/ingrédients/photos (CoreSpotlight, module natif), ouvrir la fiche ; désindexer à la suppression.
- [ ] **Widgets interactifs** (iOS 17) : cocher un article de courses depuis le widget (App Intent dans la cible widget → App Group → appliqué par l'app).
- [ ] **Écran verrouillé** : familles `accessoryRectangular/Inline/Circular` (repas du soir, articles restants).
- [ ] **Handoff** : `NSUserActivity` sur la fiche et le mode cuisine, reprise sur l'autre appareil.

## Lot 7 — Accessibilité complète (toutes les fonctions d'Apple)
- [ ] Audit **VoiceOver** écran par écran : libellés, rôles, ordre, regroupements, actions personnalisées (cocher, supprimer, déplacer), annonces (minuteur fini, import terminé), pas d'élément sans nom.
- [ ] **Taille du texte (Dynamic Type)** jusqu'aux tailles d'accessibilité sans texte coupé (mises en page qui passent en colonne).
- [ ] **Réduire les animations**, **Réduire la transparence**, **Augmenter le contraste** (couleurs renforcées), **Texte en gras**, **Différencier sans couleur** (icônes en plus des couleurs), **Inversion intelligente** (photos non inversées).
- [ ] **Contrôle vocal** (noms visibles = noms accessibles), **Contrôle de sélection** / clavier (ordre de focus), cibles ≥ 44 pt partout.
- [ ] Sous-titres de la vidéo App Preview (fichier SRT pour le site).
- [ ] **Étiquettes d'accessibilité App Store** (App Store Connect) : remplir ce qui est réellement pris en charge ; documenter dans `docs/store/README.md`.
- [ ] Tests : contraste (existe), libellés manquants (test qui parcourt les écrans), Dynamic Type maximal.
