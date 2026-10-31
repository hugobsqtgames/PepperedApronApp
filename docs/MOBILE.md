# Application mobile (`apps/mobile`)

Expo SDK 58 · React Native 0.88 (nouvelle architecture) · Expo Router · TypeScript strict. Pour iPhone et iPad uniquement.

```
app.config.ts           configuration native (variantes, permissions, plugins, cibles)
eas.json                profils de build EAS
assets/                 icônes (clair/sombre/teinté), splash, polices Fraunces, photos
locales/native/         textes système traduits (permissions, nom de l'app) en français et anglais
targets/widgets/        extension WidgetKit (Swift)
src/
  app/                  écrans (routes Expo Router)
    onboarding.tsx      4 écrans de bienvenue, puis directement l'app (aucun compte)
    (app)/(tabs)/       Accueil, Recherche, « + », Planning, Courses (Favoris via le cœur de l'accueil)
    (app)/…             recette, mode cuisine, éditeur, imports, collections, listes, réglages
                        (iCloud, sauvegarde, effacement, notifications, apparence, langue, aide)
  features/             blocs d'écran réutilisables (carte recette, grille de catégories, pub…)
  ui/                   design system (Text, Button, Card, Chip, Sheet, Toast, Prompt, états vides…)
  theme/                jetons de design, thèmes clair/sombre
  i18n/                 fr (source), en — clés typées
  hooks/                accès au runtime (données réactives, état iCloud)
  services/             runtime, SQLite, iCloud, import de liens, photos, OCR, notifications,
                        minuteurs, widgets, pub, boîte de réception du partage
  lib/                  formatage, dates, erreurs, mise en page
```

Règle : les écrans ne contiennent pas de logique métier ; ils lisent via `useLive(...)` (réactif sur la base locale) et écrivent via `useRepos()` (`packages/client`).

## Navigation

- iPhone : barre d'onglets personnalisée (Accueil, Recherche, « + » au centre, Planning, Courses) ; Favoris et Réglages via les boutons de l'accueil.
- iPad (et grands écrans) : barre latérale, grilles multi-colonnes, largeur de lecture limitée.
- Premier lancement : `Stack.Protected` affiche l'onboarding tant que `onboardingDone` est faux, puis l'app. Si la base locale ne peut pas s'ouvrir (stockage plein…), un écran d'erreur propose de réessayer.

## Données et iCloud

Au démarrage, `services/runtime.ts` ouvre `pepperedapron.db` (SQLite), crée le `LocalStore`, les repositories et, sur iOS, `CloudSync` avec l'adaptateur `services/icloud.ts` (conteneur privé `iCloud.<bundleId>`, portée « app data »). Réglages affiche l'état (« À jour dans iCloud · il y a 2 min », « iCloud indisponible »…) ; Réglages → Mes données permet de couper iCloud sur l'appareil, de synchroniser, d'exporter/importer un fichier et d'effacer toutes les données (propagé aux autres appareils). Détails : [SYNC.md](SYNC.md).

Les photos sont des fichiers `Documents/photos/<uuid>.jpg` ; la recette ne stocke que ce nom. Une photo pas encore arrivée d'iCloud affiche la tuile de catégorie, puis l'image dès son téléchargement.

Liens : seul le schéma `pepperedapron://` est utilisé (widgets, Live Activities) ; voir `src/app/+native-intent.tsx`.

## Extension de partage : « Partager → PepperedApron » fait tout

