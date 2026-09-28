# Architecture PepperedApron V2

## 1. Choix technologiques (et pourquoi)

| Besoin | Choix | Raison |
|---|---|---|
| App iOS/iPadOS puis Android | **Expo SDK 57 + React Native + Expo Router** (TypeScript) | Une base de code pour iOS et Android, rendu natif (pas de WebView), modules natifs Swift possibles (Share Extension, WidgetKit, ActivityKit) via config plugins, builds cloud EAS, mises à jour OTA. SwiftUI pur serait légèrement supérieur sur iOS mais imposerait de réécrire Android en Kotlin → double maintenance. |
| Base locale | **SQLite** (`expo-sqlite`) | Offline-first réel, requêtes, index, FTS possible, transactions. |
| Backend | **Node 22 + Fastify 5 + Drizzle ORM** | Rapide, typé de bout en bout, validation zod partagée avec le client, conteneur unique facile à héberger. |
| Base serveur | **PostgreSQL 16** | Relationnel, transactions, séquences (versionnement de synchro), recherche plein texte, JSONB, managé partout (Neon, Supabase, Fly, RDS). |
| Auth | **Maison, standard** : e-mail + mot de passe (scrypt), Apple / Google / Facebook par vérification d'ID token (JWKS), JWT d'accès 15 min + refresh token rotatif opaque stocké haché (sessions = appareils) | Pas de dépendance à un fournisseur d'identité payant, contrôle complet de la suppression de compte / export RGPD, révocation par appareil. |
| Photos | **S3-compatible (Cloudflare R2 recommandé)** via URL présignée PUT, compression côté appareil | Aucun fichier ne transite par l'API ; R2 n'a pas de frais de sortie. |
| E-mails | Resend (driver) / console en dev | Simple, peu coûteux. |
| Push | Expo Push Service | Gratuit, APNs + FCM. Les rappels de repas et minuteurs sont des **notifications locales** (zéro coût serveur, marchent hors ligne). |
| Pub | Google AdMob (`react-native-google-mobile-ads`) + UMP (consentement RGPD) derrière une interface `AdsProvider` | Régie remplaçable. |
| Analytics | **Premier parti** : événements minimaux envoyés à l'API (opt-in), agrégés dans l'admin | Aucune donnée vendue à un tiers, RGPD simple, coût quasi nul. |
| Crashs | Sentry (optionnel via DSN) | Standard, offre gratuite. |
| OCR | On-device (`expo-text-extractor` : Apple Vision / ML Kit) | Gratuit, privé, hors ligne. |
| CI/CD | GitHub Actions + EAS Build/Submit | |

**Aucune API d'IA générative n'est utilisée.** Le parsing de recettes est déterministe (`packages/core/src/parse`).

## 2. Structure du dépôt

```
apps/
  api/         Fastify + Drizzle + PostgreSQL (REST /v1)
  mobile/      Expo Router (iOS, iPadOS, Android) + cibles natives (targets/)
packages/
  core/        Domaine pur TS : schémas zod, quantités/unités/fractions, mise à l'échelle,
               parseurs (ligne d'ingrédient, texte libre, JSON-LD schema.org), recherche
               « langage naturel » locale, rayons de courses, planning, protocole de synchro
  client/      Couche données client indépendante de la plateforme : store SQLite (driver
               abstrait), outbox, moteur de synchro, client HTTP. Testée sous Node avec
               better-sqlite3 contre la vraie API.
docs/
```

Règles : aucune logique métier dans les écrans ; les écrans lisent via des hooks (`useLive`, `useRepos`, `useSyncStatus`…) branchés sur les repositories de `packages/client` ; tous les appels réseau passent par `ApiClient`.

## 3. Modèle de données serveur

Toutes les clés primaires sont des **UUID générés côté client** (création hors ligne). Chaque entité synchronisée porte :
`id, owner_id, household_id (nullable), version BIGINT (séquence globale sync_version_seq), created_at, updated_at, deleted_at (tombstone)`.

| Table | Rôle |
|---|---|
| `users` | compte (email, email_verified_at, name, avatar_key, role user/admin, locale, scope_epoch, deleted_at) |
| `auth_identities` | liens OAuth (provider apple/google/facebook, subject) |
| `sessions` | un par appareil : refresh token haché, nom d'appareil, plateforme, last_used_at, revoked_at |
| `email_tokens` | vérification e-mail / reset mot de passe / changement d'e-mail (hachés, expirables, usage unique) |
| `households`, `household_members` (role owner/member), `household_invites` (code, expiration) | foyer |
| `recipes` | recette + `visibility` private/public, `category`, `seasons[]`, `tags[]`, temps, four, `photo_key` |
| `recipe_ingredients`, `recipe_steps` | enfants ordonnés (quantité numérique + max pour les intervalles, unité normalisée, groupe) |
| `favorites` | (user, recipe) — id déterministe UUIDv5 → pas de doublons entre appareils |
| `collections`, `collection_items` | collections + appartenance (id déterministe) |
| `meal_plan_entries` | date, `slot` breakfast/lunch/snack/dinner, recette ou titre libre, portions, position |
| `shopping_lists`, `shopping_items` | listes et articles (catégorie, quantité, coché, position, recettes sources) |
| `shopping_categories` | rayons personnalisés et ordre du magasin (id déterministe par clé) |
| `user_settings` | thème, langue, unités, notifications, liste active, consentements |
| `uploads` | photos : clé, taille, type, statut, propriétaire |
| `share_links` | lien de partage à jeton non devinable (révocable) |
| `reports` | signalements (recette, auteur, motif, statut, traité par) |
| `contact_messages` | messages de contact (statut) |
| `push_tokens` | jetons Expo par session |
| `analytics_events` | événements minimaux opt-in (nom, jour, plateforme) |
| `deleted_objects` | file de suppression de fichiers S3 |

