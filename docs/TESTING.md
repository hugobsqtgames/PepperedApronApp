# Tests

| Niveau | Où | Outil | Ce qui est couvert |
|---|---|---|---|
| Unitaires domaine | `packages/core/src/**/*.test.ts` | Vitest | fractions et quantités, conversions métrique/impérial, mise à l'échelle, parsing de lignes d'ingrédients (5 langues), texte libre, JSON-LD, import de liens (légendes TikTok, descriptions YouTube, recettes dites à l'oral via les sous-titres, schema.org, OpenGraph, hors ligne, liens invalides), recherche « langage naturel » et frigo, rayons, fusion de listes, planning, identifiants |
| Données et synchro | `packages/client/test/*.test.ts` | Vitest + better-sqlite3 + faux iCloud | horloge logique hybride ; store local (persistance après redémarrage, tombstones, validation, cascades, ids déterministes, fusion) ; iPhone, iPad et autres appareils simulés partageant un iCloud : hors ligne, conflits, suppressions, mauvaise date, fichiers en cours de téléchargement ou tronqués, écriture interrompue, format futur, photos, effacement global, export/import |
| Mobile | `apps/mobile/__tests__` | Jest (jest-expo) + Testing Library | parité des 5 traductions (clés et variables), modèle de l'éditeur, formatage, messages d'erreur, contraste WCAG des couleurs, composants |
| Site | `apps/site/src/build.test.mjs` | `node:test` | chaque page liée par l'app existe dans les 5 langues, échappement des mentions, refus de publier sans mentions légales |
| E2E | `apps/mobile/.maestro` | Maestro | premier lancement → recette → favori → courses → mode cuisine ; import de texte → recherche ; planning → liste |

Cas « absurdes » couverts entre autres : quantités `1/0`, `½`, `1 ½`, intervalles `2-3`, unités inconnues, 100 000 caractères collés, emoji dans les titres, dates hors limites, portions à 0 ou 10 000, double-clic sur Enregistrer, favori pressé 20 fois, suppression pendant l'édition, URL `file://` ou `javascript:`, sauvegarde corrompue.

## Lancer

```bash
pnpm test            # tout
pnpm test:core | test:client | test:mobile | test:site
```

### E2E (Maestro)

Sur Mac avec un simulateur, ou un émulateur Android, avec un build de développement installé (aucun serveur nécessaire) :

```bash
curl -Ls https://get.maestro.mobile.dev | bash
maestro test apps/mobile/.maestro -e APP_ID=app.pepperedapron.dev
```

Les scénarios s'appuient sur des `testID` stables (pas sur les textes traduits).

## Intégration continue

`.github/workflows/ci.yml` à chaque push et pull request : lint, format, typecheck, tests core/client/site, tests mobile, bundles Metro iOS et Android.

## Vérifications manuelles avant publication

Checklist dans [RELEASE.md](RELEASE.md#checklist-avant-soumission) : appareils réels (iPhone petit et grand écran, iPad en portrait/paysage/Split View, Android), synchro iCloud entre iPhone et iPad, VoiceOver/TalkBack, grande taille de texte, mode sombre, mode avion, extension de partage depuis TikTok/Instagram/Safari/Photos, widgets, Live Activity, notifications.
