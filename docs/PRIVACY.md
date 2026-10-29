# Données personnelles et RGPD

Principe : **l'éditeur ne détient aucune donnée des utilisateurs.** Pas de compte, pas de serveur, pas de mesure d'audience. Les contenus restent sur l'appareil et, sur iPhone/iPad, dans l'iCloud privé de l'utilisateur (opéré par Apple, inaccessible à l'éditeur). Texte public : `https://pepperedapron.app/<langue>/privacy/` (FR/EN, généré par `apps/site` à partir des variables `LEGAL_*`).

## Inventaire

| Donnée | Où | Qui y accède | Base légale | Conservation |
|---|---|---|---|---|
| Recettes, photos, favoris, collections, planning, listes, réglages | SQLite + `Documents/photos` sur l'appareil ; conteneur iCloud privé (iOS, si activé) ; sauvegarde Google de l'appareil (Android, si activée) | l'utilisateur seul (et Apple/Google comme hébergeurs de ses sauvegardes) | — (aucun traitement par l'éditeur) | jusqu'à effacement par l'utilisateur |
| Page web importée (adresse IP de l'appareil) | site importé, au moment de l'import | ce site | — (requête directe de l'appareil) | selon ce site |
| Identifiant publicitaire, IP, infos techniques | SDK Google AdMob | Google | **consentement** (UMP) ; ATT sur iOS | selon Google |
| E-mails envoyés au support | boîte de l'éditeur | éditeur | intérêt légitime (répondre) | 3 ans max |

Aucune donnée de localisation, de contacts, de santé, ni de micro n'est collectée (le micro et la localisation fine sont explicitement bloqués sur Android). Les photos de recettes perdent leurs métadonnées EXIF (dont la position GPS). La reconnaissance de texte sur photo se fait sur l'appareil.

## Consentement

Formulaire UMP de Google à la fin de l'onboarding (publicité, et demande ATT sur iOS si configurée dans AdMob). Refuser n'empêche aucune fonctionnalité. Modifiable à tout moment dans Réglages → Confidentialité → Choix publicitaires.

## Droits

| Droit | Mise en œuvre |
|---|---|
| Accès / portabilité | Réglages → Mes données → Exporter (fichier JSON complet) |
| Rectification | écrans d'édition |
| Effacement | Réglages → Mes données → Effacer toutes mes données (propagé aux appareils iCloud) ; suppression de l'app ; données iCloud gérables dans les réglages iOS |
| Retrait du consentement | Réglages → Confidentialité |
| Autres demandes | e-mail `SUPPORT_EMAIL` ; réponse sous un mois |

## Sous-traitants

Google AdMob (publicité). Hébergement du site : GitHub Pages (aucun cookie, aucun traceur). Apple (iCloud) et Google (sauvegarde Android) agissent pour l'utilisateur, pas pour l'éditeur.

## Étiquettes App Store et Google Play

### App Store — « Confidentialité de l'app »

Données collectées **par l'app** : aucune. Seul le SDK publicitaire collecte :

| Catégorie | Type | Lié à l'utilisateur | Suivi | Finalités |
|---|---|---|---|---|
| Identifiants | Identifiant de l'appareil (IDFA, via AdMob) | non | **oui** si ATT accepté | Publicité tierce |
| Utilisation | Données publicitaires (via AdMob) | non | oui si ATT accepté | Publicité tierce |
| Localisation | Approximative (IP, via AdMob) | non | non | Publicité tierce |
| Diagnostics | Autres données de diagnostic (via AdMob) | non | non | Publicité tierce |

Garder cohérents : ce tableau, `NSPrivacyCollectedDataTypes` (vide) dans `app.config.ts` (AdMob fournit son propre manifeste) et la politique en ligne. Les données stockées dans l'iCloud de l'utilisateur ne sont pas « collectées » au sens d'Apple (l'éditeur n'y a pas accès).

### Google Play — « Sécurité des données »

- Données collectées : identifiants de l'appareil et activité publicitaire, par Google AdMob uniquement.
- Partage avec des tiers : identifiants de l'appareil et données publicitaires avec Google AdMob.
- Chiffrement en transit : oui (HTTPS).
- Suppression : les données restent sur le téléphone ; effacement dans l'app (Réglages → Mes données) ; aucune donnée détenue par l'éditeur.

## Sécurité

Pas de serveur à attaquer, pas de base centrale. Sur l'appareil : bac à sable de l'app, chiffrement de l'appareil (iOS Data Protection / Android FBE), iCloud chiffré par Apple. Les données venant d'iCloud ou d'un fichier importé sont validées avant d'être appliquées ; l'import de liens n'envoie aucun cookie et n'accepte que `http(s)`.

## Mineurs

Pas de contenu généré par d'autres utilisateurs ; la publicité justifie un âge minimal de 13 ans indiqué dans les conditions. Pas de ciblage publicitaire des mineurs (`tagForUnderAgeOfConsent` à activer si le public évolue).
