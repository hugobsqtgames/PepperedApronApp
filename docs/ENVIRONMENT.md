# Variables d'environnement

Aucun secret n'est versionné. Modèles : `apps/api/.env.example`, `apps/mobile/.env.example`.
L'API valide toute sa configuration au démarrage (zod) et **refuse de démarrer** si une valeur de staging/production est absente ou dangereuse (stockage local, e-mails en console, Team ID factice, secret JWT d'exemple, mentions légales manquantes).

## API (`apps/api`)

| Variable | Défaut | Rôle |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test`, `staging`, `production` |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | écoute HTTP |
| `DATABASE_URL` | — | PostgreSQL (obligatoire) |
| `DATABASE_POOL_MAX` | `10` | connexions par instance |
| `JWT_SECRET` | — | ≥ 32 caractères aléatoires (`openssl rand -base64 48`) ; le changer invalide seulement les jetons d'accès en cours : les apps en obtiennent un nouveau via leur jeton de rafraîchissement, sans déconnexion |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | durée du jeton d'accès |
| `REFRESH_TOKEN_TTL_DAYS` | `90` | durée d'une session d'appareil sans utilisation |
| `API_PUBLIC_URL` | — | URL publique de l'API |
| `WEB_PUBLIC_URL` | — | URL des pages web (partage, e-mails, pages légales) ; en général le domaine principal |
| `TRUST_PROXY` | `false` | `true` derrière un load balancer (IP réelle pour le rate limiting) |
| `RUN_MIGRATIONS_ON_START` | `false` | applique les migrations au démarrage |
| `MIGRATIONS_DIR` | `drizzle` | dossier des migrations SQL (défini dans l'image Docker) |
| `STORAGE_DRIVER` | `local` | `s3` obligatoire hors développement |
| `STORAGE_LOCAL_DIR` | `.storage` | dossier du stockage local de dev |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | — | bucket S3-compatible (Cloudflare R2 recommandé) |
| `MEDIA_PUBLIC_URL` | — | URL publique (CDN) qui sert le bucket |
| `MAIL_DRIVER` | `console` | `resend` obligatoire hors développement |
| `RESEND_API_KEY`, `MAIL_FROM` | — | envoi des e-mails (domaine vérifié chez Resend : SPF, DKIM) |
| `PUSH_DRIVER` | `none` | `expo` pour les notifications distantes |
| `EXPO_ACCESS_TOKEN` | — | jeton Expo si la sécurité renforcée des push est activée |
| `APPLE_AUDIENCES` | `app.pepperedapron` | identifiants de bundle acceptés pour Sign in with Apple (séparés par des virgules ; ajoutez les variantes `.dev`, `.staging`) |
| `GOOGLE_CLIENT_IDS` | — | client IDs OAuth Google iOS, Android et Web acceptés |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | — | connexion Facebook |
| `APPLE_TEAM_ID`, `IOS_BUNDLE_ID` | — | fichier `apple-app-site-association` (universal links) |
| `ANDROID_PACKAGE`, `ANDROID_SHA256_CERT_FINGERPRINTS` | — | `assetlinks.json` (App Links) ; empreinte de la clé de signature Play |
| `APP_STORE_URL`, `PLAY_STORE_URL` | — | liens des pages web et de l'écran « mise à jour nécessaire » |
| `ADS_CONFIG` | JSON | emplacements publicitaires pilotables à distance (`enabled`, `homeNativeAfterSection`, `searchNativeEvery`) |
| `MIN_APP_VERSION` | `2.0.0` | en dessous, l'app affiche un écran bloquant de mise à jour |
| `RATE_LIMIT_ENABLED` | `true` | ne désactiver qu'en test de charge |
| `ADMIN_EMAILS` | — | comptes promus administrateurs (e-mail vérifié requis) |
| `LEGAL_PUBLISHER`, `LEGAL_ADDRESS`, `LEGAL_CONTACT_EMAIL`, `LEGAL_HOSTING` | — | mentions légales (obligatoires en production) |
| `TEST_DATABASE_URL` | `postgres://postgres@127.0.0.1:54329/pepperedapron_test` | base des tests (effacée à chaque exécution) |

## Application mobile (`apps/mobile`)

Lues au moment du build par `app.config.ts`. Les variables `EXPO_PUBLIC_*` sont **incluses dans l'application** : jamais de secret.

| Variable | Rôle |
|---|---|
| `APP_VARIANT` | `development`, `staging`, `production` (identifiant, nom, domaine, App Group) |
| `EXPO_PUBLIC_API_URL` | URL de l'API |
| `WEB_DOMAIN` | domaine des liens universels (défaut : `pepperedapron.app`, `staging.pepperedapron.app`…) |
| `APPLE_TEAM_ID` | équipe Apple (signature des cibles, App Group) |
| `EAS_PROJECT_ID` | projet EAS (push, builds) |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | connexion Google (bouton masqué si absent) |
| `EXPO_PUBLIC_FACEBOOK_APP_ID` | connexion Facebook (bouton masqué si absent) |
| `ADMOB_IOS_APP_ID`, `ADMOB_ANDROID_APP_ID` | identifiants d'application AdMob ; **obligatoires** pour un build de production, identifiants de test Google sinon |
| `EXPO_PUBLIC_ADMOB_IOS_BANNER`, `EXPO_PUBLIC_ADMOB_ANDROID_BANNER` | blocs d'annonces ; en production, absents = aucune publicité |
| `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` | rapports de plantage (facultatif) |

Pour les builds EAS, ces valeurs se définissent dans les **environnements EAS** (`development`, `preview`, `production`) : `eas env:create --environment production --name ADMOB_IOS_APP_ID --value … --visibility plaintext`. Le seul secret côté GitHub est `EXPO_TOKEN`.

## Par environnement

| | development | staging | production |
|---|---|---|---|
| Base | Postgres local | base dédiée | base managée + sauvegardes PITR |
| Stockage | disque local | bucket `pepperedapron-staging` | bucket `pepperedapron-media` + CDN |
| E-mails | console | Resend (domaine de test) | Resend |
| Publicité | identifiants de test Google | identifiants de test Google | vrais identifiants |
| App | `app.pepperedapron.dev` | `app.pepperedapron.staging` | `app.pepperedapron` |
| Domaine web | `localhost` | `staging.pepperedapron.app` | `pepperedapron.app` |
