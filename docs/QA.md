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

Huit défauts réels ont été trouvés et corrigés, chacun avec un test de régression qui échoue sans la correction (section 4). La campagne a aussi produit des correctifs de dépendances, de sécurité et de performance.

## 2. Stack et environnement

- **Monorepo pnpm** :
  - `packages/core` : logique pure, Vitest ;
  - `packages/client` : base locale SQLite, synchronisation iCloud, Vitest ;
  - `apps/mobile` : Expo SDK 57, React Native 0.86, expo-router, Jest via jest-expo/ios ;
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
| core | 281 | 281 réussis |
| client | 60 | 60 réussis |
| mobile | 188 | 188 réussis |
| site | 3 | 3 réussis |
| **Total** | **532** | **532 réussis, 0 échec** |

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
5. **`APPLE_TEAM_ID`** doit être défini dans les variables d'environnement EAS (`apple-targets` le signale).
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
