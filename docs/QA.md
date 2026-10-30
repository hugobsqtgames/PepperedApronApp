# Rapport QA — audit technique, tests et corrections

État au 30 octobre 2026, branche `claude/pepperedapron-mobile-app-5vzcqv`.

## 1. Résumé

**PARTIELLEMENT VALIDÉ.** Validé :

- toute la logique ;
- la base locale et la synchronisation ;
- les écrans, montés avec de vraies données ;
- la configuration native dev et prod ;
- le bundle JavaScript de production.

Ce qui manque pour une validation complète : aucun outil Apple n'existe dans cet environnement (Linux, ni Xcode, ni Swift, ni simulateur). Le code Swift n'a donc pas été compilé, et rien n'a tourné sur simulateur ou sur appareil. C'est la première étape du build EAS.

Dix-huit défauts réels ont été trouvés et corrigés, chacun avec un test de régression (section 4) : huit pendant l'audit, sept pendant la campagne de stress dev et prod (section 5.1), deux au premier essai dans Expo Go, un au premier build EAS. Cette campagne a tout repassé au vert : 753 tests réussis, 0 échec et 102 465 exécutions générées (cas, actions, appuis et contrôles), en développement comme en production. La campagne a aussi produit des correctifs de dépendances, de sécurité et de performance.

## 2. Stack et environnement

- **Monorepo pnpm** :
  - `packages/core` : logique pure, Vitest ;
  - `packages/client` : base locale SQLite, synchronisation iCloud, Vitest ;
  - `apps/mobile` : Expo SDK 58 (passé de 57 à 58 pour Expo Go), React Native 0.88, expo-router, Jest via jest-expo/ios ;
  - `apps/site`.
- **Code natif** :
  - modules Swift locaux : `video-speech`, `pdf-text`, `voice-commands`, `ios-integration` ;
  - cibles : widgets, App Intents (Siri), extension de partage, Live Activity.
- **Variantes** : `APP_VARIANT` = development, staging ou production. Chacune a son identifiant, son App Group et son conteneur iCloud. Les profils EAS correspondants s'appellent `development`, `staging` et `production`.
- **Machine de test** : Linux, Node 22.22. Pas de Xcode, de Swift ni de simulateur iOS. Chromium et Playwright sont présents mais l'app est iOS uniquement, sans version web.

## 3. Vérifications de build (dev et prod)

| Vérification | Résultat |
| --- | --- |
| Lint (ESLint) et typage TypeScript strict, tout le dépôt | OK |
| `expo prebuild` iOS, variantes development et production | OK : 5 cibles générées, identifiants et App Groups cohérents par variante |
| Entitlements et Info.plist générés, inspectés | OK après corrections (voir 4.5) |
| `expo export --platform ios`, production (bundle Hermes) | OK, 6,3 Mo |
| `expo-doctor` | 20 contrôles sur 21 ; le seul restant : `expo-live-activity` signalé non maintenu |
| Compilation Xcode, Swift et signature | **Non exécutée** : outils Apple absents |
| Exécution sur simulateur ou appareil | **Non exécutée** |

## 4. Défauts trouvés et corrigés

