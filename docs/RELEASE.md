# Builds et publication

Phase 1 : iPhone + iPad (App Store). Phase 2 : Android (Google Play). Le même code sert les deux ; seule la publication diffère.

## 1. Prérequis (une seule fois)

### Comptes
- Apple Developer Program (99 $/an), accès App Store Connect.
- Google Play Console (25 $ une fois) — phase 2.
- Compte Expo (EAS) ; `eas login` puis `cd apps/mobile && eas init` → renseigner `EAS_PROJECT_ID`.
- AdMob : une app iOS et une app Android, un bloc d'annonce natif/bannière par plateforme ; message de consentement UMP (RGPD) et message IDFA (ATT) publiés dans AdMob → *Confidentialité et messages*.

### Identifiants Apple
Dans *Certificates, Identifiers & Profiles* (EAS peut les créer automatiquement au premier build) :
- App IDs : `app.pepperedapron` (+ `.staging`, `.dev`), capacités **Sign in with Apple**, **App Groups** (`group.app.pepperedapron`…), **Associated Domains**, **Push Notifications**.
- Cibles supplémentaires créées par le prebuild : extension de partage, widgets, Live Activity — même App Group.
- Clé APNs (EAS la gère : `eas credentials`).

### Domaines
- `pepperedapron.app` (production) et `staging.pepperedapron.app` pointent vers l'API : elle sert `/.well-known/apple-app-site-association` et `/.well-known/assetlinks.json`, qui dépendent de `APPLE_TEAM_ID` et `ANDROID_SHA256_CERT_FINGERPRINTS`.
- Vérification : `curl https://pepperedapron.app/.well-known/apple-app-site-association`.

### Connexion sociale
- Google Cloud : clients OAuth iOS, Android (empreinte SHA-256 de signature Play) et Web ; ajouter leurs IDs à `GOOGLE_CLIENT_IDS` (API) et `EXPO_PUBLIC_GOOGLE_*` (app).
- Meta for Developers : app Facebook Login (iOS : bundle IDs ; Android : package + hash de clé) ; `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET` (API), `EXPO_PUBLIC_FACEBOOK_APP_ID` (app). Passer l'app Meta en mode *Live*.
- Apple : `APPLE_AUDIENCES` = bundle IDs des variantes utilisées.

