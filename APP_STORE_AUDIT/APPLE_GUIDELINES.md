# Règles Apple applicables à PepperedApron

Vérifiées le **1er novembre 2026** sur les pages officielles d'Apple (voir [SOURCES.md](SOURCES.md)).
Les App Store Review Guidelines consultées portent la date du **16 octobre 2026**.

Les « recommandations » sont signalées comme telles. Tout le reste est une exigence Apple.

## Profil de l'app (ce qui détermine les règles applicables)

- Gestionnaire de recettes, de planning de repas et de courses, gratuit.
- Aucun compte, aucun serveur, aucune publicité, aucun achat intégré, aucun SDK d'analyse.
- Données sur l'appareil et dans l'iCloud privé de l'utilisateur.
- Plateformes : iPhone et iPad, iOS 16.4 minimum (widgets et Siri : iOS 17), français et anglais.
- Fonctions système utilisées :
  - extension de partage, widgets, Live Activities, Siri / App Intents, Handoff, Spotlight ;
  - notifications locales ;
  - caméra, photothèque, micro, reconnaissance vocale sur l'appareil, Rappels.
- Réseau : seulement à la demande de l'utilisateur.
  - Pages publiques des sites et réseaux sociaux qu'il partage.
  - Open Food Facts, pour les codes-barres.
  - iCloud.

## 1. App Store Review Guidelines