`expo-share-intent` ajoute une extension iOS « PepperedApron » (texte, URL, page web, jusqu'à 10 images, 1 vidéo, 1 PDF). L'extension transmet le contenu à l'app via l'App Group ; `(app)/_layout.tsx` le transforme en imports (`services/autoImport.ts → sourcesFromShare`) et les place dans la **file d'imports** (`services/importQueue.ts`). Chaque import est lu puis **enregistré directement** comme recette ; l'écran `import/queue` montre la progression puis ouvre la recette. Une recette enregistrée ainsi porte un bandeau « Importée automatiquement » (champ `review`) qui dit quoi vérifier, jusqu'à ce que l'utilisateur touche « C'est bon » ou la modifie.

- URL → import de lien directement depuis l'appareil (`services/importer.ts` + `packages/core/src/parse/url.ts` : légende de la page publique TikTok / description YouTube, et si la recette n'est qu'expliquée à l'oral, ses sous-titres automatiques publiés par la plateforme (ingrédients cités et phrases d'action, transcription complète dans les notes, sans IA) ; Instagram : légende de la page publique, ou de la page d'intégration officielle `/p/<code>/embed/captioned/` si la première demande une connexion ; JSON-LD, OpenGraph). Plusieurs liens dans un texte → un import par lien.
- texte → structuration déterministe (titre, ingrédients, étapes) ;
- images (1 à 10, ex. captures d'un carrousel) → texte de chaque image lu sur l'appareil (OCR Apple Vision), mis bout à bout en une seule recette ; une image presque sans texte devient la photo de la recette ;
- vidéo (enregistrée depuis TikTok/Instagram dans Photos) → transcription sur l'appareil (voir plus bas).
- PDF (partagé ou « + » → « Un PDF ») → texte lu par PDFKit (module local `modules/pdf-text`), puis `parseRecipeText` ; PDF scanné (sans texte) → ses 10 premières pages en images, lues par la reconnaissance de texte.
- lien Pinterest (`pin.it` compris) → la recette est importée depuis le site d'origine du pin (`pinterestSourceUrl`), sinon la description du pin.

**Doublons** (`packages/core/src/duplicates.ts`) : même publication (lien normalisé : `instagram.com/reel/X?igsh=…` = `instagram.com/p/X`) ou même titre + mêmes ingrédients → rien n'est ajouté, la recette existante s'ouvre (« Ajouter quand même » possible). L'éditeur signale aussi un doublon pour les imports manuels.

**File d'imports** : conservée dans la base locale (table `meta`, cet appareil seulement), elle reprend après fermeture de l'app ; un import à la fois ; hors ligne, rien n'est enregistré et l'import attend le réseau. Imports en masse (liste de liens, export Instagram) : 4 s entre deux publications Instagram ; si Instagram ne donne plus les légendes, la file fait une pause de 15 min au lieu d'enregistrer des liens vides (3 essais par publication). Les imports n'avancent que lorsque l'app est ouverte (iOS ne laisse pas tourner l'app en arrière-plan) : l'écran d'import garde l'écran allumé.

**Enregistrements Instagram** (`import/instagram`) : l'utilisateur demande à Instagram l'export de ses « Enregistrés » (JSON), puis choisit le ZIP ; seuls les fichiers `saved*.json|html` sont décompressés (`fflate`, limite 150 Mo), les publications et leurs **collections** sont lues (`parse/links.ts → instagramSavedPosts`) et importées ; chaque collection Instagram devient une collection de l'app. Une par une : Partager → PepperedApron, puis « ◀ Instagram » pour la suivante.

Reel Instagram dont la recette n'est que dite à l'oral, ou vidéo partagée : l'app télécharge la vidéo publique dans le cache (ou copie le fichier partagé), le module local `modules/video-speech` (Swift) en extrait le son en 16 kHz mono et le fait transcrire par la reconnaissance vocale d'Apple **sur l'appareil** (`requiresOnDeviceRecognition`), puis le fichier est supprimé. Les ingrédients et étapes sont tirés de la transcription par les mêmes règles que les sous-titres TikTok/YouTube.

**Texte écrit sur la vidéo** : avant l'écoute, `videoFrames` (même module) tire environ une image par seconde (60 au plus) avec une note de netteté/exposition ; chaque image est lue par la reconnaissance de texte, et `ingredientsFromScreenText` (core) garde les lignes « quantité + ingrédient », une seule fois. Elles sont fusionnées sans doublon avec la légende puis la transcription (`mergeIngredients` : les quantités écrites priment). Les 6 meilleures images (espacées d'au moins 2,5 s, `lib/frames.ts`) sont gardées dans le cache (`services/videoFrames.ts`) : l'éditeur les propose sous la photo (« Ou une image de la vidéo ») ; pour une vidéo partagée, la meilleure devient la photo.

**Dictée** (`import/dictate`) : enregistrement au micro (`expo-audio`), puis même transcription sur l'appareil ; la première phrase donne le titre ; la recette s'ouvre dans l'éditeur. L'audio est supprimé.

