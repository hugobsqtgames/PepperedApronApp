# Exploitation

Il n'y a **aucun serveur à exploiter** : pas de base, pas de sauvegarde à faire, pas de facture d'hébergement. Restent le site statique, le suivi qualité de l'app et le support.

## Site (`apps/site`)

- Publication : *Actions → Website* (automatique à chaque modification de `apps/site` sur `main`). Variables : [ENVIRONMENT](ENVIRONMENT.md#site-appssite).
- Les URL sont stables et utilisées par l'app et les fiches store : `/<langue>/support/`, `/privacy/`, `/terms/`, `/legal/` (langues `fr`, `en`, `es`, `de`, `it`). Ne pas les renommer.
- Modifier les textes : `apps/site/src/content.mjs` ; mettre à jour la date `UPDATED` des documents légaux.

## Qualité de l'app

- Plantages et blocages : App Store Connect → *TestFlight / Crashes* et Xcode Organizer. Aucun SDK de suivi supplémentaire (aucune donnée envoyée à l'éditeur).
- Avis : répondre depuis App Store Connect.

## Support

- Les messages arrivent à `SUPPORT_EMAIL` (bouton « Écrire un e-mail » de l'app, avec version et système pré-remplis).
- L'éditeur n'a accès à aucune donnée : pour un problème de données, demander à l'utilisateur un export (Réglages → Mes données → Exporter) s'il accepte de le partager.
- « Mes recettes n'apparaissent pas sur l'iPad » : même identifiant Apple ? iCloud Drive activé ? iCloud activé dans Réglages → Mes données sur les deux appareils ? Tirer l'accueil vers le bas ; les transferts iCloud peuvent prendre quelques minutes.

## Mises à jour

Chaque version passe par un build EAS et la revue des stores ([RELEASE](RELEASE.md)). Avant de modifier un schéma de données, vérifier la compatibilité avec les versions installées : les fichiers iCloud sont lus par toutes les versions présentes sur les appareils d'un utilisateur ([SYNC](SYNC.md)).

## Retour arrière

Publier la version précédente corrigée (l'App Store ne permet pas de réinstaller une ancienne version). Les données locales et iCloud ne dépendent d'aucun serveur : elles ne sont pas affectées par une publication.
