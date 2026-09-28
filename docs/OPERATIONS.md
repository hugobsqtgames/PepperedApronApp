# Exploitation

## Architecture de production recommandée

| Composant | Choix de départ | Pourquoi |
|---|---|---|
| API | Conteneur `ghcr.io/<org>/pepperedapron-api` sur Fly.io, Render ou Scaleway Serverless Containers, 2 instances de 512 Mo, région UE (Paris/Amsterdam) | sans état, redémarrage rapide, déploiement progressif |
| Base | PostgreSQL 16 managé (Neon, Scaleway, Supabase, RDS) avec **PITR** | sauvegardes continues, restauration à la minute |
| Photos | Cloudflare R2 + domaine `media.pepperedapron.app` (CDN) | pas de frais de sortie |
| E-mails | Resend, domaine d'envoi vérifié (SPF, DKIM, DMARC) | |
| DNS/TLS | Cloudflare (proxy) devant l'API | TLS, protection DDoS ; `TRUST_PROXY=true` |
| Crashs app | Sentry (optionnel) | |

## Déployer l'API

1. Fusion sur `main` → CI verte.
2. Tag `api-vX.Y.Z` → workflow *Release API* → image `ghcr.io/<org>/pepperedapron-api:X.Y.Z`.
3. Migrations **avant** le trafic : `docker run --env-file prod.env <image> node dist/migrate.js` (ou commande de release de l'hébergeur). Les migrations sont additives (voir [BACKEND](BACKEND.md#base-de-données-et-migrations)), donc l'ancienne version continue de fonctionner pendant le déploiement.
4. Déployer l'image en *rolling update* ; l'hébergeur attend que `/health` réponde (il vérifie aussi la base).
5. Vérifier : `/health`, `/v1/config`, une connexion réelle, un push de synchro, les logs sans erreur.

Staging suit le même chemin avec sa propre base, son bucket et `NODE_ENV=staging`, avant chaque mise en production.

## Surveillance

| Signal | Où | Alerte |
|---|---|---|
| Disponibilité | sonde externe (UptimeRobot, Better Stack) sur `/health` toutes les minutes | 2 échecs consécutifs |
| Erreurs serveur | logs JSON (pino) sur stdout → agrégateur de l'hébergeur | taux de 5xx > 1 % sur 5 min |
| Latence de synchro | temps de réponse de `POST /v1/sync/push` et `GET /v1/sync/pull` | p95 > 1 s |
| Base | CPU, connexions (≤ `DATABASE_POOL_MAX` × instances), espace disque, lag de réplication | seuils du fournisseur |
| Stockage | taille du bucket, erreurs 4xx/5xx R2 | |
| E-mails | taux de rebond / plainte Resend | > 2 % |
| App | Sentry : crash-free sessions, nouveaux problèmes | < 99,5 % |
| Stores | notes, avis, rapports ANR/crash (App Store Connect, Play Console) | revue hebdomadaire |
| Produit | Administration → Statistiques (inscriptions, actifs, recettes), signalements en attente | revue quotidienne des signalements |

Les journaux masquent `Authorization`, mots de passe et jetons de rafraîchissement ; aucun contenu de recette n'est journalisé.

## Rollback

- **API** : redéployer le tag précédent (l'image est immuable). Les migrations étant additives, aucune restauration de schéma n'est nécessaire. Ne jamais « défaire » une migration à la main.
- **App** : impossible de retirer une version installée. Options : corriger et soumettre en revue accélérée ; suspendre un déploiement progressif (App Store *phased release*, Play *halt rollout*) ; en dernier recours, relever `MIN_APP_VERSION` pour forcer la mise à jour quand le correctif est en ligne.
- **Fonctionnalités à distance** : `ADS_CONFIG={"enabled":false}` coupe toute publicité sans nouvelle version.

## Sauvegardes et restauration

- Base : PITR du fournisseur (rétention ≥ 7 jours) **et** export logique quotidien chiffré (`pg_dump -Fc`) vers un bucket séparé, rétention 30 jours.
- Photos : versionnement ou réplication du bucket R2 vers un second bucket ; les suppressions volontaires passent par `deleted_objects`.
- **Test de restauration trimestriel** : restaurer le dernier dump sur une base jetable, lancer l'API de staging dessus, se connecter avec un compte de test.
- Après une restauration à un point antérieur, les curseurs des appareils peuvent être en avance sur la base : incrémenter `scope_epoch` de tous les utilisateurs (`UPDATE users SET scope_epoch = scope_epoch + 1;`) force une resynchronisation complète sans perdre les modifications en attente sur les appareils.

## Maintenance courante

- Tâches automatiques (dans chaque instance) : purge des fichiers supprimés, des tombstones > 90 jours, des opérations de synchro > 30 jours, des sessions expirées.
- Mensuel : mises à jour de dépendances (`pnpm outdated`, `npx expo install --check`), CI verte, déploiement staging puis production.
- Annuel : mise à jour du SDK Expo (une version majeure par an environ) et des cibles minimales iOS/Android exigées par les stores.
- Secrets : rotation de `JWT_SECRET` sans déconnexion (seuls les jetons d'accès de 15 min sont invalidés), des clés S3/Resend et du secret Facebook ; révocation des sessions d'un compte compromis depuis l'admin ou la base (`UPDATE sessions SET revoked_at = now() WHERE user_id = …`).

## Incidents

1. Qualifier : `/health`, logs, tableau de bord de la base.
2. Contenir : rollback d'image, `ADS_CONFIG` désactivé, rate limiting (déjà actif) ; en cas d'abus d'un compte : retrait du droit de publier depuis l'admin (dépublier et bloquer l'auteur), révocation de ses sessions en base, suppression du compte si nécessaire.
3. Communiquer : note sur les stores si nécessaire, e-mail aux utilisateurs concernés.
4. Violation de données personnelles : notification à la CNIL sous 72 h et aux personnes si risque élevé (RGPD art. 33-34) ; consigner l'incident.
5. Post-mortem écrit, action corrective suivie.