| # | Gravité | Défaut | Cause | Correction |
| --- | --- | --- | --- | --- |
| 1 | P1 | Synchro : une recette supprimée sur un appareil pendant qu'un autre la met en favori, la cuisine ou la range dans une collection laisse des orphelins. Idem pour une liste supprimée pendant un ajout d'article. | La fusion appliquait les suppressions sans retirer les enregistrements qui en dépendent. | Les enfants dont le parent est supprimé sont retirés après chaque fusion (`ENTITY_PARENTS`), de la même façon sur tous les appareils, et réparés à l'ouverture. |
| 2 | P2 | Import d'une sauvegarde contenant `null`, un nombre ou une chaîne : plantage (TypeError) au lieu de « sauvegarde invalide ». | Le contenu n'était pas vérifié avant l'accès aux champs. | Vérification de forme dans `importData`. |
| 3 | P2 | Éditeur : la ligne d'ingrédient affichait la quantité arrondie (432 cl devenait 430 cl). La retoucher changeait la quantité en silence. | L'éditeur utilisait l'arrondi « cuisine » prévu pour l'affichage. | Format exact dans l'éditeur (`formatAmount(…, { exact: true })`). |
| 4 | P1 | Import : une page avec une description de plus de 2 000 caractères, un temps de plus d'une semaine, une température hors bornes, etc. donnait une recette invalide, et l'import automatique échouait entièrement. | `recipeFromDraft` ne bornait pas les champs aux limites du modèle. | Chaque champ est borné ou ramené à null. 1 600 brouillons extrêmes ou issus des importeurs sont désormais tous enregistrables. |
| 5 | P2 | File d'imports : un état enregistré endommagé ou ancien bloquait le service (TypeError). Même risque pour les minuteurs. | Le JSON relu n'était pas validé. | Seuls les éléments bien formés sont gardés. |
| 6 | P1 | `expo-asset` manquait, alors que la dictée (`expo-audio`) en dépend. Risque de plantage hors Expo Go. | Dépendance pair non installée. | Installé ; paquets Expo alignés sur le SDK 57 ; `@expo/metro-runtime` déclaré. |
| 7 | P2 | `@bacons/apple-targets` utilisait `@expo/image-utils` sans le déclarer : le prebuild cassait selon le hoisting de pnpm. | Dépendance non déclarée en amont. | `packageExtensions` dans `pnpm-workspace.yaml`. |
| 8 | P3 | Test `Button` instable : échec sur machine lente ou cache froid. | Le test dépendait d'un minuteur réel de 50 ms. | Test rendu déterministe. Le composant était correct. |

| 9 | P0 | Production : l'extension de partage n'était pas générée. L'app de l'App Store n'apparaissait donc pas dans la feuille de partage. | La cible de l'extension portait le nom de l'app (« PepperedApron ») et le plugin la prenait pour une cible déjà existante. | Cible renommée `PepperedApronShare`, avec un correctif de `expo-share-intent` pour garder « PepperedApron » comme nom affiché. Vérifié par `pnpm qa:native`. |
| 10 | P2 | Le nom sur l'écran d'accueil était « PepperedApron » pour toutes les variantes, car les textes traduits l'écrasaient. Dev et prod étaient impossibles à distinguer sur un même iPhone. | Le nom n'était pas défini dans les textes natifs par langue. | Nom par variante injecté dans les textes fr et en. Vérifié par `pnpm qa:native`. |
| 11 | P2 | Une page de 50 000 chiffres bloquait le lecteur de durées pendant 31 s (ReDoS). | Retour arrière quadratique des expressions régulières. | Les nombres ne peuvent plus commencer au milieu d'un autre nombre (`(?<!\d)`). Analyse linéaire : moins de 200 ms. |
| 12 | P2 | Deux ajouts simultanés au placard, ou deux « ajouter la semaine aux courses », créaient des doublons. | Lecture, fusion puis écriture sans exclusion. | Ces opérations passent une par une dans `Repos` (`exclusive`). |
| 13 | P3 | Une somme de quantités au-delà de la limite du modèle faisait échouer l'ajout (erreur de validation). | La somme n'était pas bornée. | La somme est bornée ; au-delà de la limite, l'article est gardé sans quantité. |
| 14 | P2 | Pendant un gros import (1 500 liens), la file effaçait des imports terminés en cours de route. La progression affichée était alors fausse (1 484 sur 1 500). | La purge des anciens imports avait lieu même pendant l'import. | La purge n'a lieu que lorsque plus rien n'est en attente ni en cours. |
| 15 | P3 | Une action lancée depuis un menu sur un élément supprimé entre-temps (par exemple sur un autre appareil, via iCloud) laissait une erreur non gérée. Le menu pouvait viser un repas, une liste, etc. Trouvé par la navigation aléatoire. | Les 48 modifications « sans attendre » des écrans ne géraient pas l'échec. | `inBackground()` ignore l'élément disparu et journalise les autres échecs. Un toast demandé après la fermeture de l'écran ne laisse plus de minuteur. |
| 16 | P0 | Sur iPhone, l'app ne pouvait pas ouvrir les recettes (« Secure random generator unavailable »), dans Expo Go comme dans les builds. Trouvé au premier essai dans Expo Go. | Hermes, le moteur JavaScript d'iOS, n'a pas `crypto.getRandomValues`, que demandent les identifiants. Les tests tournaient sous Node, qui l'a. | Générateur sûr du système (`expo-crypto`) installé avant tout le reste (`index.ts`, `src/polyfills.ts`). |
| 17 | P1 | Sur iPhone, un lien TikTok était traité comme une simple page web (pas de transcription), un lien Instagram en majuscules était refusé, et la détection des doublons se trompait. | Le `URL` de React Native est partiel (il accepte tout, ne normalise rien), alors que les tests utilisaient celui de Node. | `URL` standard (`react-native-url-polyfill`) installé au démarrage ; un test compare les résultats avec les trois implémentations. |
| 18 | P0 | Premier build EAS (TestFlight) en échec : « Cannot read properties of undefined (reading 'transformFile') ». | Depuis le SDK 58, `babel-preset-expo` n'était trouvable qu'à travers les raccourcis de pnpm (`npx expo`), pas depuis l'étape de bundle d'Xcode. | Déclaré dans `apps/mobile/package.json`. `pnpm qa:native` exécute désormais cette étape d'Xcode comme sur le serveur de build. |