### Variables EAS
`eas env:create` pour chaque environnement (`development`, `preview` = staging, `production`) : voir [ENVIRONMENT.md](ENVIRONMENT.md#application-mobile-appsmobile). Un build de production **échoue volontairement** sans identifiants AdMob réels.

## 2. Builds

| Profil | Usage | Commande |
|---|---|---|
| `development` | client de dev sur appareils enregistrés | `eas build -p ios --profile development` |
| `development-simulator` | client de dev pour le simulateur | `eas build -p ios --profile development-simulator` |
| `staging` | testeurs internes (ad hoc iOS, APK Android), API de staging | `eas build -p all --profile staging` |
| `production` | stores | `eas build -p all --profile production` |

Depuis GitHub : *Actions → Mobile build & submit* (profil, plateforme, soumission). Le numéro de build est incrémenté par EAS (`appVersionSource: remote`) ; la version marketing est `version` dans `app.config.ts`.

Build local (Mac) : `APP_VARIANT=production npx expo prebuild --clean && npx expo run:ios --configuration Release`.

## 3. App Store (iOS / iPadOS)

1. App Store Connect → *Apps* → nouvelle app : nom « PepperedApron: Recettes & Menu » (FR) — [fiches](store/), bundle `app.pepperedapron`, SKU `pepperedapron-ios`.
2. Ajouter `"ios": { "ascAppId": "<id numérique>" }` sous `submit.production` dans `eas.json` pour la soumission non interactive.
3. `eas build -p ios --profile production --auto-submit` → TestFlight.
4. TestFlight : tests internes, puis groupe externe (revue bêta) — [checklist](#checklist-avant-soumission).
5. Fiche : textes des 5 langues, captures iPhone 6,9″ et iPad 13″, URL d'assistance `/support`, confidentialité `/legal/privacy`, catégorie, classification (4+, contenu généré par les utilisateurs modéré).
6. **Confidentialité de l'app** (étiquettes) : voir [PRIVACY.md](PRIVACY.md#étiquettes-app-store-et-google-play). Doit correspondre au manifeste `NSPrivacyCollectedDataTypes` d'`app.config.ts`.
7. Informations pour la revue : compte de démonstration, notes (import, publicité absente du mode cuisine, suppression de compte).
8. Soumettre ; publication manuelle ou progressive (*phased release*, 7 jours).

## 4. Google Play (phase 2)

1. Play Console → créer l'app, package `app.pepperedapron`, gratuite, contient des annonces.
2. Premier envoi manuel de l'AAB (`eas build -p android --profile production`) pour activer la signature Play ; récupérer l'empreinte SHA-256 de la **clé de signature d'app** → `ANDROID_SHA256_CERT_FINGERPRINTS` (API) et clients OAuth Google/Facebook.
3. Compte de service Google pour `eas submit` (Play Console → API access) ; `eas credentials` pour l'associer.
4. Fiche : textes ([store](store/)), bannière `docs/store/assets/feature-graphic-<langue>.png`, captures téléphone et tablette.
5. *Sécurité des données* : [PRIVACY.md](PRIVACY.md#étiquettes-app-store-et-google-play). *Annonces* : oui. *Public cible* : 13+ recommandé (contenu communautaire). Déclaration de l'autorisation d'alarme exacte : minuteurs de cuisine demandés par l'utilisateur.
6. Pistes : interne → fermée → production en déploiement progressif (10 % → 50 % → 100 %). `eas submit` envoie sur la piste `internal` en brouillon (voir `eas.json`).

## 5. Versions et mises à jour

- Version sémantique dans `app.config.ts` (`version`) ; changement majeur de l'API → augmenter `MIN_APP_VERSION` côté serveur **après** que la nouvelle version est disponible dans les stores.
- Pas de mise à jour OTA configurée : chaque changement passe par un build et la revue des stores. (Ajouter `expo-updates` plus tard permettrait des correctifs JavaScript rapides ; `runtimeVersion` est déjà défini sur la version de l'app.)
- Notes de version : dans les 5 langues, courtes, orientées bénéfice.

## Checklist avant soumission

- [ ] `pnpm verify` vert, CI verte, E2E Maestro verts sur iOS et Android.
- [ ] iPhone SE / iPhone Pro Max / iPad (portrait, paysage, Split View, Stage Manager) / Android petit et grand écran.
- [ ] Mode sombre, taille de texte maximale, VoiceOver et TalkBack sur les parcours principaux.
- [ ] Mode avion : créer, modifier, supprimer, planifier, cocher ; retour réseau → tout synchronisé, rien en double.
- [ ] Deux appareils sur le même compte + un membre du foyer : modifications croisées.
- [ ] Partage depuis TikTok, Instagram, Safari, Photos, Notes, Messages (iOS) et Chrome, Galerie (Android), app fermée et ouverte, connecté et déconnecté.
- [ ] Liens `/r/`, `/p/`, `/join/`, e-mails de vérification et de réinitialisation : ouvrent l'app installée, la page web sinon.
- [ ] Widgets (4), Live Activity d'un minuteur, notifications (rappel, fin de minuteur, foyer).
- [ ] Consentement refusé : aucune publicité personnalisée, l'app fonctionne ; accepté : annonces visibles hors mode cuisine.
- [ ] Sign in with Apple / Google / Facebook ; suppression de compte ; export.
- [ ] Captures et textes à jour dans les 5 langues ; pages `/support` et `/legal/*` en ligne avec les vraies mentions.
- [ ] `MIN_APP_VERSION` inchangé (ou volontairement relevé).
