# Stockage local et synchronisation iCloud

Code : `packages/client/src/{clock,store,cloud}.ts` (indépendant de React Native, testé sous Node), adaptateur iOS `apps/mobile/src/services/icloud.ts`, déclencheurs `apps/mobile/src/services/runtime.ts`.

## Sur l'appareil

- `LocalStore` est la seule source de vérité : un cache mémoire (lectures instantanées) reflété dans SQLite. Chaque écriture est validée puis persistée dans une transaction avant d'être affichée ; l'app peut être tuée à tout moment sans perte.
- Une écriture qui ne change rien n'est pas enregistrée (pas de faux changement à synchroniser).
- Une suppression laisse un **tombstone** (`deleted = 1`, données effacées) : c'est ce qui permet à la suppression d'atteindre les autres appareils.
- `revision` (persistée) augmente à chaque changement, local ou reçu : elle indique s'il faut réécrire le fichier iCloud de l'appareil.

## Horloge logique hybride (`clock.ts`)

Chaque changement reçoit un horodatage `MMMMMMMMMMMMMMM-ccccc-<appareil>` (millisecondes sur 15 chiffres, compteur base 36, identifiant de l'appareil). Comparés comme des chaînes, ils sont :

- proches de l'heure réelle (« le dernier qui a modifié gagne » correspond à ce qu'attend l'utilisateur) ;
- strictement croissants sur un appareil, même si l'heure système recule ;
- toujours postérieurs à tout ce que l'appareil a déjà reçu (un appareil dont la date est fausse ne peut pas faire perdre les modifications suivantes) ;
- uniques (l'identifiant d'appareil départage deux modifications à la même milliseconde).

## iCloud (`cloud.ts`)

Conteneur privé `iCloud.<bundleId>`, portée « app data » : invisible dans l'app Fichiers, accessible uniquement aux appareils du même identifiant Apple.

```
devices/<deviceId>.json   état complet d'un appareil (tombstones compris)
photos/<uuid>.jpg         photos des recettes
```

Format d'un fichier d'appareil : `{ "format": "pepperedapron-sync/1", "deviceId", "writtenAt", "records": [{ entity, id, hlc, deleted, data }] }`.

Une synchronisation (`CloudSync.sync()`, une seule à la fois ; une demande pendant l'exécution relance un tour à la fin) :

1. **Lire** chaque fichier `devices/*.json` modifié depuis la dernière lecture (date de modification mémorisée) et **fusionner** : pour chaque enregistrement, l'horodatage le plus grand gagne, suppression comprise. Les enregistrements invalides sont ignorés ; un fichier illisible (en cours de téléchargement ou d'écriture) est réessayé au tour suivant ; un format plus récent (`pepperedapron-sync/2`…) est ignoré, jamais interprété.
2. **Photos** : chaque photo utilisée par une recette est envoyée si elle n'est que sur l'appareil, téléchargée si elle n'est que dans iCloud. Les photos inutilisées depuis plus de 24 h sont supprimées (localement, et dans iCloud seulement si tous les fichiers d'appareils ont pu être lus).
3. **Écrire** `devices/<moi>.json` si `revision` a changé depuis le dernier envoi (ou si le fichier manque). Les photos partent avant le fichier qui les référence.

Pourquoi un fichier par appareil : iCloud Drive ne sait pas fusionner deux écritures concurrentes du même fichier (il crée des versions en conflit). Ici chaque fichier n'a qu'un seul auteur, et la fusion se fait dans l'app, enregistrement par enregistrement, de façon déterministe : tous les appareils convergent vers le même état.

Les tombstones sont conservés indéfiniment (quelques dizaines d'octets chacun) : un appareil resté longtemps hors ligne, ou restauré depuis une vieille sauvegarde, ne peut pas faire réapparaître une recette supprimée.

Déclencheurs (iOS) : au lancement, au retour au premier plan, 2 s après une modification, chaque minute au premier plan, au changement de disponibilité d'iCloud, et en tirant l'accueil vers le bas.

L'utilisateur peut désactiver iCloud sur un appareil (Réglages → Mes données) : l'appareil garde ses données et ne lit ni n'écrit plus le conteneur.

## Sans iCloud

Si l'utilisateur coupe iCloud, les données restent sur l'appareil (et dans sa sauvegarde iCloud s'il l'utilise). Pour les transférer : Réglages → Mes données → Exporter (fichier JSON), puis Importer sur l'autre appareil.

## Export / import

`exportData` produit `{ "format": "pepperedapron-export/1", "exportedAt", "records" }` (sans les tombstones). `importData` accepte ce format ou un fichier d'appareil, et **fusionne** avec la même règle que la synchro : rien n'est effacé, importer deux fois ne change rien.

## Cas limites couverts par les tests (`packages/client/test`)

iPhone et iPad simulés (bases SQLite séparées) partageant un faux iCloud : création, modification et suppression croisées ; modifications concurrentes ; suppression contre modification plus récente ; appareil restauré depuis une ancienne sauvegarde ; date système fausse ; favori ajouté hors ligne sur deux appareils ; iCloud indisponible puis de retour ; fichier en cours de téléchargement ou tronqué ; écriture interrompue puis app relancée ; format futur ; synchros simultanées ; nouvel appareil ; « effacer toutes mes données » propagé ; photos (envoi, téléchargement différé, nettoyage, photo partagée par une recette dupliquée) ; export/import.
