# Backend (`apps/api`)

Fastify 5 + Drizzle ORM + PostgreSQL 16, un seul processus sans état (plusieurs instances possibles derrière un load balancer). Toutes les routes JSON sont sous `/v1`.

```
src/
  server.ts        démarrage, tâches de maintenance, arrêt propre (SIGTERM)
  app.ts           construction de l'app (testable), garde d'auth, gestion d'erreurs
  env.ts           configuration validée
  db/              schéma Drizzle, pool, migrations
  auth/            jetons (JWT + refresh opaques), service d'authentification
  sync/            protocole push/pull, portée de visibilité, versions
  services/        comptes, foyers, recettes publiques, import, stockage, e-mails, push, OAuth, admin
  routes/          déclaration HTTP (validation zod), une famille par fichier
  web/             pages HTML : partage, invitation, e-mails, pages légales
  lib/             erreurs, crypto, validation, fetch anti-SSRF
drizzle/           migrations SQL versionnées
test/              tests d'intégration contre un vrai PostgreSQL
```

## Base de données et migrations

- Schéma : `src/db/schema.ts` (tables décrites dans [ARCHITECTURE](ARCHITECTURE.md#3-modèle-de-données-serveur)).
- Nouvelle migration : modifier le schéma puis `pnpm --filter @pepperedapron/api db:generate` → fichier `drizzle/NNNN_nom.sql` à relire et versionner.
- Appliquer : `pnpm --filter @pepperedapron/api migrate` (dev), `node dist/migrate.js` (image), ou `RUN_MIGRATIONS_ON_START=true`.
- Règle de déploiement : **migrations additives uniquement** (nouvelle colonne nullable, nouvelle table, nouvel index `CONCURRENTLY` si volumineux). Une suppression de colonne se fait en deux versions : le code cesse de l'utiliser, puis une migration ultérieure la retire. Ainsi l'ancienne version de l'API reste compatible pendant un déploiement progressif ou un rollback.

## Authentification

| Méthode | Détails |
|---|---|
| E-mail + mot de passe | scrypt (sel aléatoire), 10 caractères minimum ; message identique si le compte n'existe pas |
| Apple | vérification de l'ID token (JWKS Apple, `aud` ∈ `APPLE_AUDIENCES`, nonce) |
| Google | ID token (JWKS Google, `aud` ∈ `GOOGLE_CLIENT_IDS`) |
| Facebook | Limited Login (JWT) sur iOS, jeton d'accès vérifié via `debug_token` sur Android ; l'e-mail Facebook n'est jamais considéré comme vérifié |

- Liaison automatique d'un fournisseur à un compte existant **seulement** si les deux adresses sont vérifiées ; sinon `email_in_use_sign_in_with_password`.
- Jeton d'accès JWT HS256 de 15 min ; jeton de rafraîchissement opaque (haché en base), **rotatif** : réutiliser un ancien jeton révoque la session (vol détecté).
- Une session = un appareil (nom, plateforme, dernière activité) ; liste et révocation dans l'app.
- Changement de mot de passe : révoque les autres sessions. Changement d'e-mail : lien de confirmation envoyé à la nouvelle adresse.
- Vérification d'e-mail, réinitialisation : jetons à usage unique, hachés, expirables. Pages web de secours (`/auth/verify-email`, `/auth/reset-password`) si l'app n'est pas installée.
- Suppression de compte : mot de passe (ou reconnexion récente) exigé ; recettes, photos, listes, sessions, foyer (transfert ou dissolution) supprimés ; fichiers purgés de manière asynchrone.

## Stockage des photos

1. L'app compresse (1600 px, JPEG 0,8, sans EXIF) et demande `POST /v1/uploads` (type et taille déclarés).
2. L'API renvoie une URL **présignée PUT** (clé aléatoire, type et taille imposés, 15 min).
3. L'app envoie le fichier directement au bucket, puis `POST /v1/uploads/:id/complete` : l'API vérifie l'objet (`HEAD` : taille, type) et le rattache.
4. Les photos sont servies par `MEDIA_PUBLIC_URL` (CDN). Les objets remplacés ou supprimés passent par `deleted_objects` et sont effacés par la tâche de maintenance.

En développement, le driver `local` imite ce flux (URL signée HMAC vers `/v1/media-upload`).

## E-mails

Driver `resend` (production) ou `console` (dev). Modèles en 5 langues selon la langue du compte : vérification, réinitialisation, changement d'adresse. Configurer SPF/DKIM/DMARC sur le domaine d'envoi.

## Notifications

- **Locales** (aucun serveur) : rappel de repas, relance du planning, fin de minuteur.
- **Distantes** (Expo Push → APNs/FCM) : un membre rejoint le foyer. Jetons enregistrés par session (`PUT /v1/me/push-token`), supprimés à la déconnexion ; les jetons invalides renvoyés par Expo sont purgés.

## Import d'URL (`POST /v1/import/url`)

Récupération serveur protégée contre le SSRF (résolution DNS, IP privées/locales refusées, http(s) seulement, redirections revalidées, 3 Mo et 8 s max). Lecture déterministe : JSON-LD schema.org `Recipe`, sinon métadonnées OpenGraph ; pour TikTok/Instagram, seules les données publiques exposées par la plateforme sont récupérées et l'app le dit clairement. Aucune IA.

## Routes principales

| Famille | Routes |
|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/oauth/:provider`, `/auth/password/forgot`, `/auth/password/reset`, `/auth/email/verify`, `/auth/email/resend`, `/auth/email/confirm-change` |
| Compte | `GET/PATCH/DELETE /me`, `POST /me/password`, `POST /me/email`, `GET /me/sessions`, `DELETE /me/sessions/:id`, `POST /me/sessions/revoke-others`, `PUT/DELETE /me/push-token`, `GET /me/export` |
| Synchro | `POST /sync/push`, `GET /sync/pull` ([SYNC](SYNC.md)) |
| Photos | `POST /uploads`, `POST /uploads/:id/complete` |
| Foyer | `GET/POST/PATCH/DELETE /household`, `POST /household/invites`, `POST /household/join`, `POST /household/leave`, `DELETE /household/members/:userId` |
| Communauté | `GET /public/recipes`, `GET /public/recipes/:id`, `POST /public/recipes/:id/save`, `POST /public/recipes/:id/report`, `GET /public/users/:id` |
| Partage | `POST/DELETE /recipes/:id/share`, `GET /share/:token`, `POST /share/:token/save` |
| Divers | `GET /config`, `POST /contact`, `POST /import/url`, `POST /analytics/events` |
| Admin | `GET /admin/stats`, `GET/PATCH /admin/reports…`, `GET /admin/recipes/:id`, `GET/PATCH /admin/users/:id`, `GET/PATCH /admin/messages…` |
| Web (hors `/v1`) | `/r/:token`, `/p/:id`, `/join/:code`, `/auth/*`, `/legal/{privacy,terms,notice}`, `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json`, `/health` |

## Sécurité

- L'identité vient **uniquement** du jeton ; chaque lecture/écriture est filtrée par la portée (propriétaire ou membre du foyer). Tests IDOR dans `test/security.test.ts`.
- Rate limiting global (300 req/min/IP) et par route sensible, dont : connexion par IP + e-mail, renvoi d'e-mail 3/h, contact 5/h, signalements 20/jour, import d'URL 30/h, rejoindre un foyer 10/15 min.
- Erreurs : codes stables (`invalid_credentials`, `rate_limited`…), jamais de trace ni de message interne renvoyé.
- Journaux : en-tête `Authorization`, mots de passe et refresh tokens masqués.
- Contenu public : les recettes publiques exigent un e-mail vérifié ; signalements ; l'admin peut dépublier et bloquer un auteur.

## Administration

Les comptes listés dans `ADMIN_EMAILS` (e-mail vérifié) voient l'espace « Administration » dans l'app : statistiques (utilisateurs, actifs, recettes, événements), traitement des signalements, messages de contact.

## Tâches de maintenance

Exécutées par chaque instance (idempotentes) : purge des fichiers supprimés (toutes les 10 min) ; purge quotidienne des tombstones de plus de 90 jours (avec mise à jour de l'horizon de synchro), des opérations de synchro de plus de 30 jours et des sessions expirées.
