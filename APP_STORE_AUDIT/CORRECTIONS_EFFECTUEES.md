# Corrections effectuées

Toutes sont commitées sur `claude/pepperedapron-mobile-app-5vzcqv`. Chacune a un test ou un contrôle automatique qui échoue sans la correction, sauf mention contraire.

## Pendant cet audit (1er novembre 2026)

| # | Problème | Gravité | Correction | Fichiers |
|---|---|---|---|---|
| A1 | Les extensions **widgets** et **Siri** lisent `UserDefaults(suiteName:)` (Required Reason API) **sans manifeste de confidentialité** | Haute (exigence Apple depuis le 1er mai 2024) | Manifestes ajoutés (raison 1C8F.1, aucun suivi, rien de collecté) | `apps/mobile/targets/widgets/PrivacyInfo.xcprivacy`, `apps/mobile/targets/intents/PrivacyInfo.xcprivacy` |
| A2 | Le manifeste de l'**extension de partage** déclarait `CA92.1` alors qu'elle lit le groupe d'apps | Haute | Plugin de configuration qui ajoute 1C8F.1 après la génération du plugin `expo-share-intent` | `apps/mobile/app.config.ts` (`withShareExtensionPrivacy`) |
| A3 | Exception ATS `NSAllowsLocalNetworking` présente en **production** (inutile, sert au client de développement) | Moyenne | Retirée en production | `apps/mobile/app.config.ts` (`withoutDevNetworkInProduction`) |
| A4 | Ces trois points n'étaient pas contrôlés | — | 17 contrôles ajoutés à `qa:native` : 4 manifestes × 4 contrôles, plus l'absence d'exception ATS. Vérifié : un manifeste retiré fait échouer le contrôle | `tools/qa/native-check.mjs` |
| A5 | Noms des widgets **en français seulement**, titres Siri **en anglais seulement**, alors que l'app est bilingue | Moyenne (cohérence, HIG) | Fichiers `Localizable.strings` FR et EN dans les deux extensions | `apps/mobile/targets/{widgets,intents}/{fr,en}.lproj/Localizable.strings` |
| A6 | Fiche App Store : « Tout fonctionne hors ligne » est **faux** pour l'import d'un lien et la recherche d'un code-barres | Haute (2.3.1) | Texte corrigé en FR et EN | `docs/store/listings.json` |
| A7 | Politique de confidentialité incomplète : ni publications sociales et vidéo temporaire, ni Facebook / Threads / Pinterest, ni sauvegardes hebdomadaires, notifications locales, commandes vocales ou hébergeur du site | Haute (5.1.1, 5.1.2, RGPD) | Sections ajoutées en FR et EN, date mise à jour. FAQ du site alignée sur le fonctionnement réel | `apps/site/src/content.mjs` |
| A8 | **Premier lancement** : « Suivant » et « Passer » appelaient `scrollToIndex` sans `getItemLayout`, ce qui lève une erreur si la diapositive cible n'est pas encore mesurée | Haute (2.1, premier écran vu par App Review) | `getItemLayout` ajouté ; la page change tout de suite | `apps/mobile/src/app/onboarding.tsx` |
| A9 | Premier lancement **jamais testé** | — | 3 parcours : tout accepter, tout passer, chaque écran sur une bibliothèque vide | `apps/mobile/__tests__/screens.test.tsx` |
| A10 | Accords **vin, bière, cidre** proposés sur la plupart des recettes : références fréquentes à l'alcool pour le questionnaire d'âge | Moyenne (classification d'âge) | Désactivés par défaut, réglage « Suggérer aussi du vin, de la bière ou du cidre » (Apparence). La boisson sans alcool reste toujours proposée | `packages/core/src/schemas.ts`, `packages/core/src/sync.ts` (format de données 7), `apps/mobile/src/app/(app)/recipe/[id]/index.tsx`, `apps/mobile/src/app/(app)/profile/appearance.tsx`, i18n |
| A11 | Liens du site ouverts depuis l'app sans `/` final (redirection 301) | Basse | `/` final ajouté | `apps/mobile/src/services/env.ts` |
| A12 | `node-forge` vulnérable dans le CLI Expo (outil de build) | Basse (non embarqué) | Forcé en 1.4.2 | `pnpm-workspace.yaml`, `pnpm-lock.yaml` |

## Juste avant l'audit (31 octobre et 1er novembre, builds 9 à 11)

| # | Problème | Correction |
|---|---|---|
| B1 | Le mode cuisine **fermait l'app** sur les recettes enregistrées par une ancienne version (`stepNotes` absent) | Les enregistrements relus reçoivent les valeurs par défaut (`LocalStore.fromRow`). Test sur une bibliothèque « ancienne » |
| B2 | Une erreur non rattrapée fermait l'app | Écran d'erreur avec « Envoyer le détail » (`ErrorBoundary`, `crashGuard`) |
| B3 | Le minuteur restait **pour toujours** dans la Dynamic Island | L'activité se termine avec le dernier minuteur, à la fin de la recette, et au lancement si elle date d'un lancement précédent. 4 tests |
| B4 | Les cartes de l'accueil perdaient leur largeur avec la transition zoom | Style statique sous `Link asChild`. Test |
| B5 | Gros emojis coupés | Hauteur de ligne corrigée |
| B6 | Imports bloqués sur « En attente » | Un partage = un import (URL canonique). Test |

## Non modifié, à ta demande

- Captures d'écran, photos et vidéo d'aperçu de la fiche App Store : laissées telles quelles (voir REMAINING_ACTIONS, point 1).
