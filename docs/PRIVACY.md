# Données personnelles et RGPD

Principes : minimisation, aucune revente, aucune IA, consentement avant toute mesure d'audience ou publicité personnalisée, export et suppression en libre-service. Texte public : `/legal/privacy` (FR/EN), servi par l'API à partir des variables `LEGAL_*`.

## Inventaire

| Donnée | Où | Finalité | Base légale | Conservation |
|---|---|---|---|---|
| E-mail, nom affiché, mot de passe haché (scrypt), identifiants Apple/Google/Facebook | `users`, `auth_identities` | compte | contrat | durée du compte |
| Recettes, photos, favoris, collections, planning, listes, réglages | tables synchronisées, bucket | service | contrat | durée du compte ; éléments supprimés effacés sous 90 jours |
| Sessions : nom et type d'appareil, dates, jeton haché | `sessions` | sécurité, gestion des appareils | intérêt légitime | expiration + 30 jours |
| Jetons de notification | `push_tokens` | notifications foyer | contrat | jusqu'à déconnexion / désinstallation |
| Événements d'usage (nom, jour, plateforme, version) | `analytics_events` | amélioration | **consentement** | 13 mois (purge automatique) |
| Signalements, messages de contact | `reports`, `contact_messages` | modération, support | intérêt légitime | 3 ans (purge automatique) |
| Identifiant publicitaire, IP (par Google AdMob) | SDK tiers | publicité | **consentement** (UMP) ; ATT sur iOS | selon Google |
| Rapports de crash (si Sentry activé) | Sentry | stabilité | intérêt légitime | 90 jours (réglage Sentry) |

Aucune donnée de localisation précise, de contacts, de santé, ni de micro n'est collectée (le micro et la localisation fine sont explicitement bloqués sur Android). Les photos de recettes perdent leurs métadonnées EXIF (dont la position GPS) avant l'envoi. La reconnaissance de texte sur photo se fait sur l'appareil.

## Consentement

Écran de consentement unique après l'inscription (mesure d'audience) puis formulaire UMP de Google (publicité, et demande ATT sur iOS si configurée). Refuser n'empêche aucune fonctionnalité. Modifiable à tout moment dans Profil → Confidentialité. Sans consentement, l'API rejette les événements d'analyse (testé).

## Droits

| Droit | Mise en œuvre |
|---|---|
| Accès / portabilité | Profil → Mes données → Exporter (JSON complet, `GET /v1/me/export`) |
| Rectification | écrans de profil et d'édition |
| Effacement | Profil → Mes données → Supprimer mon compte (confirmation + mot de passe) ; base effacée immédiatement, photos sous 24 h |
| Retrait du consentement | Profil → Confidentialité |
| Autres demandes | e-mail `LEGAL_CONTACT_EMAIL` ; réponse sous un mois |

## Sous-traitants

Hébergeur de l'API et de la base, Cloudflare (R2, DNS), Resend (e-mails), Expo / Apple / Google (notifications), Google AdMob (publicité), Sentry (crashs, optionnel). Tenir à jour le registre des traitements et signer les DPA ; privilégier des régions UE ; clauses contractuelles types pour les transferts.

## Étiquettes App Store et Google Play

### App Store — « Confidentialité de l'app »

| Catégorie | Type | Lié à l'utilisateur | Suivi | Finalités |
|---|---|---|---|---|
| Coordonnées | Adresse e-mail, Nom | oui | non | Fonctionnalités de l'app |
| Contenu utilisateur | Photos, Autre contenu (recettes, listes) | oui | non | Fonctionnalités de l'app |
| Utilisation | Interactions avec le produit | oui | non | Analyses (si consentement) |
| Diagnostics | Données de plantage | oui | non | Fonctionnalités de l'app (si Sentry) |
| Identifiants | Identifiant de l'appareil (IDFA, via AdMob) | non | **oui** si ATT accepté | Publicité tierce |
| Utilisation | Données publicitaires (via AdMob) | non | oui si ATT accepté | Publicité tierce |
| Localisation | Approximative (IP, via AdMob) | non | non | Publicité tierce |

Garder cohérents : ce tableau, `NSPrivacyCollectedDataTypes` dans `app.config.ts` (données collectées par l'app elle-même ; AdMob fournit son propre manifeste) et la politique en ligne.

### Google Play — « Sécurité des données »

- Données collectées : informations personnelles (e-mail, nom), photos, autres contenus générés par l'utilisateur, activité dans l'app (interactions, si consentement), plantages, identifiants de l'appareil (AdMob).
- Partage avec des tiers : identifiants de l'appareil et données publicitaires avec Google AdMob.
- Chiffrement en transit : oui (HTTPS uniquement).
- Suppression : oui, dans l'app et par e-mail ; URL de demande de suppression : `https://pepperedapron.app/support`.

## Sécurité

Voir [BACKEND](BACKEND.md#sécurité) : identité issue du seul jeton, contrôle d'accès systématique (tests IDOR), jetons hachés, rotation avec détection de vol, rate limiting, anti-SSRF, secrets hors dépôt, HTTPS. Sur l'appareil : jetons dans le trousseau / Keystore (`expo-secure-store`), base locale par compte effacée à la déconnexion.

## Mineurs

L'app n'est pas destinée aux enfants de moins de 13 ans (contenu communautaire, publicité). Âge minimal indiqué dans les conditions ; pas de ciblage publicitaire des mineurs (`tagForUnderAgeOfConsent` à activer si le public évolue).
