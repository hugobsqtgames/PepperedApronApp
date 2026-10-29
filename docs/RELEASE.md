# Builds et publication

Phase 1 : iPhone + iPad (App Store). Phase 2 : Android (Google Play). Le même code sert les deux ; seule la publication diffère.

## 1. Prérequis (une seule fois)

### Comptes
- Apple Developer Program (99 $/an), accès App Store Connect.
- Google Play Console (25 $ une fois) — phase 2.
- Compte Expo (EAS) ; `eas login` puis `cd apps/mobile && eas init` → renseigner `EAS_PROJECT_ID`.

### Identifiants Apple
Dans *Certificates, Identifiers & Profiles* (EAS peut les créer automatiquement au premier build) :
- App IDs : `app.pepperedapron` (+ `.staging`, `.dev`), capacités **iCloud** (*iCloud Documents*, conteneur `iCloud.app.pepperedapron`, `.staging`, `.dev`), **App Groups** (`group.app.pepperedapron`…), **Push Notifications** (ajoutée par `expo-notifications` ; seules des notifications locales sont utilisées).
- Cibles supplémentaires créées par le prebuild : extension de partage, widgets, Live Activity — même App Group.

### Site
- Activer GitHub Pages (*Settings → Pages → Source : GitHub Actions*), renseigner les variables `LEGAL_*`, `SUPPORT_EMAIL`, `SITE_DOMAIN` ([ENVIRONMENT](ENVIRONMENT.md#site-appssite)) puis lancer *Actions → Website*.
- Domaine `pepperedapron.app` : enregistrements DNS GitHub Pages, HTTPS forcé. Vérifier `https://pepperedapron.app/fr/privacy/`.

### Variables EAS
`eas env:create` pour chaque environnement (`development`, `preview` = staging, `production`) : voir [ENVIRONMENT.md](ENVIRONMENT.md#application-mobile-appsmobile).

## 2. Builds

| Profil | Usage | Commande |
|---|---|---|
| `development` | client de dev sur appareils enregistrés | `eas build -p ios --profile development` |
| `development-simulator` | client de dev pour le simulateur | `eas build -p ios --profile development-simulator` |
| `staging` | testeurs internes (ad hoc iOS, APK Android), données séparées | `eas build -p all --profile staging` |
| `production` | stores | `eas build -p all --profile production` |

Depuis GitHub : *Actions → Mobile build & submit* (profil, plateforme, soumission). Le numéro de build est incrémenté par EAS (`appVersionSource: remote`) ; la version marketing est `version` dans `app.config.ts`.

Build local (Mac) : `APP_VARIANT=production npx expo prebuild --clean && npx expo run:ios --configuration Release`.

## 3. App Store (iOS / iPadOS)

1. App Store Connect → *Apps* → nouvelle app : nom « PepperedApron: Recettes & Menu » (FR) — [fiches](store/), bundle `app.pepperedapron`, SKU `pepperedapron-ios`.
2. Ajouter `"ios": { "ascAppId": "<id numérique>" }` sous `submit.production` dans `eas.json` pour la soumission non interactive.
3. `eas build -p ios --profile production --auto-submit` → TestFlight.
4. TestFlight : tests internes, puis groupe externe (revue bêta) — [checklist](#checklist-avant-soumission).
5. Fiche : textes des 5 langues, captures iPhone 6,9″ et iPad 13″, URL d'assistance `https://pepperedapron.app/fr/support/`, confidentialité `https://pepperedapron.app/fr/privacy/`, catégorie, classification (4+).
6. **Confidentialité de l'app** (étiquettes) : voir [PRIVACY.md](PRIVACY.md#étiquettes-app-store-et-google-play). Doit correspondre au manifeste `NSPrivacyCollectedDataTypes` d'`app.config.ts`.
7. Informations pour la revue : aucun compte nécessaire ; notes (import, synchro iCloud, aucune publicité, effacement des données dans Réglages → Mes données).
8. Soumettre ; publication manuelle ou progressive (*phased release*, 7 jours).

## 4. Google Play (phase 2)

1. Play Console → créer l'app, package `app.pepperedapron`, gratuite, contient des annonces.
2. Premier envoi manuel de l'AAB (`eas build -p android --profile production`) pour activer la signature Play.
3. Compte de service Google pour `eas submit` (Play Console → API access) ; `eas credentials` pour l'associer.
4. Fiche : textes ([store](store/)), bannière `docs/store/assets/feature-graphic-<langue>.png`, captures téléphone et tablette.
5. *Sécurité des données* : [PRIVACY.md](PRIVACY.md#étiquettes-app-store-et-google-play). *Annonces* : non. *Public cible* : tous publics. Déclaration de l'autorisation d'alarme exacte : minuteurs de cuisine demandés par l'utilisateur.
6. Pistes : interne → fermée → production en déploiement progressif (10 % → 50 % → 100 %). `eas submit` envoie sur la piste `internal` en brouillon (voir `eas.json`).

## 5. Versions et mises à jour

- Version sémantique dans `app.config.ts` (`version`).
- Format des données : toute évolution du schéma doit rester lisible par l'ancienne version, ou passer au format `pepperedapron-sync/2` (les anciennes versions ignorent alors ces fichiers au lieu de les mal interpréter ; prévoir la migration locale dans `LocalStore.migrate`).
- Pas de mise à jour OTA configurée : chaque changement passe par un build et la revue des stores. (Ajouter `expo-updates` plus tard permettrait des correctifs JavaScript rapides ; `runtimeVersion` est déjà défini sur la version de l'app.)
- Notes de version : dans les 5 langues, courtes, orientées bénéfice.

## Checklist avant soumission

- [ ] `pnpm verify` vert, CI verte, E2E Maestro verts sur iOS et Android.
- [ ] iPhone SE / iPhone Pro Max / iPad (portrait, paysage, Split View, Stage Manager) / Android petit et grand écran.
- [ ] Mode sombre, taille de texte maximale, VoiceOver et TalkBack sur les parcours principaux.
- [ ] Mode avion : créer, modifier, supprimer, planifier, cocher ; tout reste disponible ; retour réseau → iCloud à jour.
- [ ] iPhone + iPad avec le même identifiant Apple : modifications croisées, suppression, photos ; iCloud désactivé sur l'un ; compte iCloud déconnecté.
- [ ] Réinstallation de l'app sur iPhone avec iCloud : tout revient. Android : export → import sur un autre téléphone.
- [ ] Partage depuis TikTok, Instagram, Safari, Photos, Notes, Messages (iOS) et Chrome, Galerie (Android), app fermée et ouverte.
- [ ] Widgets (4), Live Activity d'un minuteur, notifications (rappel, liste prête, planning, fin de minuteur).
- [ ] Réglages → Mes données : export, import, effacement de toutes les données (propagé à l'autre appareil).
- [ ] Captures et textes à jour dans les 5 langues ; pages `support`, `privacy`, `terms`, `legal` en ligne avec les vraies mentions.
