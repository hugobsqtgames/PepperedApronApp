# Application mobile (`apps/mobile`)

Expo SDK 57 · React Native 0.86 (nouvelle architecture) · Expo Router · TypeScript strict. Une base de code pour iPhone, iPad et Android.

```
app.config.ts           configuration native (variantes, permissions, plugins, cibles)
eas.json                profils de build EAS
assets/                 icônes (clair/sombre/teinté, Android adaptatif), splash, polices Fraunces, photos
locales/native/         textes système traduits (permissions, nom de l'app) en 5 langues
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
  i18n/                 fr (source), en, es, de, it — clés typées
  hooks/                accès au runtime (données réactives, état iCloud)
  services/             runtime, SQLite, iCloud, import de liens, photos, OCR, notifications,
                        minuteurs, widgets, pub, boîte de réception du partage
  lib/                  formatage, dates, erreurs, mise en page
```

Règle : les écrans ne contiennent pas de logique métier ; ils lisent via `useLive(...)` (réactif sur la base locale) et écrivent via `useRepos()` (`packages/client`).

## Navigation

- iPhone / Android : barre d'onglets personnalisée (Accueil, Recherche, « + » au centre, Planning, Courses) ; Favoris et Réglages via les boutons de l'accueil.
- iPad (et grands écrans) : barre latérale, grilles multi-colonnes, largeur de lecture limitée.
- Premier lancement : `Stack.Protected` affiche l'onboarding tant que `onboardingDone` est faux, puis l'app. Si la base locale ne peut pas s'ouvrir (stockage plein…), un écran d'erreur propose de réessayer.

## Données et iCloud

Au démarrage, `services/runtime.ts` ouvre `pepperedapron.db` (SQLite), crée le `LocalStore`, les repositories et, sur iOS, `CloudSync` avec l'adaptateur `services/icloud.ts` (conteneur privé `iCloud.<bundleId>`, portée « app data »). Réglages affiche l'état (« À jour dans iCloud · il y a 2 min », « iCloud indisponible »…) ; Réglages → Mes données permet de couper iCloud sur l'appareil, de synchroniser, d'exporter/importer un fichier et d'effacer toutes les données (propagé aux autres appareils). Détails : [SYNC.md](SYNC.md).

Les photos sont des fichiers `Documents/photos/<uuid>.jpg` ; la recette ne stocke que ce nom. Une photo pas encore arrivée d'iCloud affiche la tuile de catégorie, puis l'image dès son téléchargement.

Liens : seul le schéma `pepperedapron://` est utilisé (widgets, Live Activities) ; voir `src/app/+native-intent.tsx`.

## Extension de partage (import depuis TikTok, Instagram, Safari, Photos, Notes, Messages)

`expo-share-intent` ajoute une extension iOS « PepperedApron » (texte, URL, page web, 1 image) et des filtres d'intent Android (`text/*`, `image/*`). L'extension transmet le contenu à l'app via l'App Group ; `(app)/_layout.tsx` l'oriente :

- URL → import de lien directement depuis l'appareil (`services/importer.ts` + `packages/core/src/parse/url.ts` : légende de la page publique TikTok / description YouTube, et si la recette n'est qu'expliquée à l'oral, ses sous-titres automatiques publiés par la plateforme (ingrédients cités et phrases d'action, transcription complète dans les notes, sans IA) ; JSON-LD, OpenGraph ; message honnête si la plateforme ne donne pas accès au contenu ; hors ligne, le lien est gardé comme source) ;
- texte → structuration déterministe (titre, ingrédients, étapes) ;
- image → photo de la recette ou lecture du texte sur l'appareil (OCR Apple Vision / ML Kit).

Tout est modifiable avant enregistrement.

## Widgets (iOS)

`targets/widgets` (WidgetKit, SwiftUI) : **Ce soir**, **Prochain repas**, **Liste de courses**, **Recette au hasard**, en petit/moyen. L'app publie un instantané JSON dans l'App Group (`group.<bundleId>`) dès que le planning, les recettes ou la liste active changent, localement ou via iCloud (`services/widgets.ts`) ; les widgets fonctionnent hors ligne et ouvrent l'écran concerné.

## Mode cuisine, minuteurs, Live Activities

Texte agrandi, écran maintenu allumé, navigation par étapes, ingrédients à portée, minuteurs multiples (heures de fin absolues : ils survivent à la navigation, à l'arrière-plan et au redémarrage). La fin d'un minuteur est une notification locale ; sur iPhone, le minuteur le plus proche s'affiche en **Live Activity** (écran verrouillé, Dynamic Island) via `expo-live-activity`.

## Notifications

Uniquement locales (aucun serveur) : rappel de repas (au plus une fois par jour, heure réglable), liste de courses prête, relance du planning vide (dimanche), fin de minuteur. Chaque type est désactivable ; la permission n'est demandée qu'au premier besoin.

## Publicité

Aucune : pas de régie, pas d'analytics, pas de SDK de suivi.

## Accessibilité et confort

Tailles dynamiques respectées (plafonnées pour les grands titres), libellés VoiceOver/TalkBack sur les contrôles, cibles tactiles ≥ 44 pt, contraste AA dans les deux thèmes, retours haptiques désactivables, mode sombre manuel ou automatique, alternatives au glisser-déposer (« Déplacer vers… », flèches haut/bas).

## Internationalisation

`src/i18n/fr.ts` est la source et définit le type des clés ; `en`, `es`, `de`, `it` doivent avoir exactement les mêmes clés et variables (test `__tests__/i18n.test.ts`). Pluriels i18next (`_one`/`_other`). Textes système iOS/Android dans `locales/native/`. Unités : métrique par défaut, impérial disponible (conversion à l'affichage uniquement).

## Dépendances natives à surveiller

`react-native-cloud-storage` est isolé derrière `services/icloud.ts` (interface `CloudDrive` de `packages/client`). `expo-doctor` signale `expo-live-activity` comme peu maintenu et `expo-text-extractor` sans métadonnées. Les deux sont isolés derrière `services/timers.ts` et `services/ocr.ts` (échec silencieux : pas de Live Activity / message « reconnaissance indisponible »), donc remplaçables sans toucher aux écrans. `@bacons/apple-targets` est patché (`patches/`) pour cohabiter avec la cible Live Activity.
