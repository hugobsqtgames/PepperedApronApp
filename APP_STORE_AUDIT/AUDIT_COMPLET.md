# Audit complet — PepperedApron 2.0.0 (iOS)

Date : 1er novembre 2026 · Branche `claude/pepperedapron-mobile-app-5vzcqv`.

## Résumé

L'app est **techniquement prête pour une soumission** : la configuration est conforme, les tests sont verts, et la fiche, les déclarations et les notes de vérification sont prêtes. La décision appartient à Apple : aucune approbation ne peut être garantie.

**12 corrections** ont été faites pendant cet audit (voir [CORRECTIONS_EFFECTUEES.md](CORRECTIONS_EFFECTUEES.md)). Les plus importantes :
- manifestes de confidentialité manquants (widgets, Siri, extension de partage) ;
- une phrase fausse dans la description ;
- une politique de confidentialité incomplète ;
- un risque d'erreur au premier lancement ;
- les accords avec alcool, désormais facultatifs, pour la classification d'âge.

**Trois risques de refus restent**, tous liés à des décisions qui t'appartiennent (voir [REMAINING_ACTIONS.md](REMAINING_ACTIONS.md)) :
1. captures d'écran et vidéo reconstituées, conservées à ta demande (2.3.3 / 2.3.4) ;
2. téléchargement temporaire de vidéos publiques pour les transcrire (5.2.3) ;
3. classification 13+ tant que l'app peut suggérer de l'alcool.

## Environnement et technologie

- **Monorepo pnpm** :
  - `apps/mobile` : Expo SDK 58, React Native 0.88, Hermes, expo-router ;
  - `packages/core` : logique et analyseurs, TypeScript ;
  - `packages/client` : base locale SQLite et synchro iCloud ;
  - `apps/site` : site statique sur GitHub Pages.
- **Code natif** :
  - 5 modules Swift locaux : `text-vision`, `video-speech`, `voice-commands`, `pdf-text`, `ios-integration` ;
  - 4 cibles d'extension : partage, widgets, Siri, Live Activity.
- **Build** : EAS (cloud Expo), envoi vers App Store Connect par GitHub Actions.
- **Limites de l'environnement d'audit** :
  - Linux, sans Xcode, sans simulateur ni appareil iOS ;
  - le code Swift n'a pas été compilé ici : il l'est par EAS à chaque build, et les builds 6 à 11 ont été acceptés par App Store Connect ;
  - aucun test XCTest ou XCUITest n'est possible ici. Les écrans sont testés sous Jest avec le vrai code et une vraie base SQLite, les modules natifs étant simulés.

## Ce qui a été inspecté

| Domaine | Méthode | Résultat |
|---|---|---|
| Règles Apple | Pages officielles lues le 1er novembre 2026 ([SOURCES.md](SOURCES.md)) | Synthèse dans [APPLE_GUIDELINES.md](APPLE_GUIDELINES.md) |
| Configuration iOS de production | `expo prebuild` (production) ; lecture d'Info.plist, des entitlements, des manifestes et du projet Xcode | 3 manifestes corrigés ou ajoutés, exception ATS retirée |
| Écrans et routes | 46 écrans listés ; chaque écran rendu avec de vraies données, sur une base vide et sur une bibliothèque « ancienne » | Défaut du premier lancement corrigé ; aucun écran caché ou de débogage |
| Autorisations | Recherche de chaque demande dans le code | Toutes demandées à l'usage ; textes FR et EN complets |
| Réseau | Recherche de chaque `fetch` et de chaque domaine | Seulement les liens partagés par l'utilisateur et Open Food Facts ; sans cookie ; User-Agent honnête |
| Données et sécurité | Lecture du stockage, des journaux, des fichiers temporaires, des secrets | Voir [PRIVACY_AUDIT.md](PRIVACY_AUDIT.md) |
| Dépendances | `pnpm audit --prod` | 1 corrigée ; 5 avis restants, tous dans les outils de build (non embarqués) |
| Propriété intellectuelle | Icône, polices, photos, recettes de bienvenue | Icône maison, police Fraunces (OFL), photos Unsplash (licence documentée), recettes rédigées pour l'app |
| Fiche App Store | Textes, limites, URL, cohérence avec les fonctions réelles | 1 phrase fausse corrigée ; URL vérifiées |
| Visuels | Icône (taille, alpha), captures (tailles) | Icône conforme ; captures aux bonnes tailles mais reconstituées (laissées à ta demande) |
| Accessibilité, HIG | Audit automatique de chaque écran (rôles, noms, actions VoiceOver, Smart Invert, Dynamic Type) ; contrastes AA | Vert ; widgets et Siri localisés |
| Classification d'âge | Définitions 2026 appliquées au contenu réel | Alcool rendu facultatif ; 13+ attendu |

## Double audit (phase 11)

- **Reviewer strict** :
  - premier lancement sans compte, testé ;
  - aucune autorisation au lancement ;
  - description exacte ;
  - politique accessible dans l'app et sur la fiche ;
  - notes de vérification détaillées, avec chaque fonction à tester ;
  - points faibles restants : visuels reconstitués et vidéos téléchargées (documentés).
- **Ingénieur iOS** :
  - données relues après une mise à jour (cause du plantage du mode cuisine) : couvertes par un test qui enlève tous les champs facultatifs ;
  - Live Activity : ids conservés entre les lancements, mises à jour en série, tests ;
  - `scrollToIndex` : sécurisé partout (onboarding corrigé, mode cuisine déjà avec `getItemLayout`).
- **Sécurité** :
  - ATS strict ;
  - aucun secret ;
  - entrées non fiables bornées en taille et en temps ;
  - schémas validés ;
  - journaux sans données personnelles.
- **Nouvel utilisateur** :
  - parcours guidé, 10 recettes pour commencer, astuces ;
  - écran de vérification après un import ;
  - message clair si une erreur survient (au lieu d'une fermeture).
