# Variables d'environnement

Aucun secret n'est versionné et **aucune variable n'est obligatoire en développement**. Modèle : `apps/mobile/.env.example`.

## Application mobile (`apps/mobile`)

Lues au moment du build par `app.config.ts`. Les variables `EXPO_PUBLIC_*` sont **incluses dans l'application** : jamais de secret.

| Variable | Rôle |
|---|---|
| `APP_VARIANT` | `development`, `staging`, `production` (identifiant, nom, App Group, conteneur iCloud) |
| `APPLE_TEAM_ID` | équipe Apple (signature des cibles, App Group, iCloud) ; par défaut `336SM4755V` |
| `EAS_PROJECT_ID` | projet EAS (builds) |
| `SITE_URL` | site public (défaut `https://pepperedapron.app`) : l'app y ouvre l'aide et les pages légales |
| `SUPPORT_EMAIL` | adresse affichée dans Aide (défaut `support@pepperedapron.app`) |

Pour les builds EAS, ces valeurs se définissent dans les **environnements EAS** (`development`, `preview`, `production`) : `eas env:create --environment production --name APPLE_TEAM_ID --value … --visibility plaintext`. Le seul secret côté GitHub est `EXPO_TOKEN`.

## Site (`apps/site`)

Variables du dépôt GitHub (*Settings → Secrets and variables → Actions → Variables*), lues par le workflow `site.yml` :

| Variable | Rôle |
|---|---|
| `LEGAL_PUBLISHER` | éditeur (nom ou société) |
| `LEGAL_ADDRESS` | adresse postale de l'éditeur |
| `LEGAL_HOSTING` | hébergeur du site (ex. « GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis ») |
| `SUPPORT_EMAIL` | contact (aide, confidentialité) |
| `SITE_DOMAIN` | domaine personnalisé (`pepperedapron.app`) → fichier `CNAME` |

Le build de production (`--production`) **échoue** si l'une des quatre premières manque.

## Par environnement

| | development | staging | production |
|---|---|---|---|
| App | `app.pepperedapron.com.dev` | `app.pepperedapron.com.staging` | `app.pepperedapron.com` |
| Conteneur iCloud | `iCloud.app.pepperedapron.com.dev` (environnement Development) | `iCloud.app.pepperedapron.com.staging` | `iCloud.app.pepperedapron.com` |