### 4.5 Configuration de production

- **Entitlement push (`aps-environment`) retiré.** L'app n'utilise que des notifications locales, sans serveur, donc l'App ID n'a pas besoin de la capacité Push.
- **Permission Réseau local et services Bonjour du client de développement retirés en production.**
- **Types Handoff propres à chaque variante.** Avant, un build de dev pouvait reprendre une activité de l'app de l'App Store.
- **Vulnérabilités connues : 25 → 7.** Les quatre paquets corrigés l'ont été en restant dans des versions compatibles (overrides `shell-quote`, `@xmldom/xmldom`, `source-map-js`, `zod`). Restent :
  - `decode-uri-component` (via expo-router), voir section 7 ;
  - `node-forge` et `deepmerge` : outils de build, sans correctif publié ;
  - `uuid` : outil de build.

### Durcissements sans défaut observé

- **QR code** : nombre d'ingrédients et d'étapes et longueur des lignes bornés au décodage, car n'importe qui peut fabriquer un QR.
- **Export Instagram** : taille décompressée de chaque fichier vérifiée avant décompression.
- **Recherche** : index des recettes mis en cache. Six frappes successives sur 5 000 recettes passent de 569 ms à 48 ms, mesuré avant et après.

## 5. Tests : chiffres réels

### Suite standard (`pnpm test`)

| Paquet | Tests définis | Résultat |
| --- | --- | --- |
| core | 284 | 284 réussis |
| client | 68 | 68 réussis |
| mobile | 195 | 195 réussis |
| site | 3 | 3 réussis |
| **Total** | **550** | **550 réussis, 0 échec** |

Cas générés exécutés à chaque `pnpm test`. Toutes les seeds sont fixes et le numéro de seed est affiché en cas d'échec.

| Domaine | Cas générés |
| --- | --- |
| core, propriétés et fuzzing (23 propriétés : importeurs, pages web, liens, quantités, unités, dates, durées, courses, placard, bilan, prix, recherche, règles, étapes, doublons) | 12 300 |
| client, synchro multi-appareils (3 appareils, iCloud coupé par moments, apps tuées puis relancées) | 60 scénarios, 2 400 actions |
| client, sauvegardes (aller-retour 120, fichiers endommagés 400) | 520 |
| client, brouillons d'import enregistrables | 1 600 |
| client, anciennes versions du format (300 variantes × 71 enregistrements) | 21 300 lectures d'enregistrements |
| client, stress (5 000 recettes, 9 205 enregistrements) | 1 scénario |
| mobile, propriétés (éditeur, QR, partage, images de vidéo, liste en texte) | 2 400 |
| mobile, 37 écrans montés avec données réelles, puis monkey testing | 74 tests, 925 appuis |
| mobile, parcours de bout en bout (état enregistré vérifié après chaque action) | 8 |

