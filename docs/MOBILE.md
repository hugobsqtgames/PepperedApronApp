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
    (auth)/             bienvenue, connexion, inscription, mot de passe oublié
    (app)/(tabs)/       Accueil, Recherche, Favoris, Planning, Courses (+ bouton central « + »)
    (app)/…             recette, mode cuisine, éditeur, imports, collections, listes, profil, foyer,
                        communauté, partage, administration
  features/             blocs d'écran réutilisables (carte recette, grille de catégories, pub…)
  ui/                   design system (Text, Button, Card, Chip, Sheet, Toast, Prompt, états vides…)
  theme/                jetons de design, thèmes clair/sombre
  i18n/                 fr (source), en, es, de, it — clés typées
  hooks/                accès au runtime (session, données réactives, état de synchro)
  services/             runtime, SQLite, jetons sécurisés, photos, OCR, notifications, minuteurs,
                        widgets, pub, analytics, boîte de réception du partage
  lib/                  formatage, dates, erreurs, mise en page
```

Règle : les écrans ne contiennent pas de logique métier ; ils lisent via `useLive(...)` (réactif sur la base locale) et écrivent via `useRepos()` (`packages/client`).

## Navigation

- iPhone / Android : barre d'onglets personnalisée (Accueil, Recherche, « + », Favoris, Planning, Courses), profil via l'avatar.
- iPad (et grands écrans) : barre latérale, grilles multi-colonnes, largeur de lecture limitée.
- Accès protégé : `Stack.Protected` (non connecté → onboarding/connexion).

## Liens profonds

| Lien | Écran |
|---|---|
| `https://pepperedapron.app/r/<jeton>` | recette partagée (aperçu + « Ajouter à mes recettes ») |
| `https://pepperedapron.app/p/<id>` | recette publique de la communauté |
| `https://pepperedapron.app/join/<code>` | rejoindre un foyer |
| `https://pepperedapron.app/auth/…` | vérification d'e-mail, réinitialisation, changement d'adresse |

Universal Links iOS (`applinks:` + fichier AASA servi par l'API) et App Links Android vérifiés (`assetlinks.json`). Sans l'app, les mêmes URL affichent une page web avec les liens des stores. La correspondance chemin → écran est dans `src/app/+native-intent.tsx`.

## Extension de partage (import depuis TikTok, Instagram, Safari, Photos, Notes, Messages)

`expo-share-intent` ajoute une extension iOS « PepperedApron » (texte, URL, page web, 1 image) et des filtres d'intent Android (`text/*`, `image/*`). L'extension transmet le contenu à l'app via l'App Group ; `(app)/_layout.tsx` l'oriente :

- URL → import de lien (lecture JSON-LD / OpenGraph côté serveur, message honnête si la plateforme ne donne pas accès au contenu) ;
- texte → structuration déterministe (titre, ingrédients, étapes) ;
- image → photo de la recette ou lecture du texte sur l'appareil (OCR Apple Vision / ML Kit).

Si l'utilisateur n'est pas connecté, le contenu partagé reste en attente et est traité juste après la connexion. Tout est modifiable avant enregistrement.

## Widgets (iOS)

`targets/widgets` (WidgetKit, SwiftUI) : **Ce soir**, **Prochain repas**, **Liste de courses**, **Recette au hasard**, en petit/moyen. L'app publie un instantané JSON dans l'App Group (`group.<bundleId>`) dès que le planning, les recettes ou la liste active changent, localement ou par synchro (`services/widgets.ts`) ; les widgets fonctionnent hors ligne et ouvrent l'écran concerné.

## Mode cuisine, minuteurs, Live Activities

Texte agrandi, écran maintenu allumé, navigation par étapes, ingrédients à portée, minuteurs multiples (heures de fin absolues : ils survivent à la navigation, à l'arrière-plan et au redémarrage). La fin d'un minuteur est une notification locale ; sur iPhone, le minuteur le plus proche s'affiche en **Live Activity** (écran verrouillé, Dynamic Island) via `expo-live-activity`. Aucune publicité en mode cuisine.

## Notifications

Locales : rappel de repas (au plus une fois par jour, heure réglable), relance du planning vide (dimanche), fin de minuteur. Distante : un membre rejoint le foyer. Chaque type est désactivable ; la permission n'est demandée qu'au premier besoin.

## Publicité

`react-native-google-mobile-ads` derrière `services/ads.ts` (régie remplaçable). Formulaire de consentement UMP (Google) avant toute initialisation, qui affiche aussi la demande ATT sur iOS si le message IDFA est activé dans AdMob ; identifiants de test hors production ; emplacements pilotés à distance (`ADS_CONFIG`). Jamais en mode cuisine, jamais d'interstitiel au lancement, jamais pendant la saisie. Libellé « Publicité » visible.

## Accessibilité et confort

Tailles dynamiques respectées (plafonnées pour les grands titres), libellés VoiceOver/TalkBack sur les contrôles, cibles tactiles ≥ 44 pt, contraste AA dans les deux thèmes, retours haptiques désactivables, mode sombre manuel ou automatique, alternatives au glisser-déposer (« Déplacer vers… », flèches haut/bas).

## Internationalisation

`src/i18n/fr.ts` est la source et définit le type des clés ; `en`, `es`, `de`, `it` doivent avoir exactement les mêmes clés et variables (test `__tests__/i18n.test.ts`). Pluriels i18next (`_one`/`_other`). Textes système iOS/Android dans `locales/native/`. Unités : métrique par défaut, impérial disponible (conversion à l'affichage uniquement).

## Mise à jour obligatoire

Si `GET /v1/config` annonce un `minAppVersion` supérieur à la version installée, un écran bloquant renvoie vers le store. Les données locales sont conservées.

## Dépendances natives à surveiller

`expo-doctor` signale `expo-live-activity` comme peu maintenu et `expo-text-extractor` sans métadonnées. Les deux sont isolés derrière `services/timers.ts` et `services/ocr.ts` (échec silencieux : pas de Live Activity / message « reconnaissance indisponible »), donc remplaçables sans toucher aux écrans. `@bacons/apple-targets` est patché (`patches/`) pour cohabiter avec la cible Live Activity.