Depuis l'app (« + ») : lien(s) collé(s), texte, photo(s), dictée, enregistrements Instagram. Ces imports-là s'ouvrent dans l'éditeur avant enregistrement (sauf plusieurs liens, qui passent par la file).

## Widgets (iOS)

`targets/widgets` (WidgetKit, SwiftUI) : **Ce soir** (en moyen, avec la photo du plat : une petite copie JPEG dans le conteneur de l'App Group, `widget-tonight.jpg`), **Prochain repas**, **Liste de courses**, **Recette au hasard**, **Minuteur** (anneau qui se vide et compte à rebours tenus par le système, `PATimer`, aussi sur l'écran verrouillé), en petit/moyen. L'app publie un instantané JSON dans l'App Group (`group.<bundleId>`) dès que le planning, les recettes ou la liste active changent, localement ou via iCloud (`services/widgets.ts`) ; les widgets fonctionnent hors ligne et ouvrent l'écran concerné.

## Intégration iOS : Siri, Spotlight, widgets interactifs, écran verrouillé, Handoff

- **Widgets interactifs** (iOS 17) : dans le widget « Liste de courses » (moyen/grand), toucher le rond d'un article le coche. L'App Intent `ToggleShoppingItemIntent` (cible `targets/widgets`) masque l'article tout de suite et met la demande en attente dans l'App Group (`pendingChecks`) ; l'app l'applique à l'ouverture ou au retour au premier plan (`applyExtensionRequests`).
- **Écran verrouillé** : « Ce soir » (rectangulaire, en ligne) et « Liste de courses » (circulaire : articles restants, rectangulaire, en ligne).
- **Siri / Raccourcis** : extension App Intents `targets/intents` (nouvel identifiant `<bundle>.PepperedApronIntents`, App Group partagé ; EAS crée son profil comme pour les widgets). « Qu'est-ce qu'on mange ce soir dans PepperedApron », « Ajoute aux courses dans PepperedApron » (Siri demande quoi ; mis en attente `pendingAdds`, ajouté à la liste active à l'ouverture suivante), « Une recette au hasard dans PepperedApron ». Réponses lues dans l'instantané des widgets, dans la langue de l'app (`intentLabels`). Tout reste sur l'appareil.
- **Spotlight** : module local `modules/ios-integration` ; titres, ingrédients, étiquettes et photos indexés **sur l'appareil** (`services/spotlight.ts`, ré-indexé après chaque changement, supprimés avec la recette). Un résultat ouvre la fiche (`IosIntegrationAppDelegate` → `pepperedapron://recipe/<id>`).
- **Handoff** : la fiche et le mode cuisine publient une `NSUserActivity` (`<bundle id>.recipe` / `.cook`, propres à chaque variante dev/staging/prod, déclarées dans `NSUserActivityTypes`) ; sur l'autre appareil connecté au même compte Apple, l'icône Handoff rouvre la même recette.

## Mode cuisine, minuteurs, Live Activities

Texte agrandi et réglable (A−/A+, retenu dans les réglages), écran maintenu allumé, navigation par étapes, ingrédients à portée **pour le nombre de personnes choisi sur la fiche** (les quantités écrites dans les étapes suivent aussi : `scaleStepText`), minuteurs multiples et nommables (« + Minuteur » : durée puis nom ; heures de fin absolues : ils survivent à la navigation, à l'arrière-plan et au redémarrage). « Terminer » ajoute la recette à l'historique (une entrée par jour) et propose de la noter et d'ajouter une remarque.

- **Minuteurs détectés** : une étape sans minuteur qui dit « cuire 8 min » ou « 1 h 30 de repos » a quand même son bouton (`detectStepTimer`, à l'affichage seulement : la recette n'est pas modifiée), en mode cuisine et sur la fiche.
- **Ingrédients de l'étape** : sous chaque étape, les ingrédients qu'elle cite avec leurs quantités à l'échelle (`stepIngredients` : tous les mots du nom, ou son mot principal).
- **Lecture à voix haute** (`expo-speech`, langue de l'app) : bouton haut-parleur = réglage `cookReadAloud` (synchronisé) ; chaque étape affichée est lue.
- **Commandes vocales** : bouton micro, seulement en mode cuisine, indicateur « À l'écoute » visible tant qu'il écoute, arrêt en quittant. Module local `modules/voice-commands` (Swift : `AVAudioEngine` + `SFSpeechAudioBufferRecognitionRequest`, `requiresOnDeviceRecognition`, tâche relancée après chaque phrase et toutes les 50 s). `voiceCommand` (core) reconnaît « suivant », « précédent », « répète », « lance le minuteur », « ingrédients », « stop » (fr/en) dans les derniers mots ; ce qui est entendu pendant que le téléphone parle est ignoré.
- **Deux recettes à la fois** : « Cuisiner une autre recette en même temps » → onglets en haut, chacun à son étape ; les minuteurs portent le nom de leur recette ; « Terminer » sur l'une passe à l'autre.

Fiche recette : nombre de personnes réglable, quantités recalculées et arrondies comme en cuisine (œufs entiers, demi-oignons, quarts de cuillère, « ≈ » quand l'arrondi se voit), « cups » de farine/sucre affichées en grammes en métrique, moule conseillé quand un moule est mentionné (surface proportionnelle), convertisseur (`tools/converter` : poids/volumes avec densités usuelles, °C/°F/thermostat), note (étoiles), « Mes remarques », historique « Cuisinée N fois », étiquettes automatiques (végétarien, vegan, sans gluten — déduites des ingrédients, `packages/core/src/diet.ts`) et saisons déduites des fruits et légumes (`seasonal.ts`) quand l'utilisateur n'en a pas choisi. La fin d'un minuteur est une notification locale ; sur iPhone, le minuteur le plus proche s'affiche en **Live Activity** (écran verrouillé, Dynamic Island, avec le texte de son étape) via `expo-live-activity`.

## Le plaisir de cuisiner

- **Couleur du plat** : la fiche et le mode cuisine prennent la teinte de la photo (`lib/photoTint.ts` : image réduite à 16 px par `expo-image-manipulator`, lue par `jpeg-js` ; `lib/tint.ts` choisit la luminosité qui garde le contraste AA ; couleurs des photos de catégorie précalculées ; `TintScope`). Pas de teinte avec « Augmenter le contraste ».
- **Grande photo** en tête de fiche (iPhone) : titre posé dessus, parallaxe et étirement au tiré (rien avec « Réduire les animations »), barre de titre qui apparaît au défilement ; **zoom iOS 18** des cartes vers la fiche (`Link.AppleZoom` / `AppleZoomTarget`).
- **Typographie éditoriale** : Fraunces italique pour les chapôs (`lede`), citations et notes (`quote`), petites capitales au-dessus des titres (`kicker`).
- **Accueil** : salutation selon le moment (`mealMoment`) et le jour ; carte **« Ce soir on mange… »** (dîner prévu, sinon l'idée du jour stable sur la journée : placard à finir, saison, favoris, oubliées — `pickOfTheDay`) ; bandeau des produits de saison de vos recettes (`seasonalHighlights`) ; **restes d'hier** (`leftoverIdeas`).
- **Mode cuisine** : « Étape n sur N », **note par étape** (`stepNotes`, aussi sur la fiche), **« Pendant que ça cuit… »** (`parallelSteps`), minuteurs en **anneaux**, haptique douce à chaque étape, **photo du plat** proposée à la fin pour le journal.
- **Cuisine d'origine** (24, avec drapeau ; déduite par `detectCuisine` ou choisie sur la fiche) et **accords** boisson (toujours avec une idée sans alcool) et accompagnement (`pairingsFor`).
- **Ma cuisine** (profil) : **journal** (mur de photos mois par mois), **badges** (14, `computeBadges`), **carte du monde des cuisines** (grille de points tirée de Natural Earth, `lib/worldMap.ts`), **rétrospective de l'année** partageable en image (`yearReview`).
- **Célébrations** : confettis, haptique « ta-da » et message pour le premier plat, les nombres ronds et chaque badge (`features/celebrate.ts`) ; haptiques distinctes pour la prise, le survol et la dépose d'un plat glissé, et la fin d'un minuteur.
- **Planning en table** (iPhone) : chaque jour une rangée de photos ; appui long puis glisser vers un autre jour (`WeekTable`, VoiceOver garde le menu « Déplacer vers… »).

## Plusieurs plats, heure de début, placard sans saisie (lot 9)

- **Programme de cuisson** (`packages/core/src/schedule.ts`, écran `cook-plan`, composant `features/cook/CookPlanView`) : chaque étape est estimée (minuteur ou durée écrite ; un four, un mijotage ou un repos laisse les mains libres après 2 min ; sinon ~1 min par 70 caractères, ajusté au temps total de la recette), puis les recettes sont ordonnancées pour **une seule paire de mains** (jamais deux gestes en même temps).
  - **Batch cooking** (`asap`) : depuis le Planning (« Batch cooking », recettes à venir de la semaine, 6 max) ; tout le plus vite possible, la recette la plus longue d'abord, une autre se prépare pendant qu'un plat cuit ; durée de la session comparée à « l'une après l'autre ».
  - **Tout prêt en même temps** (`together`) : planifié à rebours depuis la fin, chaque plat commence juste à temps ; choix de l'heure du repas, heure de début, rappel. En mode cuisine avec plusieurs recettes, bouton « programme » (toucher une étape l'ouvre dans son onglet). Le mode cuisine s'ouvre aussi avec plusieurs onglets (`with=`).
  - Liste des étapes avec heure (« +15 min » avant de commencer, heure réelle après « C'est parti » ou avec une heure de repas), « maintenant », temps de travail / temps sans vous, minuteur, case « fait » (gardée tant que l'app tourne).
- **« Prêt à quelle heure ? »** (fiche, bouton réveil à côté de « Commencer ») : heures proposées par demi-heure, heure de début calculée (`startTimeFor`), notification locale au moment de commencer (`services/startReminder.ts`, demandée par l'utilisateur, donc indépendante des réglages de rappels), bandeau « Commencez à 18:45 pour manger à 20:00 » annulable.
- **Ingrédients cochés en cuisine** : sur chaque étape, les ingrédients cités se cochent d'un toucher ; la liste complète garde les coches (par recette) quand on la ferme et la rouvre ; compteur « 3/8 prêts ».
- **Placard sans saisie** (`pantry-scan`) : **ticket de caisse** en photo → texte lu avec les positions (`readTextLines`), lignes recollées (nom + prix lus séparément), `parseReceipt` (core) garde les produits (prix, totaux, paiement, magasin, dates écartés), lit poids et formats (« 0,512 kg × », « 6X125G », « 2 x »), développe les abréviations courantes, devine le rangement (`pantryPlaceFor`) et décoche le non-alimentaire ; vérification (renommer, changer de rangement) avant de ranger. **Code-barres** : caméra (`expo-camera`, EAN/UPC), nom et format via **Open Food Facts** (`services/products.ts`, seul le numéro est envoyé), rangement et date de péremption en deux touches ; produit inconnu → nom demandé.
- **« Qu'est-ce que je fais avec ça ? »** : depuis le placard ou « Mon frigo » de la recherche, les produits de la maison en puces (⏰ = à utiliser vite, « Tout prendre ») ; chaque résultat dit « Vous avez n ingrédients sur N » et ajoute le reste aux courses avec les quantités.
- **Recherche par ustensile** (`packages/core/src/equipment.ts`, déduit des étapes) : four, plaques, micro-ondes, air fryer, Cookeo/autocuiseur, robot, mixeur, barbecue/plancha, sans cuisson ; puces (un toucher = avec, deux = sans) et dans la requête (« gratin sans four », « poulet airfryer », « dessert sans cuisson »).
- **Lecture des photos** (`modules/text-vision`, Swift, Apple Vision niveau « accurate », langues fr/en, correction linguistique) : lit l'**écriture manuscrite** et les accents ; option « Recette écrite à la main » à l'import photo (la photo de la fiche devient la photo de la recette, en souvenir). Builds sans le module : repli sur `expo-text-extractor`.
- **Captures d'écran** : texte d'une capture nettoyé avant lecture (`cleanScreenshotText` : barre d'état, boutons, compteurs, pseudos, horodatages, barre d'adresse — seulement quand l'image ressemble à une capture, `looksLikeScreenshot`) ; « Ma dernière capture d'écran » dans le menu + (lecture seule de la photothèque, `expo-media-library`, sur demande).
- **Partage par lien** : « Par un lien » envoie `https://hugobsqtgames.github.io/PepperedApronApp/r/#<recette compressée>` ; la page `r/` du site (`apps/site/src/recipePage.mjs`) affiche la recette (texte DOM uniquement, rien n'est envoyé au serveur : la partie après « # » reste dans le navigateur) avec « Ouvrir dans PepperedApron » (`pepperedapron://r/…`) et le lien App Store ; un tel lien partagé ou collé dans l'app s'importe sans réseau.
- **Rappel du planning** : jour (vendredi, samedi, dimanche) et heure réglables, seulement si la semaine suivante est presque vide, avec trois idées (saison et favoris, les moins récemment cuisinées d'abord).

## Organisation et partage

- **Recherche** : notes, « Mes remarques » et astuces sont aussi cherchées, avec un poids faible (après titre, ingrédients, étiquettes).
- **Collections intelligentes** (entité synchronisée `smartCollection`, `packages/core/src/smart.ts`) : règles régime, durée max, catégories, saison, note minimale, « pas cuisinée depuis N jours » ; affichées avant les collections, se remplissent seules (`collection/smart` pour les règles, aperçu du nombre de recettes en direct).
- **Fusion de doublons** (« … » de la fiche quand un doublon existe → `recipe/merge`) : pour chaque partie (titre, photo, description, portions/temps, ingrédients, étapes, remarques, source), garder l'une ou l'autre version ; favori, collections, historique (photos comprises), planning, semaines types et lignes de courses passent sur la recette gardée (`mergeRecipes`).
- **Photo « mon résultat »** : bouton appareil photo à côté de « Cuisinée aujourd'hui » ; `cookLog.photoKey`, synchronisée avec les photos de recettes (et prise en compte par le nettoyage des photos orphelines).
- **Partager** : en texte, en **image** (`features/share/ShareCard`, couleurs fixes de la charte, capturée par `react-native-view-shot`), en **QR code** (la recette compressée dans `pepperedapron://r/<données>`, `lib/recipeLink.ts` ; si trop longue, titre + ingrédients + étapes ; scannée par l'appareil photo → éditeur pré-rempli, route `r/[data]`), **imprimer** ou **PDF** (`expo-print`, `lib/print.ts`) ; une collection s'imprime en livret (couverture, une recette par page).

## Planning et courses

- **Mon placard** (`pantry`, depuis le profil, le menu des courses ou l'accueil) : placard, frigo, congélateur ; entité synchronisée `pantryItem` (nom, quantité, unité, lieu, date de péremption). Ajouter des courses (semaine ou recette) ne rajoute pas ce qui est à la maison, ou seulement ce qui manque quand les unités se comparent (`deductPantry`). Cocher une course propose de la ranger (frigo pour les produits frais, congélateur pour les surgelés).
- **Péremption** : rappel local la veille à 18 h (catégorie de notification « Dates de péremption », `rescheduleExpiry`) ; section d'accueil « À utiliser vite » (3 jours) avec les recettes qui les utilisent (même classement que « Mon frigo »).
- **Bilan de la semaine** (bas du Planning, `weekSummary`) : repas prévus, recettes cuisinées, part végétarienne, budget des courses liées aux recettes de la semaine, recettes les plus cuisinées.

- **Semaines types** (`plan/templates`) : enregistrer la semaine affichée, puis l'ajouter ou la substituer à une autre semaine (entité `planTemplate`, synchronisée).
- **Restes** : sur un repas, « Prévoir des restes pour demain midi » augmente les portions cuisinées et place un repas « Restes » au déjeuner du lendemain (`leftover: true`), exclu de la liste de courses.
- **Liste de courses** : partage en texte (Messages, WhatsApp…) ; envoi vers une liste **Rappels** d'Apple (`expo-calendar`, autorisation Rappels uniquement, pas d'accès au calendrier) — une liste Rappels partagée avec la famille fait le lien sans compte ; les articles déjà présents ne sont pas dupliqués.
- **Budget** : prix saisi sur un article, mémorisé par produit (entité `price`), et estimé proportionnellement pour les listes suivantes ; total et « dans le panier » en haut de la liste, dans la devise de l'appareil.

## Découverte

Accueil : « De saison » (saison courante), « Pas faites depuis longtemps » (cuisinées il y a plus de 60 jours), bandeau des imports en cours. Recherche : filtres végétarien / vegan / sans gluten et ingrédients à éviter (« Sans… champignons »), en plus de « sans X » dans la requête.

## Notifications

Uniquement locales (aucun serveur) : rappel de repas (au plus une fois par jour, heure réglable), liste de courses prête, relance du planning vide (jour et heure réglables, avec trois idées), fin de minuteur, « c'est l'heure de commencer » (demandé depuis « Prêt à quelle heure ? »). Chaque type est désactivable ; la permission n'est demandée qu'au premier besoin.

## Publicité

Aucune : pas de régie, pas d'analytics, pas de SDK de suivi.

## Accessibilité et confort

Toutes les fonctions d'accessibilité d'iOS sont suivies (réglages lus en direct, `theme/a11y.ts`, exposés par `useTheme().a11y`) :

- **VoiceOver** : chaque élément touchable a un rôle et un nom ; les lignes composées (article de courses, repas) sont un seul élément avec actions (cocher, modifier, supprimer) ; tout appui long existe aussi en **action VoiceOver** (`longPressActions`) ; annonces quand un minuteur se termine (`services/timers.ts`), quand les imports sont finis, à chaque changement d'étape en mode cuisine, et pour chaque message (toast).
- **Taille du texte** (Dynamic Type) jusqu'aux tailles d'accessibilité (×3,1 pour le texte courant, ×1,6 pour les grands titres) ; les lignes de liste passent en colonne et les boutons du mode cuisine l'un sous l'autre ; libellés de la barre d'onglets agrandis par la visionneuse de grand contenu (appui long).
- **Réduire les animations** : fondus au lieu des glissements (écrans, feuilles, toasts), squelettes immobiles.
- **Réduire la transparence** : barres et voiles opaques. **Augmenter le contraste** : palettes renforcées, tous les couples de texte à 7:1 (AAA). Thèmes normaux : 4,5:1 (AA) au moins (`__tests__/contrast.test.ts`).
- **Texte en gras** : graisses relevées, titres Fraunces dans leur coupe grasse.
- **Différencier sans couleur** : états toujours doublés d'une icône ou d'un texte (coché, minuteur fini, périmé, erreurs).
- **Inversion intelligente** : photos, images et QR codes ne sont pas inversés.
- **Contrôle vocal / Contrôle de sélection / clavier** : noms accessibles = textes visibles, ordre de lecture = ordre visuel, cibles ≥ 44 pt (zone de toucher comprise).
- Audit automatique (`__tests__/a11yAudit.test.tsx`) : rôle et nom de chaque touchable, actions pour les appuis longs, images non inversées, pas de texte figé, cibles ≥ 44 pt, texte à la taille maximale.

Retours haptiques désactivables, mode sombre manuel ou automatique, alternatives au glisser-déposer (« Déplacer vers… », flèches haut/bas).
## Internationalisation

`src/i18n/fr.ts` est la source et définit le type des clés ; `en` doit avoir exactement les mêmes clés et variables (test `__tests__/i18n.test.ts`). Pluriels i18next (`_one`/`_other`). Textes système iOS (autorisations, nom de l'app) dans `locales/native/`. Unités : métrique par défaut, impérial disponible (conversion à l'affichage uniquement).

## Dépendances natives à surveiller

`expo-camera` (codes-barres) et `expo-media-library` (dernière capture, lecture seule) sont isolés dans `pantry-scan.tsx` et `services/screenshots.ts`. `modules/text-vision` est le module local de lecture de texte. `expo-audio` (dictée) et `expo-calendar` (Rappels) sont isolés dans `import/dictate.tsx` et `services/reminders.ts`. `react-native-cloud-storage` est isolé derrière `services/icloud.ts` (interface `CloudDrive` de `packages/client`). `expo-doctor` signale `expo-live-activity` comme peu maintenu et `expo-text-extractor` sans métadonnées. Les deux sont isolés derrière `services/timers.ts` et `services/ocr.ts` (échec silencieux : pas de Live Activity / message « reconnaissance indisponible »), donc remplaçables sans toucher aux écrans. `@bacons/apple-targets` est patché (`patches/`) pour cohabiter avec la cible Live Activity.
