# Synchronisation hors ligne

Objectif : l'app fonctionne entièrement sans réseau, plusieurs appareils (iPhone, iPad, Android) et les membres d'un foyer convergent vers le même état, sans perte ni doublon.

## Côté client (`packages/client`)

- **Base locale** SQLite, une par compte (`pa-<userId>.db`) : `records` (copie des entités), `outbox` (opérations à envoyer), `photo_queue`, `meta` (curseur, époque).
- **Écriture** : l'écran appelle `Repos` → validation zod → écriture locale immédiate → opération ajoutée à l'outbox. L'UI réagit instantanément ; chaque élément porte un état `synced | pending | error` visible (pastille, bandeau de synchro).
- **Fusion d'outbox** : plusieurs modifications hors ligne de la même ligne sont fusionnées en une seule opération (union des champs modifiés) ; créer puis supprimer hors ligne n'envoie rien.
- **Identifiants** générés sur l'appareil (UUIDv7) ; identifiants **déterministes** (UUIDv5) pour les favoris, éléments de collection et rayons : deux appareils qui mettent la même recette en favori produisent la même ligne.
- **Déclencheurs** : écriture locale (après 1,5 s), retour du réseau, retour au premier plan, toutes les 60 s au premier plan. Le moteur est *single-flight* (une seule synchro à la fois, une nouvelle demandée pendant l'exécution est rejouée juste après) et applique un backoff exponentiel en cas d'échec.
- **Pull pendant une modification en attente** : la ligne reçue est « rebasée » — les champs modifiés localement restent visibles et seront envoyés ensuite.
- **Photos** : fichier compressé gardé localement et affiché tout de suite ; upload différé avec reprise ; une image corrompue est refusée définitivement sans bloquer la recette.

## Côté serveur (`apps/api/src/sync`)

### Push — `POST /v1/sync/push`

Lot ordonné d'opérations `{opId, entity, id, op: upsert|delete, baseVersion, changedFields, data}`. Pour chacune, dans une transaction :

1. **Idempotence** : un `opId` déjà traité renvoie le résultat enregistré (`sync_ops`, 30 jours). Une app tuée après l'envoi mais avant la réponse peut donc rejouer sans effet de bord.
2. **Autorisation** : propriétaire, ou membre du foyer auquel la ligne est partagée ; certains champs sont réservés au propriétaire (visibilité, partage au foyer) ; une référence à une recette inaccessible est refusée.
3. **Validation** du contenu (schémas partagés `packages/core`).
4. **Conflit** : si `baseVersion` ≠ version serveur, seuls les `changedFields` sont appliqués sur l'état courant (*dernier écrivain gagnant par champ*). Ingrédients et étapes forment chacun un champ atomique. Deux personnes qui cochent des articles différents de la même liste ne s'écrasent jamais.
5. **Suppression** : tombstone (`deleted_at`) ; une modification d'une ligne supprimée renvoie `gone` et le client la retire. Les suppressions en cascade restent cohérentes (une recette supprimée devient un titre libre dans le planning).
6. Nouvelle **version** tirée de `sync_version_seq`.

Résultats possibles : `applied`, `merged` (conflit fusionné), `duplicate` (opération déjà traitée), `gone`, `rejected` (données invalides, avec code), `forbidden` — le client met à jour l'état de la ligne en conséquence.

### Pull — `GET /v1/sync/pull?cursor=N&limit=500`

Renvoie toutes les lignes visibles de version `> N`, triées, paginées (`hasMore`), plus le nouveau curseur et l'époque de portée.

**Pas de trou** : `nextVersion()` prend un verrou consultatif transactionnel (`pg_advisory_xact_lock`) avant `nextval`. Les transactions d'écriture synchronisées valident donc dans l'ordre de leurs versions : quand un pull voit la version N, toutes les versions < N sont déjà visibles. Le pull s'exécute en `REPEATABLE READ` (instantané cohérent entre tables).

Coût : les écritures synchronisées sont sérialisées pendant leur (courte) transaction, ce qui plafonne le débit d'écriture global (quelques milliers d'opérations par seconde selon la base) — confortable au lancement. À surveiller : la latence de `POST /v1/sync/push`. Évolution prévue si nécessaire : un verrou par *partition* (utilisateur/foyer) avec des curseurs par partition, ou un curseur basé sur `pg_snapshot_xmin`.

### Portée et époque

Une ligne est visible par son propriétaire et, si elle est partagée, par les membres du foyer. Quand un utilisateur rejoint/quitte un foyer, ou qu'une ligne quitte le partage, son `scope_epoch` change : au pull suivant, le client efface sa copie synchronisée (en gardant les modifications en attente) et repart du curseur 0. Les recettes publiques mises en favori sont tirées en lecture seule et retirées si elles sont dépubliées.

### Horizon de purge

Les tombstones de plus de 90 jours sont supprimés. La tâche enregistre la plus haute version purgée (`sync_state.tombstone_horizon`). Un appareil dont le curseur est inférieur (hors ligne depuis des mois) reçoit `resync: true` et refait une synchro complète ; sans cela il ne verrait jamais ces suppressions. Sur la dernière page d'un pull, le curseur est avancé au-delà de l'horizon pour éviter une boucle.

## Cas testés (`packages/client/test/offline-sync.test.ts`, `apps/api/test/sync.test.ts`)

Hors ligne complet puis reprise ; création + suppression hors ligne ; fusion de modifications ; modifications concurrentes de champs différents ; suppression sur un appareil pendant l'édition sur l'autre ; articles cochés simultanément ; favori « spammé » sur deux appareils ; app tuée pendant la synchro et après application côté serveur ; serveur indisponible ; jeton expiré ; session révoquée ; données invalides ; entrée/sortie de foyer ; photo hors ligne ; image corrompue ; appareil hors ligne au-delà de la rétention des tombstones.
