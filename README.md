# PepperedApron

Recettes, planning de repas et listes de courses — iPhone, iPad, puis Android.
**Sans compte ni serveur** : tout est enregistré sur l'appareil et, sur iPhone/iPad, synchronisé dans l'iCloud privé de l'utilisateur. Hors ligne d'abord, sans publicité, sans IA générative.

| Dossier | Contenu |
|---|---|
| `apps/mobile` | Application Expo / React Native (iOS, iPadOS, Android) + cibles natives iOS (widgets, extension de partage, Live Activity) |
| `apps/site` | Site statique (politique de confidentialité, conditions, mentions légales, aide) en 5 langues, publié avec GitHub Pages |
| `packages/core` | Domaine pur TypeScript : schémas, quantités/unités/fractions, parseurs de recettes, import de liens, recherche, rayons, planning |
| `packages/client` | Couche données : base SQLite locale, horloge hybride, synchronisation iCloud, export/import, repositories |
| `tools/brand` | Génération du logo, de l'icône, du splash et des visuels de store |
| `docs/` | Documentation (ci-dessous) |

## Démarrage rapide

Prérequis : Node 22, pnpm 10 (`corepack enable`), et pour lancer l'app : un Mac avec Xcode 26 (iPhone/iPad) et/ou Android Studio.

```bash
pnpm install
cd apps/mobile
npx expo run:ios        # Mac : build de développement + simulateur ou iPhone branché
npx expo run:android    # émulateur ou téléphone Android branché (débogage USB)
```

Aucun serveur, aucune base à installer, aucune variable obligatoire. L'app utilise des modules natifs (iCloud, extension de partage, widgets, OCR) : **Expo Go ne suffit pas**, il faut un build de développement (voir [INSTALLATION](docs/INSTALLATION.md)). Ensuite, `npx expo start` suffit pour recharger le code.

## Vérifications

```bash
pnpm lint            # ESLint (dont règles React Hooks)
pnpm format:check    # Prettier
pnpm typecheck       # TypeScript strict, tous les paquets
pnpm test            # core, client (appareils + iCloud simulés), mobile (Jest), site
pnpm verify          # lint + typecheck + tests
```

## Documentation

- [Audit du prototype](docs/AUDIT.md) · [Architecture](docs/ARCHITECTURE.md) · [Stockage local et synchronisation iCloud](docs/SYNC.md)
- [Installation](docs/INSTALLATION.md) · [Variables d'environnement](docs/ENVIRONMENT.md)
- [Application mobile : structure, iCloud, extension de partage, widgets, Live Activities, pub](docs/MOBILE.md)
- [Tests](docs/TESTING.md)
- [Builds et publication App Store / Google Play](docs/RELEASE.md) · [Fiches store (5 langues)](docs/store/)
- [Exploitation : site, suivi des plantages, support, mises à jour](docs/OPERATIONS.md)
- [Données personnelles et RGPD](docs/PRIVACY.md) · [Identité visuelle](docs/brand/) · [Crédits photos](docs/brand/PHOTO_CREDITS.md)
