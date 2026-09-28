# Tests

| Niveau | Où | Outil | Ce qui est couvert |
|---|---|---|---|
| Unitaires domaine | `packages/core/src/**/*.test.ts` | Vitest | fractions et quantités, conversions métrique/impérial, mise à l'échelle, parsing de lignes d'ingrédients (5 langues), texte libre, JSON-LD, recherche « langage naturel » et frigo, rayons, fusion de listes, planning, identifiants |
| Intégration API | `apps/api/test/*.test.ts` | Vitest + Fastify `inject` + **vrai PostgreSQL** | auth (inscription, connexion, OAuth simulé avec de vraies signatures JWKS, refresh rotatif et détection de vol, reset, vérification), synchro (conflits, idempotence, cascades, foyer, horizon de purge), fonctionnalités (photos, partage, communauté, signalements, admin, export, suppression de compte), configuration |
| Sécurité | `apps/api/test/security.test.ts` | Vitest | IDOR sur toutes les entités et routes, escalade de rôle, jetons falsifiés/expirés, SSRF, injections, tailles limites, rate limiting, fuite d'informations dans les erreurs |
| Client hors ligne | `packages/client/test/offline-sync.test.ts` | Vitest + better-sqlite3 + API réelle en HTTP | un iPhone et un iPad simulés (bases séparées, réseau coupable) : hors ligne, conflits, app tuée, jeton expiré, foyer, photos, planning → courses |
| Mobile | `apps/mobile/__tests__` | Jest (jest-expo) + Testing Library | parité des 5 traductions (clés et variables), modèle de l'éditeur, formatage, messages d'erreur, versions, composants |
| E2E | `apps/mobile/.maestro` | Maestro | inscription → recette → favori → courses → mode cuisine ; import de texte → recherche ; planning → liste |

Cas « absurdes » couverts entre autres : quantités `1/0`, `½`, `1 ½`, intervalles `2-3`, unités inconnues, 100 000 caractères collés, emoji dans les titres, dates hors limites, portions à 0 ou 10 000, double-clic sur Enregistrer, favori pressé 20 fois sur deux appareils, suppression pendant l'édition, token réutilisé, URL `file://` ou `http://169.254.169.254`.

## Lancer

```bash
pnpm db:local        # PostgreSQL pour les tests d'intégration (ou TEST_DATABASE_URL)
pnpm test            # tout, paquet par paquet (API et client partagent la base de test)
pnpm test:core | test:api | test:client | test:mobile
```

La base de test est **effacée** à chaque exécution : ne jamais faire pointer `TEST_DATABASE_URL` vers une vraie base.

### E2E (Maestro)

Sur Mac avec un simulateur, ou un émulateur Android, avec un build de développement installé et l'API joignable :

```bash
curl -Ls https://get.maestro.mobile.dev | bash
maestro test apps/mobile/.maestro -e APP_ID=app.pepperedapron.dev
```

Les scénarios s'appuient sur des `testID` stables (pas sur les textes traduits). Ils peuvent aussi tourner sur Maestro Cloud ou dans un workflow EAS à partir d'un build `development-simulator`.

## Intégration continue

`.github/workflows/ci.yml` à chaque push et pull request : lint, format, typecheck, tests core/API/client avec un service PostgreSQL, tests mobile, bundles Metro iOS et Android, build de l'image Docker de l'API. Une PR ne se fusionne que si tout est vert.

## Vérifications manuelles avant publication

Checklist dans [RELEASE.md](RELEASE.md#checklist-avant-soumission) : appareils réels (iPhone petit et grand écran, iPad en portrait/paysage/Split View, Android), VoiceOver/TalkBack, grande taille de texte, mode sombre, mode avion, extension de partage depuis TikTok/Instagram/Safari/Photos, widgets, Live Activity, notifications, achat de publicité en consentement refusé.
