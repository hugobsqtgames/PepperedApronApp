# Audit de confidentialité et de sécurité

Date : 1er novembre 2026. Méthode : lecture du code (`apps/mobile/src`, `packages/*`, modules natifs Swift `apps/mobile/modules`, extensions `apps/mobile/targets`), génération du projet iOS de production (`expo prebuild`, variante production) et inspection d'Info.plist, des entitlements et des manifestes de confidentialité, recherche de tous les appels réseau, audit des dépendances (`pnpm audit --prod`).

## 1. Où vont les données

| Donnée | Où | Quitte l'appareil ? | Vers qui | Déclencheur |
|---|---|---|---|---|
| Recettes, photos, planning, listes, placard, réglages, historique | SQLite + fichiers dans le conteneur de l'app | Oui si iCloud activé (défaut) | iCloud privé de l'utilisateur (conteneur `iCloud.app.pepperedapron.com`, partie cachée) | Synchronisation |
| Sauvegarde hebdomadaire | `Documents/backups` (5 gardées) | Seulement via la sauvegarde iCloud de l'appareil | Apple | Automatique, désactivable |
| Lien partagé (URL) | Requête HTTPS directe, sans cookie (`credentials: 'omit'`) | Oui | Le site ou le réseau concerné (IP de l'appareil) | Import demandé |
| Vidéo publique d'une publication | Cache de l'app, **supprimée après lecture** | Non (téléchargement) | — | Import quand la recette manque |
| Images fixes tirées de la vidéo | Cache, puis photo de la recette si choisie | Non | — | Import |
| Vérification de connexion (requête `HEAD` vide) | Requête HTTPS | Oui | Apple (`captive.apple.com`, la page qu'iOS utilise lui-même) : seulement si un site ne répond pas pendant un import | Import |
| Code-barres (numéro seul) | Requête HTTPS | Oui | Open Food Facts (IP), User-Agent honnête « PepperedApron/version (contact) » | Scan demandé |
| Voix, son des vidéos | Reconnaissance Apple **sur l'appareil** (`requiresOnDeviceRecognition = true`, vérifié dans `VoiceCommandsModule.swift` et `VideoSpeechModule.swift`) | Non | — | Dictée, commandes vocales, import vidéo |
| Texte des photos | Apple Vision sur l'appareil | Non | — | Import photo, ticket |
| Liste de courses → Rappels | EventKit (liste choisie) | Selon iCloud Rappels de l'utilisateur | Apple | Demandé |
| Recette envoyée par lien | Dans le fragment `#…` du lien | Seulement au destinataire choisi | Le navigateur du destinataire (le serveur ne reçoit jamais le fragment) | Demandé |
| Notifications | Locales (`expo-notifications`, entitlement push **retiré**) | Non | — | Minuteurs, rappels |

Aucune donnée n'est envoyée au développeur. Il n'y a ni serveur, ni analytics, ni publicité, ni SDK de crash reporting.

## 2. SDK et bibliothèques tiers

Les dépendances d'exécution sont listées dans `apps/mobile/package.json` :
- Expo, React Native, i18next, fflate, jpeg-js, qrcode-generator, react-native-cloud-storage ;
- expo-live-activity, expo-share-intent, @bacons/apple-targets (outil de build).

Aucune n'envoie de données à un tiers.

**Points vérifiés** :
- `EXPO_NO_TELEMETRY=1` dans les builds EAS.
- `expo-updates` est absent : aucun code téléchargé à distance.
- `expo-dev-client` n'est actif que dans les builds de développement.

## 3. Réponses App Store Connect › App Privacy

- **Data Collection** : *No, we do not collect data from this app.*
- **Justification** au sens de la définition d'Apple (« transmitting data off the device in a way that allows you and/or your third-party partners to access it for a period longer than what is necessary to service the transmitted request in real time ») :
  - le développeur ne reçoit rien ;
  - aucun code tiers intégré ne collecte ;
  - les requêtes vers les sites et Open Food Facts sont faites par l'appareil à la demande de l'utilisateur, pour servir cette requête.
- **Tracking** : Non (`NSPrivacyTracking = false`, aucun identifiant publicitaire, pas d'ATT nécessaire).

## 4. Manifestes de confidentialité (Required Reason APIs)

| Cible | API | Raisons | État |
|---|---|---|---|
| App | UserDefaults, FileTimestamp, SystemBootTime, DiskSpace | CA92.1, 1C8F.1 / C617.1 / 35F9.1 / E174.1 | Déjà présent |
| Extension de partage | UserDefaults (App Group) | CA92.1 + **1C8F.1** | **Corrigé** (manquait 1C8F.1) |
| Widgets | UserDefaults (App Group) | **1C8F.1** | **Ajouté** (aucun manifeste avant) |
| Siri / App Intents | UserDefaults (App Group) | **1C8F.1** | **Ajouté** (aucun manifeste avant) |

Ces quatre manifestes sont contrôlés à chaque `pnpm qa:native` (production et développement).

## 5. Autorisations iOS (textes FR et EN)

| Clé | Utilisation réelle | Demandée |
|---|---|---|
| `NSCameraUsageDescription` | Photo de recette, recette imprimée ou manuscrite, ticket, code-barres | Au moment du geste |
| `NSPhotoLibraryUsageDescription` | Choisir une photo, « Ma dernière capture » | Au moment du geste |
| `NSMicrophoneUsageDescription` | Dictée, commandes vocales du mode cuisine | Au moment du geste |
| `NSSpeechRecognitionUsageDescription` | Transcription sur l'appareil | Au moment du geste |
| `NSRemindersUsageDescription` / `FullAccess` | Envoyer la liste de courses dans Rappels | Au moment du geste |
| Notifications | Minuteurs et rappels | Au premier minuteur ou à l'activation d'un rappel |

Aucune autorisation n'est demandée au lancement. L'app n'a pas d'autorisation d'ajout dans Photos, ni de localisation, de contacts, de Bluetooth ou de réseau local en production.

## 6. Sécurité

- **App Transport Security** : aucune exception en production. `NSAllowsLocalNetworking` (utile seulement au client de développement) est **retiré**, et c'est contrôlé par `qa:native`.
- **Secrets** : aucun dans le dépôt (recherche de clés `.p8`, `.p12`, jetons, clés privées : rien).
  - Les identifiants App Store Connect et Expo sont dans les secrets GitHub.
  - Les workflows reconstruisent la clé dans un fichier temporaire, supprimé à la fin.
- **Journaux** : 5 `console.warn` en production. Ils ne contiennent que des messages d'erreur, sans contenu de recette ni donnée personnelle.
- **Entrées non fiables** : les pages, légendes et fichiers importés sont lus avec des limites de taille (3 Mo de texte, délais de 12 s et 4 min par import).
  - Ils passent par des analyseurs testés sur des entrées géantes et pathologiques (4 000 cas).
  - Les données relues sont validées par schéma (zod).
- **Données relues après une mise à jour** : complétées par les valeurs par défaut (défaut n° 25 corrigé, testé).
- **Fichiers temporaires** : la vidéo d'import est supprimée dans un `finally`. Les images extraites sont rangées dans le dossier Caches, que iOS peut vider.
- **Après désinstallation** : iOS supprime les données locales. Les données iCloud restent dans le compte iCloud de l'utilisateur, qui les gère dans Réglages → [nom] → iCloud. C'est indiqué dans la FAQ.
- **Dépendances** : il reste 5 avis `pnpm audit` (uuid, zod 3 du CLI Expo, deepmerge, minimatch, glob).
  - Ils concernent uniquement les outils de build (CLI Expo, plugins de configuration), qui ne sont **pas** embarqués dans l'app.
  - `node-forge` (CLI Expo) est passé à 1.4.2.
  - La bibliothèque zod embarquée dans l'app est en 4.6.7 (corrigée).

## 7. Politique de confidentialité

- **Adresses** : `…/fr/privacy/` et `…/en/privacy/`, avec un lien dans l'app (Profil → Confidentialité) et un dans App Store Connect.
- **Mise à jour du 1er novembre 2026**, qui décrit désormais :
  - les publications sociales et la vidéo temporaire ;
  - Pinterest ;
  - les sauvegardes hebdomadaires ;
  - les notifications locales ;
  - les commandes vocales ;
  - l'hébergeur GitHub Pages.
- **RGPD** : responsable de traitement, durée de conservation des e-mails (3 ans), droits, réclamation auprès de la CNIL.
