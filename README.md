# PepperedApron

Recettes, planning de repas et listes de courses — iPhone, iPad, puis Android.
Hors ligne d'abord, synchronisé entre appareils et avec son foyer, sans IA générative.

| Dossier | Contenu |
|---|---|
| `apps/mobile` | Application Expo / React Native (iOS, iPadOS, Android) + cibles natives iOS (widgets, extension de partage, Live Activity) |
| `apps/api` | API REST Fastify + PostgreSQL, pages web (liens de partage, pages légales, universal links) |
| `packages/core` | Domaine pur TypeScript : schémas, quantités/unités/fractions, parseurs de recettes, recherche, rayons, planning, protocole de synchro |
| `packages/client` | Couche données du client : base SQLite locale, outbox, moteur de synchro, client HTTP |
| `tools/brand` | Génération du logo, de l'icône, du splash et des visuels de store |
| `docs/` | Documentation (ci-dessous) |

## Démarrage rapide

Prérequis : Node 22, pnpm 10 (`corepack enable`), PostgreSQL 16 (ou le script local), et pour l'app : un Mac avec Xcode 26 ou un compte EAS.

```bash
pnpm install
pnpm db:local                                  # PostgreSQL jetable sur le port 54329
cp apps/api/.env.example apps/api/.env
pnpm --filter @pepperedapron/api migrate
pnpm --filter @pepperedapron/api dev           # http://localhost:3000

cp apps/mobile/.env.example apps/mobile/.env
cd apps/mobile && npx expo run:ios             # build de développement sur simulateur
```

L'app utilise des modules natifs (extension de partage, widgets, publicité, OCR) : **Expo Go ne suffit pas**, il faut un build de développement (voir [INSTALLATION](docs/INSTALLATION.md)).

## Vérifications

```bash
pnpm lint            # ESLint (dont règles React Hooks)
pnpm format:check    # Prettier
pnpm typecheck       # TypeScript strict, tous les paquets
pnpm test            # core, API (Postgres réel), client (appareils simulés), mobile (Jest)
pnpm verify          # les trois premiers + tests
```

## Documentation

- [Audit du prototype](docs/AUDIT.md) · [Architecture](docs/ARCHITECTURE.md) · [Synchronisation](docs/SYNC.md)
- [Installation](docs/INSTALLATION.md) · [Variables d'environnement](docs/ENVIRONMENT.md)
- [Backend : API, base, migrations, auth, stockage, e-mails, notifications](docs/BACKEND.md)
- [Application mobile : structure, extension de partage, widgets, Live Activities, liens profonds, pub](docs/MOBILE.md)
- [Tests](docs/TESTING.md)
- [Builds et publication App Store / Google Play](docs/RELEASE.md) · [Fiches store (5 langues)](docs/store/)
- [Exploitation : déploiement, surveillance, rollback, sauvegardes, maintenance](docs/OPERATIONS.md)
- [Données personnelles et RGPD](docs/PRIVACY.md) · [Identité visuelle](docs/brand/) · [Crédits photos](docs/brand/PHOTO_CREDITS.md)
