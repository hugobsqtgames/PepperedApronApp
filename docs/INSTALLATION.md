# Installation (développement)

## 1. Outils

| Outil | Version | Remarque |
|---|---|---|
| Node.js | 22.x | `node -v` |
| pnpm | 10.33 | `corepack enable` (la version est fixée dans `package.json`) |
| PostgreSQL | 16 | ou `pnpm db:local` (cluster jetable, sans Docker) |
| Xcode | 26+ | pour iOS, sur Mac uniquement |
| Android Studio | récent | SDK et émulateur Android |
| EAS CLI | ≥ 16 | `npm i -g eas-cli` pour les builds cloud |

## 2. Dépendances et base de données

```bash
pnpm install
pnpm db:local            # démarre Postgres sur 127.0.0.1:54329 (bases pepperedapron et pepperedapron_test)
pnpm db:local stop       # l'arrêter
```

Avec un Postgres existant, créez les deux bases et adaptez `DATABASE_URL` / `TEST_DATABASE_URL`.

## 3. API

```bash
cp apps/api/.env.example apps/api/.env      # valeurs de dev prêtes à l'emploi
pnpm --filter @pepperedapron/api migrate    # applique apps/api/drizzle/*.sql
pnpm --filter @pepperedapron/api dev        # rechargement à chaud, http://localhost:3000
curl localhost:3000/health                  # {"ok":true}
```

En développement : e-mails affichés dans la console (liens de vérification / réinitialisation inclus), photos stockées dans `apps/api/.storage`, pas de push.

Pour devenir administrateur : mettez votre e-mail dans `ADMIN_EMAILS`, puis vérifiez l'e-mail du compte et reconnectez-vous.

## 4. Application mobile

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

- Simulateur iOS : `EXPO_PUBLIC_API_URL=http://localhost:3000`.
- Téléphone physique ou émulateur Android : utilisez l'IP du poste sur le réseau local (`http://192.168.x.y:3000`), ou `http://10.0.2.2:3000` pour l'émulateur Android.

L'app contient des modules natifs : il faut un **build de développement** (une fois), puis le bundler Metro suffit.

```bash
cd apps/mobile
npx expo run:ios                    # Mac : compile et installe sur le simulateur
npx expo run:android                # émulateur ou appareil USB
# ou, sans Mac :
eas build --profile development --platform ios     # appareil enregistré (ad hoc)
eas build --profile development-simulator --platform ios
npx expo start --dev-client         # ensuite, à chaque session
```

`npx expo prebuild --clean` régénère `ios/` et `android/` (non versionnés) à partir de `app.config.ts`.

### Variantes

`APP_VARIANT=development|staging|production` change l'identifiant (`app.pepperedapron.dev`, `.staging`, sans suffixe), le nom affiché, le domaine des liens et l'App Group. Les trois variantes s'installent côte à côte.

## 5. Problèmes fréquents

| Symptôme | Solution |
|---|---|
| `initdb: cannot be run as root` | le script bascule déjà sur l'utilisateur `postgres` ; vérifiez qu'il existe |
| L'app affiche « Pas de connexion » sur un téléphone | `EXPO_PUBLIC_API_URL` pointe sur `localhost` : utilisez l'IP du poste |
| « Sign in with Apple » échoue en dev | ajoutez `app.pepperedapron.dev` à `APPLE_AUDIENCES` côté API |
| Widgets vides | ouvrez l'app une fois connecté : elle écrit les données dans l'App Group |
| Échec de prebuild sur les cibles iOS | `pnpm install` doit avoir appliqué `patches/@bacons__apple-targets@5.0.0.patch` |
