# Tests réellement exécutés

Exécutés le 1er novembre 2026 dans l'environnement d'audit (Linux, Node 22). Aucun résultat n'est inventé. Ce qui n'a pas pu être exécuté est listé à la fin.

## 1. Vérification standard — `pnpm verify` (lint + types + tous les tests)

| Suite | Résultat |
|---|---|
| ESLint (tout le dépôt) | 0 erreur, 0 avertissement |
| TypeScript (tous les paquets) | 0 erreur |
| Prettier | conforme |
| Site (`apps/site`) | 5 / 5 |
| Logique (`packages/core`, Vitest) | 354 / 354 |
| Base locale et synchro (`packages/client`, Vitest) | 70 / 70 |
| App (`apps/mobile`, Jest + vraie base SQLite) | 258 / 258 |

## 2. Configuration native — `pnpm qa:native` (prebuild Expo réel, puis contrôles)

| Variante | Contrôles | Résultat |
|---|---|---|
| Production | 70 | OK |
| Développement | 69 | OK |

Ce qui est vérifié :
- les 5 cibles et leurs identifiants ;
- l'App Group et iCloud ;
- l'absence d'entitlement push ;
- les textes d'autorisation FR et EN ;
- le chiffrement déclaré ;
- l'absence d'exception ATS en production ;
- les 4 manifestes de confidentialité (raison 1C8F.1, aucun suivi, rien de collecté) ;
- l'extension de partage ;
- la phase de bundle JavaScript d'Xcode.

**Contre-épreuve** : manifeste des widgets retiré → 4 contrôles en échec, comme attendu.

## 3. Campagne de stress dev et prod — `pnpm qa:stress` (8 h 25, 1er novembre 2026)

| Étape (par variante pour l'app) | Exécutions | Résultat |
|---|---|---|
| core : propriétés, fuzzing, entrées géantes et pathologiques, recherche dans 10 000 recettes | 16 800 | 354 tests OK |
| client : opérations simultanées, 5 appareils et iCloud instable, export et import, recettes maximales, migrations (300 versions anciennes) | 29 165 | 70 tests OK |
| site | — | 5 tests OK |
| config native | 69 (dev) + 70 (prod) | OK |
| app : fuzzing, file d'imports | — | 131 tests OK × 2 |
| app : chaque écran avec données réelles, 200 appuis aléatoires par écran (monkey testing), parcours | 9 600 appuis × 2 | 123 tests OK × 2 |
| app : navigation aléatoire pendant que les données changent (5 lots) | 10 520 (dev) + 10 612 (prod) écrans | OK |
| app : très grosse bibliothèque | 530 × 2 | OK |
| app : fuites (ouverture et fermeture d'écrans, abonnements comptés) | 500 × 2 | OK, aucun abonnement restant |
| app : actions aléatoires sur les minuteurs | 5 000 × 2 | OK |
| **Total** | **98 496** | **953 tests réussis, 0 échec** |

## 4. Tests ajoutés pendant cet audit et les correctifs qui l'ont précédé

Chacun a été vérifié **en échec sans la correction**, puis **vert avec**.

| Test | Couvre |
|---|---|
| Premier lancement : diapositives → prénom → 10 recettes → tutoriel | Premier contact, guideline 2.1 |
| Premier lancement : tout passer | Pas de donnée imposée |
| Chaque écran sur une bibliothèque vide (rendu + 5 appuis) | États vides |
| Bibliothèque enregistrée par une ancienne version : tous les champs facultatifs retirés, base rouverte, chaque écran rendu et touché | Mise à jour (cause du plantage du mode cuisine) |
| Accords avec alcool absents par défaut, présents une fois activés | Classification d'âge |
| Live Activity : début, fin à l'arrêt de la recette, fin quand le minuteur expire, remplacement si l'utilisateur l'a balayée (4 tests) | Dynamic Island |
| Carte d'accueil avec transition zoom : largeur conservée (2 tests) | Mise en page |
| Migration : réglages `compactLists` et `alcoholPairings` absents → valeurs par défaut | Mise à jour |

## 5. Autres contrôles

| Contrôle | Résultat |
|---|---|
| `pnpm audit --prod` | 20 avis → 8 après la mise à jour de node-forge. Les avis restants concernent uniquement les outils de build (CLI Expo, plugins), non embarqués |
| URL publiques (aide, confidentialité, mentions légales FR et EN) | 200 (avec `/` final) |
| Icône 1024×1024 | RVB, sans canal alpha |
| Recherche de secrets dans le dépôt | Aucun |
| Syntaxe des fichiers `Localizable.strings` ajoutés | Valide |

## 6. Non exécuté ici (et pourquoi)

| Test | Raison | Alternative |
|---|---|---|
| Compilation Xcode, archive Release, validation de l'archive | Pas de macOS ni de Xcode dans cet environnement | EAS compile chaque build sur macOS. Les builds 6 à 11 ont été acceptés par App Store Connect. Le prochain build compilera les nouveaux fichiers (manifestes, localisations) |
| XCTest et XCUITest, simulateur, appareil physique | Aucun simulateur ni appareil iOS | Écrans testés sous Jest avec le vrai code et une vraie base. Parcours manuel à faire sur iPhone et iPad (REMAINING_ACTIONS 11 à 14) |
| Rendu visuel réel (tailles d'écran, mode sombre, rotation) | Pas de rendu iOS | Audit automatique d'accessibilité et de contrastes. Vérification manuelle demandée |
| Réseau réel vers les réseaux sociaux depuis l'iPhone | Exécuté sur l'appareil seulement | Analyseurs testés sur des pages enregistrées. Test manuel demandé |