| Règle | Exigence (résumé fidèle) | Applicable | État / correction |
|---|---|---|---|
| 1.5 Developer Information | Coordonnées faciles à trouver dans l'app et via l'URL d'assistance | Oui | Aide → e-mail de contact + site `…/fr/support/` (200 OK) |
| 1.6 Data Security | Mesures de sécurité appropriées pour les données utilisateur | Oui | Stockage local protégé par iOS, ATS sans exception en production (corrigé), aucun secret dans l'app |
| 2.1 App Completeness | Version finale, métadonnées complètes, URL fonctionnelles, pas de crash | Oui | Plantage du mode cuisine corrigé (build 10). Premier lancement testé de bout en bout. Toutes les URL vérifiées |
| 2.3.1 / 2.3.7 Accurate Metadata | Pas de fonction annoncée absente ; pas de marque d'autrui dans le nom, le sous-titre ou les mots-clés | Oui | « Tout fonctionne hors ligne » corrigé. Nom, sous-titre et mots-clés sans marque tierce |
| 2.3.3 Screenshots | Montrer l'app en usage | Oui | **Risque signalé** : visuels reconstitués, conservés à ta demande (voir REMAINING_ACTIONS) |
| 2.3.4 Previews | « previews may only use video screen captures of the app itself » | Oui | **Risque signalé** : vidéo animée en HTML, conservée à ta demande |
| 2.5.1 Public APIs | API publiques uniquement | Oui | Speech, Vision, EventKit, ActivityKit, WidgetKit, App Intents : toutes publiques |
| 2.5.2 Self-contained | Pas de code téléchargé et exécuté | Oui | Aucun (pas d'OTA, `expo-updates` absent) |
| 2.5.4 Background | Modes d'arrière-plan pour leur usage prévu | Oui | Aucun `UIBackgroundModes`. Notifications locales uniquement |
| 2.5.14 Recording | Consentement explicite et indication visible pendant l'enregistrement | Oui | Dictée : écran dédié avec indicateur. Commandes vocales : bandeau « J'écoute » |
| 2.5.16 Widgets / extensions | En rapport avec l'app | Oui | Repas, courses, minuteurs, recette au hasard |
| 4.1 Copycats | Pas d'icône ou de nom d'autrui | Oui | Identité propre (icône et nom maison) |
| 4.2 Minimum Functionality | Plus qu'un site reconditionné ou un agrégateur de liens | Oui | App native riche, entièrement hors ligne pour l'essentiel |
| 5.1.1(i) Privacy Policy | Lien dans App Store Connect **et** dans l'app | Oui | Les deux. Politique mise à jour pour couvrir chaque flux réel |
| 5.1.1(ii) Permission | Textes d'autorisation clairs et complets | Oui | 6 textes, en FR et EN, vérifiés par `qa:native` |
| 5.1.1(iv) Access | Ne pas forcer l'accès ; demande au moment de l'usage | Oui | Toutes les autorisations sont demandées à l'usage (vérifié dans le code) |
| 5.1.1(v) Account deletion | Si création de compte | Non | Aucun compte |
| 5.1.2 Data Use and Sharing | Dire où partent les données | Oui | Open Food Facts, sites contactés et vidéo temporaire décrits dans la politique |
| 5.2.1 / 5.2.2 IP, third-party services | Droits sur les contenus ; services tiers selon leurs conditions | Oui | Photos Unsplash (licence documentée), police OFL. Pages publiques lues à la demande de l'utilisateur, pour son usage personnel |
| 5.2.3 Audio/Video Downloading | Pas de téléchargement ou de conversion de médias de services tiers sans autorisation | **À surveiller** | La vidéo publique est téléchargée **temporairement** pour être lue sur l'appareil, puis supprimée. Elle n'est jamais lisible ni enregistrable par l'utilisateur. Risque résiduel documenté |
| 5.6.1 App Store Reviews | API système obligatoire pour demander une note | Oui | `expo-store-review` (StoreKit), seulement après une note de 5 ★, au plus une fois par période |

## 2. Exigences techniques

| Exigence | Source | État |
|---|---|---|
| Xcode 26 et SDK iOS 26 pour tout envoi depuis le 28 avril 2026 | Upcoming requirements | Builds EAS SDK 58 acceptés par App Store Connect (builds 6 à 11 reçus) |
| Cible iOS 13 ou plus (à partir du 9 septembre 2026) | Upcoming requirements | iOS 16.2 à 17.0 selon la cible |
| Required Reason APIs déclarées dans un Privacy Manifest, SDK compris (depuis le 1er mai 2024) | Upcoming requirements + doc « Describing use of required reason API » | **Corrigé** : manifestes ajoutés aux widgets et à Siri ; extension de partage complétée (1C8F.1) |
| Chiffrement à l'export | `ITSAppUsesNonExemptEncryption` | `false` : uniquement le HTTPS du système, aucun chiffrement propre |
| Icône 1024×1024 sans alpha | App Store Connect | RVB, sans canal alpha (vérifié) |
| Captures : iPhone (6,9″ ou 6,5″) et iPad 13″ si l'app tourne sur iPad | Screenshot specifications | Présentes (1320×2868 et 2064×2752) |

## 3. Confidentialité (App Privacy)

- **« Collect »** : envoyer des données hors de l'appareil d'une façon qui permet au développeur ou à ses partenaires d'y accéder plus longtemps que le temps de servir la requête en temps réel.
- **Traitement sur l'appareil** : non « collecté », rien à déclarer.
- **« Third-party partners »** : le code tiers intégré à l'app (SDK). Il n'y en a aucun qui collecte.
- **Conséquence** : la déclaration « Data Not Collected » correspond au fonctionnement réel. Le détail est dans [PRIVACY_AUDIT.md](PRIVACY_AUDIT.md).

## 4. Classification par âge (système 2026)

Réponses au nouveau questionnaire exigées depuis le 31 janvier 2026. Définitions officielles appliquées :

| Catégorie | Définition Apple | PepperedApron |
|---|---|---|
| Unrestricted Web Access | « navigate to any webpage within the app or freely browse the web » | Non : seules les pages du site de l'app s'ouvrent dans l'app ; les sources de recettes s'ouvrent dans Safari |
| User-Generated Content | « broad distribution of content created by users » | Non : les recettes restent privées. Un partage par lien est un envoi direct à une personne |
| Messaging and Chat / Social media | Communication entre utilisateurs | Non |
| Advertising | Promotion payante | Non |
| Alcohol, Tobacco, or Drug Use or References | « References to or depictions of the consumption of alcohol » | **Corrigé en partie** : les accords vins, bières et cidres sont désormais désactivés par défaut. Réponse honnête : « Infrequent » (contenu activable, et recettes pouvant citer du vin) → 13+. Voir REMAINING_ACTIONS |
| Health or Wellness Topics | « calorie tracking, dieting advice, or exercise recommendations » | Non : étiquettes végétarien / sans gluten seulement, sans conseil |
| Medical, Violence, Sexuality, Gambling, Horror, Profanity | — | Non |

## 5. Union européenne

- **DSA** : statut de commerçant (« trader ») obligatoire à déclarer.
  - Si commerçant : adresse, téléphone et e-mail affichés sur la fiche.
  - Sinon : les utilisateurs de l'UE sont informés que le droit de la consommation ne s'applique pas.
  - C'est ta décision (voir REMAINING_ACTIONS).
- **RGPD** :
  - aucun traitement par l'éditeur, en dehors des e-mails de support ;
  - politique avec responsable, droits et réclamation à la CNIL ;
  - export et effacement dans l'app.
- **DMA** : non applicable (pas de distribution alternative, pas d'achats).

## 6. Human Interface Guidelines (recommandations, pas des obligations)

- Dark Mode, Dynamic Type, VoiceOver, Contrôle vocal, contrastes AA : audités automatiquement (`a11yAudit`, `contrast`).
- Safe areas et Dynamic Island : écrans construits avec `react-native-safe-area-context`.
- Widgets et Siri localisés (corrigé : ils étaient en une seule langue).
