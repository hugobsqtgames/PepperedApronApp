# Données personnelles et RGPD

Principe : **l'éditeur ne détient aucune donnée des utilisateurs.** Pas de compte, pas de serveur, pas de publicité, pas de mesure d'audience. Les contenus restent sur l'appareil et, sur iPhone/iPad, dans l'iCloud privé de l'utilisateur (opéré par Apple, inaccessible à l'éditeur). Texte public : `https://pepperedapron.app/<langue>/privacy/` (FR/EN, généré par `apps/site` à partir des variables `LEGAL_*`).

## Inventaire

| Donnée | Où | Qui y accède | Base légale | Conservation |
|---|---|---|---|---|
| Recettes, photos, favoris, collections, planning, listes, réglages | SQLite + `Documents/photos` sur l'appareil ; conteneur iCloud privé (si activé) ; sauvegarde iCloud de l'appareil (si activée) | l'utilisateur seul (et Apple/Google comme hébergeurs de ses sauvegardes) | — (aucun traitement par l'éditeur) | jusqu'à effacement par l'utilisateur |
| Page web importée (adresse IP de l'appareil) | site importé, au moment de l'import | ce site | — (requête directe de l'appareil) | selon ce site |
| E-mails envoyés au support | boîte de l'éditeur | éditeur | intérêt légitime (répondre) | 3 ans max |

Aucune donnée de localisation, de contacts, de santé, ni de micro n'est collectée (l'app ne demande ni le micro ni la localisation ; l'écoute d'une vidéo importée passe par la reconnaissance vocale d'iOS, sur l'appareil). Les photos de recettes perdent leurs métadonnées EXIF (dont la position GPS). La reconnaissance de texte sur photo se fait sur l'appareil.

## Droits

| Droit | Mise en œuvre |
|---|---|
| Accès / portabilité | Réglages → Mes données → Exporter (fichier JSON complet) |
| Rectification | écrans d'édition |
| Effacement | Réglages → Mes données → Effacer toutes mes données (propagé aux appareils iCloud) ; suppression de l'app ; données iCloud gérables dans les réglages iOS |
| Autres demandes | e-mail `SUPPORT_EMAIL` ; réponse sous un mois |

## Sous-traitants

Aucun pour l'app. Hébergement du site : GitHub Pages (aucun cookie, aucun traceur). Apple (iCloud) agit pour l'utilisateur, pas pour l'éditeur.

## Étiquettes App Store

### App Store — « Confidentialité de l'app »

Réponse : **« Aucune donnée collectée »** (ni par l'app, ni par un SDK tiers : l'app n'en contient aucun qui collecte des données).

Garder cohérents : cette réponse, `NSPrivacyCollectedDataTypes` (vide) dans `app.config.ts` et la politique en ligne. Les données stockées dans l'iCloud de l'utilisateur ne sont pas « collectées » au sens d'Apple (l'éditeur n'y a pas accès).

## Sécurité

Pas de serveur à attaquer, pas de base centrale. Sur l'appareil : bac à sable de l'app, chiffrement de l'appareil (iOS Data Protection), iCloud chiffré par Apple. Les données venant d'iCloud ou d'un fichier importé sont validées avant d'être appliquées ; l'import de liens n'envoie aucun cookie et n'accepte que `http(s)`.

## Mineurs

Pas de contenu généré par d'autres utilisateurs, pas de publicité, aucune donnée collectée : l'app convient à tous les âges (4+).
