# Installation (développement)

## 1. Outils

| Outil | Version | Remarque |
|---|---|---|
| Node.js | 22.x | `node -v` |
| pnpm | 10.33 | `corepack enable` (la version est fixée dans `package.json`) |
| Xcode | 26+ | pour iPhone/iPad, sur Mac uniquement |
| EAS CLI | ≥ 16 | `npm i -g eas-cli`, seulement pour les builds cloud |

Aucun serveur ni base de données : l'app est autonome.

## 2. Lancer l'app

```bash
pnpm install
cd apps/mobile
cp .env.example .env     # facultatif : tout a une valeur par défaut en développement
```

L'app contient des modules natifs : il faut un **build de développement** (une fois, puis à chaque ajout de module natif). Ensuite le bundler Metro suffit.

```bash
# Mac + iPhone/iPad
npx expo run:ios                      # simulateur
npx expo run:ios --device             # iPhone branché (choisir l'équipe de signature dans Xcode la 1re fois)

# Ensuite, à chaque session
npx expo start --dev-client
```

Sans Mac : `eas build --profile development --platform ios` (appareil enregistré) ou `--profile development-simulator`.

`npx expo prebuild --clean` régénère `ios/` (non versionné) à partir de `app.config.ts`.

### iCloud en développement

- La synchronisation iCloud ne fonctionne que sur un **appareil connecté à un compte iCloud** (simulateur : se connecter dans Réglages du simulateur ; c'est plus fiable sur un vrai iPhone).
- Le conteneur `iCloud.app.pepperedapron.dev` doit exister dans le compte développeur Apple : il est créé automatiquement par EAS, ou dans Xcode (*Signing & Capabilities → iCloud → CloudKit containers / iCloud Documents*) lors du premier build signé.
- Pour tester la synchro : installer le même build sur un iPhone et un iPad (ou un simulateur) avec le même identifiant Apple ; Réglages → Mes données affiche l'état.

### Variantes

`APP_VARIANT=development|staging|production` change l'identifiant (`app.pepperedapron.dev`, `.staging`, sans suffixe), le nom affiché, l'App Group et le conteneur iCloud. Les trois variantes s'installent côte à côte, chacune avec ses propres données.

## 3. Site statique

```bash
pnpm build:site                       # apps/site/dist
npx serve apps/site/dist              # aperçu local
```

## 4. Problèmes fréquents

| Symptôme | Solution |
|---|---|
| « Expo Go » ne charge pas l'app | normal : utiliser un build de développement (`npx expo run:ios`) |
| Réglages → Mes données indique « iCloud indisponible » | se connecter à iCloud sur l'appareil ; vérifier que iCloud Drive est activé |
| Les modifications n'arrivent pas sur l'autre appareil | iCloud transfère les fichiers en différé (quelques secondes à quelques minutes) ; tirer l'accueil vers le bas pour relancer |
| Widgets vides | ouvrir l'app une fois : elle écrit les données dans l'App Group |
| Échec de prebuild sur les cibles iOS | `pnpm install` doit avoir appliqué `patches/@bacons__apple-targets@5.0.0.patch` |
