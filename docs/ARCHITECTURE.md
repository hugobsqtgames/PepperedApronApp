# Architecture PepperedApron

## 1. Choix technologiques (et pourquoi)

| Besoin | Choix | Raison |
|---|---|---|
| App iPhone et iPad | **Expo SDK 57 + React Native + Expo Router** (TypeScript) | Rendu natif (pas de WebView), modules natifs Swift (Share Extension, WidgetKit, ActivityKit, écoute des vidéos) via config plugins et modules locaux, builds cloud EAS. Uniquement iOS/iPadOS. |
| Données | **SQLite sur l'appareil** (`expo-sqlite`) | Seule source de vérité : instantané, hors ligne, transactionnel, inclus dans les sauvegardes de l'appareil. |
| Comptes | **Aucun** | Rien à créer, rien à pirater, rien à héberger ; RGPD simple : l'éditeur ne détient aucune donnée. |
| Synchro iPhone ↔ iPad | **iCloud Drive, conteneur privé de l'app** (`react-native-cloud-storage`) | Gratuit pour l'éditeur comme pour l'utilisateur, lié à son identifiant Apple, invisible dans l'app Fichiers. |
| Photos | Fichiers JPEG dans `Documents/photos` (1600 px, EXIF supprimé), copiés dans iCloud | Simples, sauvegardés, partagés entre recettes dupliquées. |
| Import de liens | **Sur l'appareil** : oEmbed (TikTok, YouTube), schema.org/JSON-LD, OpenGraph | Aucun intermédiaire ; le site importé voit l'appareil comme un navigateur. |
| Notifications | **Locales uniquement** (rappels de repas, planning, minuteurs) | Aucun serveur de push. |
| Publicité, analytics | **Aucune** | Aucun SDK tiers qui collecte des données : rien n'est envoyé à personne. |
| OCR | Sur l'appareil (`expo-text-extractor` : Apple Vision / ML Kit) | Gratuit, privé, hors ligne. |
| Site (confidentialité, aide) | HTML statique généré (`apps/site`), GitHub Pages | URL exigées par les stores, zéro coût, aucun cookie. |
| CI/CD | GitHub Actions + EAS Build/Submit | |

**Aucune API d'IA générative n'est utilisée.** Le parsing de recettes est déterministe (`packages/core/src/parse`).

## 2. Structure du dépôt

```
apps/
  mobile/      Expo Router (iOS, iPadOS) + cibles natives (targets/) + module local video-speech (modules/)
  site/        générateur du site statique (pages légales + aide, français et anglais)
packages/
  core/        Domaine pur TS : schémas zod, quantités/unités/fractions, mise à l'échelle,
               parseurs (ligne d'ingrédient, texte libre, JSON-LD), import de liens,
               recherche « langage naturel », rayons de courses, planning
  client/      Couche données indépendante de la plateforme : store SQLite (driver abstrait),
               horloge logique hybride, synchronisation iCloud (adaptateur abstrait),
               export/import, repositories. Testée sous Node avec better-sqlite3.
tools/brand/   logo, icônes, visuels de store
docs/
```

Règles : aucune logique métier dans les écrans ; les écrans lisent via des hooks (`useLive`, `useRepos`, `useCloudStatus`…) branchés sur les repositories de `packages/client` ; le seul code spécifique à iCloud est l'adaptateur `apps/mobile/src/services/icloud.ts`.

## 3. Modèle de données

Une table générique `records(entity, id, data JSON, deleted, hlc)` + `meta`. Les entités et leurs schémas (zod, `packages/core/src/schemas.ts`) :

| Entité | Contenu |
|---|---|
| `recipe` | titre, description, photo (`photoKey` = nom du fichier), temps, portions, difficulté, saisons, catégorie, four, notes, source, tags, ingrédients et étapes ordonnés |
| `favorite` | recette favorite — id déterministe (UUIDv5 de la recette) : jamais de doublon entre appareils |
| `collection`, `collectionItem` | collections et appartenance (id déterministe collection + recette) |
| `mealPlanEntry` | date, créneau (petit-déjeuner, déjeuner, goûter, dîner), recette ou titre libre, portions, position |
| `shoppingList`, `shoppingItem` | listes et articles (rayon, quantité, coché, position, recettes sources) |
| `shoppingCategory` | rayons personnalisés et ordre du magasin (id déterministe par clé) |
| `settings` | un seul enregistrement (thème, langue, unités, notifications, liste active, portions par défaut, onboarding) |

Les identifiants sont générés sur l'appareil (UUIDv7). Les écritures sont validées (zod) avant d'être enregistrées ; les données reçues d'un autre appareil ou d'une sauvegarde sont revalidées et ignorées si invalides.

## 4. Synchronisation

Résumé (détails dans [SYNC.md](SYNC.md)) : chaque modification reçoit un horodatage logique hybride ; chaque appareil écrit l'intégralité de son état dans **son propre fichier** `devices/<id>.json` du conteneur iCloud et fusionne les fichiers des autres appareils — pour chaque enregistrement, la modification la plus récente gagne, suppressions comprises (tombstones conservés). Aucun conflit iCloud possible puisque deux appareils n'écrivent jamais le même fichier.

## 5. Sécurité et vie privée

- Aucune donnée personnelle ne quitte l'appareil vers l'éditeur ; iCloud est chiffré par Apple et réservé au compte de l'utilisateur.
- Import de liens : schémas `http(s)` uniquement, délai et taille bornés, aucun cookie envoyé (`credentials: 'omit'`).
- Photos ré-encodées (EXIF/GPS supprimés) ; OCR sur l'appareil.
- Données venant d'iCloud ou d'un fichier importé : validées enregistrement par enregistrement ; un format plus récent est ignoré (jamais d'écrasement par une version inconnue).

## 6. Environnements

`development`, `staging`, `production` : identifiant d'app (`app.pepperedapron.com.dev`, `.staging`, sans suffixe), nom affiché, App Group et **conteneur iCloud distincts** (`iCloud.<bundleId>`) — les données de test ne se mélangent jamais aux vraies.

## 7. Coûts

Aucun coût d'infrastructure : pas de serveur, pas de base, pas de stockage de fichiers (iCloud est fourni par Apple à l'utilisateur), site sur GitHub Pages. Restent le compte Apple Developer (99 $/an) et éventuellement un nom de domaine.