Visibilité d'une ligne pour un utilisateur U :
`owner_id = U` **ou** `household_id ∈ foyers(U)` (partage explicite par l'utilisateur). Les recettes publiques ne sont jamais synchronisées en masse : elles sont lues via `/v1/public/*`, et copiées dans la bibliothèque sur « Ajouter à mes recettes ».

## 4. Synchronisation (offline-first)

- Le client écrit **toujours** d'abord en local (SQLite), puis ajoute une opération à l'**outbox** (`entity, id, op, baseVersion, changedFields, data`). L'état de chaque ligne est `synced | pending | error`, affiché dans l'UI.
- `POST /v1/sync/push` : lot ordonné d'opérations, idempotent (`opId`). Pour chaque op, dans une transaction :
  - contrôle d'autorisation (propriétaire, ou membre du foyer de la ligne) ;
  - si `baseVersion == version serveur` → application directe ;
  - sinon **fusion champ par champ** : seuls les `changedFields` du client sont appliqués sur la version serveur courante (le dernier écrivain gagne *par champ*, pas par ligne) ; la réponse signale le conflit ; les ingrédients et étapes forment chacun un champ atomique ;
  - suppression = tombstone ; une modification sur une ligne supprimée est rejetée (`gone`) et le client purge.
  - chaque écriture prend une nouvelle `version` depuis `sync_version_seq`.
- `GET /v1/sync/pull?cursor=N` : toutes les lignes visibles de `version > N`, paginées, + nouveau curseur. Garantie « pas de trou » : chaque écriture prend sa version sous un verrou consultatif transactionnel (`pg_advisory_xact_lock`), les versions sont donc validées dans l'ordre ; le pull lit en `REPEATABLE READ`. Détails et limites : [SYNC.md](SYNC.md).
- Les recettes publiques mises en favori sont aussi tirées, en lecture seule ; si l'auteur les dépublie, le client reçoit une suppression.
- Horizon de purge : les tombstones sont supprimés après 90 jours ; un appareil dont le curseur est antérieur reçoit `resync: true` et refait une synchro complète (ses modifications en attente sont conservées).
- `scope_epoch` : quand un utilisateur rejoint/quitte un foyer ou qu'une ligne quitte le foyer, l'époque change et le client refait une resynchronisation complète (purge + pull depuis 0).
- Photos : compressées (1600 px max, JPEG 0,8, EXIF supprimé) puis stockées localement ; l'upload est une tâche d'outbox différée ; la recette référence la clé dès que l'upload est confirmé.
- Reprises : backoff exponentiel, jitter, synchro au retour réseau, au passage au premier plan, et après chaque écriture (debounce).

## 5. Sécurité

- Chaque route authentifiée dérive l'utilisateur **uniquement** du JWT ; jamais d'ID utilisateur fourni par le client.
- Toutes les requêtes de données filtrent par portée de visibilité (tests IDOR dédiés).
- Rate limiting par IP et par compte (auth, contact, signalements, import d'URL).
- Import d'URL : protection SSRF (résolution DNS, IP privées interdites, schémas http(s) uniquement, taille et délai bornés, redirections revalidées).
- Uploads : URL présignée à usage limité (type et taille imposés), vérification `HEAD` à la confirmation, clés aléatoires 128 bits.
- Refresh tokens rotatifs : réutilisation d'un ancien token ⇒ révocation de la session (détection de vol).
- Secrets uniquement par variables d'environnement ; `.env.example` fourni.

## 6. Environnements

`development` (Postgres local, stockage disque local, e-mails en console), `staging`, `production` — chacun avec sa base, son bucket, ses clés AdMob (tests en dev), son DSN Sentry et son `EXPO_PUBLIC_API_URL`. Profils EAS correspondants.

## 7. Coûts de départ estimés

API (Fly.io/Render, 1 petite instance) ~5–10 €/mois ; PostgreSQL managé (Neon, offre gratuite puis ~20 €) ; R2 (10 Go gratuits) ; Resend (3 000 e-mails/mois gratuits) ; Expo Push gratuit ; Sentry gratuit ; EAS offre gratuite limitée. Compte Apple Developer 99 $/an, Google Play 25 $ une fois.