### Campagnes étendues (exécutées une fois chacune, résultat vérifié)

| Commande | Exécutions | Résultat |
| --- | --- | --- |
| `FUZZ_SCENARIOS=300` (synchro) | 300 scénarios, 12 000 actions | Tous les appareils identiques, aucune perte après relance |
| `MONKEY_PRESSES=200`, français | 7 400 appuis sur 37 écrans | 0 plantage, 0 avertissement React |
| `MONKEY_PRESSES=200`, anglais | 7 400 appuis sur 37 écrans | 0 plantage, 0 avertissement React |

### 5.1 Campagne de stress dev et prod (`pnpm qa:stress`)

Exécutée le 30 octobre 2026, après les corrections ci-dessus, avec `STRESS=1`. Chaque étape tourne dans son propre processus. L'app est testée deux fois, avec `APP_VARIANT=development` puis `APP_VARIANT=production` : identifiants, App Group, conteneur iCloud et textes de la variante.

| Étape (par variante pour l'app) | Exécutions | Résultat |
| --- | --- | --- |
| core : propriétés, fuzzing, 4 000 entrées pathologiques géantes sur 18 analyseurs, recherche dans 10 000 recettes | 16 800 | 284 tests réussis |
| client : 10 000 opérations simultanées puis relance ; 5 appareils en parallèle avec horloges décalées, apps tuées et iCloud instable (11 897 actions) ; suppression totale propagée ; recettes maximales et une année de planning ; 150 cycles export/import | 29 165 | 68 tests réussis |
| config native (prebuild réel puis 47 contrôles : 5 cibles, App Groups, iCloud, entitlements, noms, textes, extension de partage) | 47 × 2 | OK dev et prod |
| app : fuzzing, file de 1 500 imports avec résultats aléatoires | 3 900 × 2 | 109 tests réussis × 2 |
| app : 37 écrans montés avec données réelles, monkey testing (200 appuis par écran), parcours | 7 400 appuis × 2 | 82 tests réussis × 2 |
| app : navigation aléatoire (5 × 400 écrans ouverts, touchés et fermés pendant que les données changent en dessous) | 11 147 (dev), 10 845 (prod) | OK |
| app : très grosse bibliothèque (3 000 recettes de plus, 600 courses, 300 articles de placard) | 407 × 2 | OK |
| app : fuites (500 ouvertures et fermetures d'écran, abonnements comptés) | 500 × 2 | OK, aucun abonnement restant |
| app : 5 000 actions aléatoires sur les minuteurs de cuisine | 5 000 × 2 | OK |
| **Total** | **102 465** | **753 tests réussis, 0 échec** |

Défauts trouvés par cette campagne : n° 9 à 15 de la section 4. Les deux premières exécutions complètes avaient échoué. La première a été tuée par manque de mémoire, d'où le découpage en processus. La seconde a révélé le n° 15 sur 3 des 10 lots de navigation.

Limite connue de l'outil : Jest garde en mémoire chaque arbre rendu. La mémoire de Jest ne mesure donc pas les fuites de l'app ; elles sont mesurées en comptant les abonnements actifs (base, file d'imports, minuteurs).

### Ce qui n'est pas compté

Les assertions individuelles ne sont pas comptées comme des tests. Chaque cas généré compte une fois, même s'il contient plusieurs assertions.

### Couverture de code

Non mesurée. L'instrumentation n'est pas configurée dans le projet, et je n'ai pas voulu ajouter d'outillage sans intérêt démontré. La couverture fonctionnelle est assurée par la matrice ci-dessus : tous les écrans et tous les modules de logique.

## 6. Audits

- **Sécurité et confidentialité.**
  - Aucun secret dans le dépôt. La CI référence `secrets.EXPO_TOKEN`, ce qui est correct.
  - Aucun appel réseau autre que la lecture des pages partagées et les téléchargements de vidéos publiques ; pas de serveur, pas de compte.
  - Permissions limitées à l'usage déclaré ; descriptions fr et en à jour.
  - Les entrées externes (pages web, QR, ZIP, sauvegardes, fichiers de synchro) sont validées et bornées.
- **Performance** : voir le test de stress. Avec 5 000 recettes : réouverture de la base 150 à 200 ms, sauvegarde complète (export et import) environ 0,7 s.
- **Accessibilité** : audit statique de tous les écrans (rôles et noms, actions VoiceOver pour chaque appui long, images non inversées, texte qui suit la taille système, cibles de 44 pt) et contraste AA, AAA avec « Augmenter le contraste ».

## 7. Limites et risques restants

1. **Swift non compilé.** Concerne les 4 modules locaux, les widgets interactifs, l'extension Siri et le delegate Handoff/Spotlight. Seul le build EAS le vérifiera.
2. **Aucun essai sur simulateur ni sur appareil.** À valider à la main :
   - import d'un Reel avec texte à l'écran ;
   - PDF scanné ;
   - commandes vocales pendant la lecture à voix haute ;
   - Siri ;
   - Spotlight ;
   - Handoff ;
   - cocher une course depuis le widget ;
   - impression ;
   - QR code scanné par l'appareil photo.
3. **`decode-uri-component` (via `query-string` d'expo-router)** : vulnérabilité connue, sans correctif compatible (le correctif est en ESM seulement). Exposition faible : seuls les liens de l'app sont décodés.
4. **`expo-live-activity`** est signalé non maintenu.
5. **`APPLE_TEAM_ID`** : `336SM4755V` par défaut dans `app.config.ts`, modifiable par variable d'environnement.
6. **Planning** : un repas planifié sur un appareil pendant que la recette est supprimée sur un autre reste dans le planning avec le titre « — ». Il n'y a pas de perte de données utilisateur.
7. **Couverture de code non mesurée.**

## 8. Reproduire

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test            # suite standard
cd packages/client && FUZZ_SCENARIOS=300 npx vitest run test/fuzz.test.ts
cd apps/mobile && MONKEY_PRESSES=200 npx jest __tests__/screens.test.tsx --testTimeout=120000
cd apps/mobile && npx jest --no-cache                  # cache froid
cd apps/mobile && APP_VARIANT=production npx expo prebuild --platform ios --no-install --clean   # puis supprimer ios/
cd apps/mobile && APP_VARIANT=production npx expo export --platform ios --output-dir /tmp/dist
cd apps/mobile && npx expo-doctor
pnpm audit --prod
APP_VARIANT=production pnpm qa:native               # prebuild réel, 49 contrôles dont l'étape de bundle d'Xcode (une variante)
QA_OUT=/tmp/qa pnpm qa:stress                       # campagne complète dev et prod (environ 10 min)
```

## 9. Fichiers principaux modifiés pendant l'audit

- **Synchro, base et import** : `packages/client/src/store.ts`, `packages/client/src/cloud.ts`, `packages/client/src/repos.ts`.
- **Cœur** : `packages/core/src/sync.ts` (relations parent-enfant), `packages/core/src/quantity.ts` (format exact), `packages/core/src/search.ts` (cache d'index).
- **App** :
  - `apps/mobile/src/features/recipe/editorModel.ts` ;
  - `apps/mobile/src/lib/recipeLink.ts` ;
  - `apps/mobile/src/app/(app)/import/instagram.tsx` ;
  - `apps/mobile/src/services/importQueue.ts`, `apps/mobile/src/services/timers.ts`.
- **Configuration et dépendances** :
  - `apps/mobile/app.config.ts` (push, réseau local en prod, Handoff par variante) ;
  - `apps/mobile/modules/ios-integration` ;
  - `apps/mobile/package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`.
- **Tests ajoutés** :
  - `packages/core/src/fuzz/*` ;
  - `packages/client/test/{fuzz,drafts.fuzz,migration,stress}.test.ts`, plus des régressions dans `cloud.test.ts` et `features.test.ts` ;
  - `apps/mobile/__tests__/{fuzz,screens}.test.tsx`, plus des régressions dans `editorModel.test.ts` et `importQueue.test.ts`.
